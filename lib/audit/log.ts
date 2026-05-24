// lib/audit/log.ts
// Writes an immutable audit event to AuditLog.
//
// GOVERNANCE RULES (enforced by convention, not runtime):
// - Call AFTER a successful mutation, never before.
// - Never wrap mutations inside this call.
// - Audit failures MUST NOT block the main operation (see catch).
// - Never delete or update AuditLog records — append-only by design.
//
// USAGE: not wired to any action yet. Foundation only.

import prisma from "@/lib/prisma";
import type { AuditEventInput } from "./types";

export async function writeAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId:   event.tenantId   ?? null,
        actorId:    event.actorId    ?? null,
        actorRole:  event.actorRole  ?? null,
        action:     event.action,
        resource:   event.resource,
        resourceId: event.resourceId ?? null,
        metadata:   event.metadata as object ?? undefined,
        ip:         event.ip         ?? null,
      },
    });
  } catch (error) {
    // Audit failures are logged but never propagated.
    // The calling action has already committed — blocking would be a regression.
    console.error("[AUDIT] writeAuditEvent failed:", event.action, event.resource, error);
  }
}
