// lib/auth/requireUser.ts
import { redirect } from "next/navigation";
import { getCurrentUser, getSessionUserId } from "./session";
import type { UserRole } from "@/lib/generated/prisma";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Requiere que haya un usuario autenticado
 * Si no hay sesión, redirige a /login
 * Retorna el usuario autenticado
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  return user as AuthenticatedUser;
}

/**
 * Requiere que el usuario tenga rol HOST (OWNER, ADMIN, MANAGER, AUXILIAR)
 * Si no cumple, redirige según el role
 */
export async function requireHostUser(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  
  const allowedHostRoles = ["OWNER", "ADMIN", "MANAGER", "AUXILIAR"];
  
  if (user.role === "CLEANER") {
    // Cleaner intentando acceder a /host -> redirigir a /cleaner
    redirect("/cleaner");
  }
  
  if (!allowedHostRoles.includes(user.role)) {
    // Role no permitido -> redirigir a /cleaner
    redirect("/cleaner");
  }
  
  return user;
}

/**
 * Requiere que el usuario tenga rol CLEANER
 * Si no cumple, redirige según el role
 */
export async function requireCleanerUser(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  
  const hostRoles = ["OWNER", "ADMIN", "MANAGER", "AUXILIAR"];
  
  if (hostRoles.includes(user.role)) {
    // User con role de host intentando acceder a /cleaner -> redirigir a /host
    redirect("/host");
  }
  
  if (user.role !== "CLEANER") {
    // Role no permitido -> redirigir a /host
    redirect("/host");
  }
  
  return user;
}

/**
 * Obtiene el userId de la sesión sin redirigir
 * Útil para casos donde no es crítico tener sesión
 */
export async function getOptionalUserId(): Promise<string | null> {
  return getSessionUserId();
}

