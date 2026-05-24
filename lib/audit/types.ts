// lib/audit/types.ts
// Typed contract for audit events.
// Extend by adding new action literals — DO NOT remove existing ones.
// Future MLM actions are listed as comments to reserve the namespace.

export type AuditAction =
  // Property lifecycle
  | "property.create"
  | "property.update"
  | "property.deactivate"
  // Inventory
  | "inventory.item.create"
  | "inventory.item.update"
  | "inventory.item.archive"
  | "inventory.line.update"
  | "inventory.template.apply"
  // Membership & team
  | "membership.invite.send"
  | "membership.invite.accept"
  | "membership.remove"
  | "team.create"
  | "team.update"
  // Task operations
  | "task.job.complete"
  | "task.job.force_complete"
  | "task.template.create"
  | "task.template.update"
  // Session
  | "auth.login"
  | "auth.logout"
  // System / automation
  | "system.ical.sync"
  | "system.task.generate"
  // ── MLM governance (reserved — DO NOT implement yet) ──────────────────
  // | "distributor.onboard"
  // | "distributor.rank.change"
  // | "commission.record"
  // | "commission.approve"
  // | "payout.create"
  // | "genealogy.link"
  // | "genealogy.unlink"
  ;

export type AuditResource =
  | "Property"
  | "PropertyZone"
  | "InventoryItem"
  | "InventoryLine"
  | "InventoryLog"
  | "Membership"
  | "Team"
  | "TaskJob"
  | "TaskTemplate"
  | "User"
  | "Tenant"
  // ── MLM governance (reserved) ─────────────────────────────────────────
  // | "Distributor"
  // | "Commission"
  // | "Payout"
  // | "GenealogyLink"
  ;

export interface AuditEventInput {
  tenantId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}
