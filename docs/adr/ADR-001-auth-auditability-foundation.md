# ADR-001: Auth and Auditability Foundation

**Status:** Accepted  
**Date:** 2026-05-22  
**Context:** Pre-MLM governance foundation

---

## Context

Hausdame is preparing to introduce a multi-level referral / distributor model (MLM runtime).
Before any MLM logic is implemented, the system needs a deterministic governance foundation:

- **Who performed every critical mutation** (actor tracking)
- **What changed and when** (immutable audit trail)
- **Provable traceability** for future financial operations (commissions, payouts)
- **Authorization primitives** that won't need rewiring once MLM roles arrive

The current system has:
- Cookie-based sessions (userId → DB lookup on every request)
- `requireHostUser()` / `requireCleanerUser()` enforcing role gates
- Three domain-specific event logs (`TaskJobEventLog`, `InventoryLog`, `MetricEvent`) — all sparse and non-unified
- Manual `tenantId` enforcement in every server action
- No global audit trail

---

## Decision

### 1. AuditLog — append-only global event log

A new `AuditLog` Prisma model serves as the unified governance table.

**Key design choices:**

| Decision | Rationale |
|---|---|
| `createdAt` only — no `updatedAt` | Signals append-only at the schema level. Any ORM migration that adds `updatedAt` must be rejected. |
| `onDelete: SetNull` on actor and tenant | Audit records survive user/tenant deletion. Financial traceability cannot have cascading gaps. |
| `action` as `String`, not a DB enum | DB enums require migrations to extend. A string field + TypeScript `AuditAction` union gives compile-time safety with zero DB friction. |
| `actorRole` as snapshot, not FK | Role at event time is immutable business fact. Looking up current role would give wrong answer for historical events. |
| `metadata` as `Json?` | Flexible context (diffs, reasons, partial snapshots) without schema churn. |
| No `updatedBy` / `deletedBy` on existing models | Domain models already have `archivedAt` / `isActive` patterns. Retrofitting actor fields on mutations is a future phase. |

### 2. ActorContext — lightweight actor snapshot

`lib/auth/actor.ts` defines `ActorContext` and `toActorContext(user)`.

Used in server actions to pass `actorId` + `actorRole` to `writeAuditEvent`.  
**Not** a permission system — purely an identity carrier for audit context.

### 3. AuditAction / AuditResource — typed contract

`lib/audit/types.ts` defines `AuditAction` and `AuditResource` as TypeScript union types.

- Adding a new action = add a literal to the union (zero DB change)
- MLM actions are pre-reserved as comments to prevent namespace collisions
- Removing actions is disallowed — old records would lose type coverage

### 4. writeAuditEvent — non-blocking fire-and-forget

`lib/audit/log.ts` wraps `prisma.auditLog.create` in a try/catch.  
Audit failures **never block** the calling mutation — this is intentional.

Rationale: If an inventory update succeeds but the audit write fails, losing the audit record is preferable to rolling back the user's mutation. Observability (console.error) + future retry queue will handle failures.

**Not wired to any action yet.** Foundation only.

---

## Consequences

### Positive

- Every future server action can add `writeAuditEvent(...)` in one line
- MLM commission/payout events can reference `AuditLog.id` for traceability
- `actorRole` snapshots eliminate historical ambiguity when roles change
- TypeScript union forces compile-time awareness of event types
- `onDelete: SetNull` means financial audit survives tenant offboarding

### Risks mitigated

| Risk | Mitigation |
|---|---|
| Audit table becomes a bottleneck | Non-blocking call; future: async queue |
| Actor snapshot stale | Snapshot taken at call time (not retrieved later) |
| Namespace collision with MLM | Reserved comment block in AuditAction union |
| AuditLog accidentally mutated | Convention + future DB-level row security policy |

### Risks accepted

| Risk | Note |
|---|---|
| No DB-enforced immutability yet | Postgres row security / triggers are a future hardening phase |
| Audit writes not retried on failure | Acceptable for operational events; financial events need retry queue (MLM phase) |

---

## Explicitly out of scope

This ADR does NOT address:

- Compensation engine
- Commission or payout logic
- Genealogy / referral chains
- Distributor onboarding
- Admin dashboards
- Role-based permission expansion (beyond current OWNER/ADMIN/CLEANER/HANDYMAN)
- Wallet or balance tracking

---

## Files created / modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `AuditLog` model; `auditLogs` relation on `Tenant` and `User` |
| `lib/auth/actor.ts` | `ActorContext` type + `toActorContext()` helper |
| `lib/audit/types.ts` | `AuditAction`, `AuditResource`, `AuditEventInput` types |
| `lib/audit/log.ts` | `writeAuditEvent()` — non-blocking DB write |
| `docs/adr/ADR-001-auth-auditability-foundation.md` | This document |

---

## Recommended next phase

1. Wire `writeAuditEvent` to the 3–5 highest-value mutations (property.create, task.complete, membership.invite.accept)
2. Add `requireOwnerUser()` helper when OWNER-only governance gates are needed
3. Add DB-level row security on `AuditLog` (Postgres policy: INSERT only, no UPDATE/DELETE)
4. Before MLM: extend `AuditAction` union with distributor/commission namespaces + design `ActorContext` extension for cross-tenant referral actors
