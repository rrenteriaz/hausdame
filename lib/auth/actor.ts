// lib/auth/actor.ts
// ActorContext: lightweight snapshot of who is performing an operation.
// Used by audit events and future governance checks.
// Keep minimal — do not add permission checks here.

import type { UserRole } from "@/lib/generated/prisma";
import type { AuthenticatedUser } from "./requireUser";

export interface ActorContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

export function toActorContext(user: AuthenticatedUser): ActorContext {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  };
}
