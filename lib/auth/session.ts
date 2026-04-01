// lib/auth/session.ts
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "./session-cookie-name";

/**
 * Crea una sesión para el usuario y establece la cookie httpOnly
 * La cookie es de tipo "sesión" (se borra al cerrar el navegador)
 * Si en el futuro se requiere "Recordarme", se puede agregar un parámetro opcional
 * para usar cookies persistentes con maxAge
 */
export async function createSession(userId: string, rememberMe: boolean = false): Promise<void> {
  const cookieStore = await cookies();
  
  // Crear token de sesión (simple, puede mejorarse con JWT si se requiere)
  const sessionToken = `${userId}:${Date.now()}:${Math.random().toString(36).substring(7)}`;
  
  const isProduction = process.env.NODE_ENV === "production";
  
  // Configuración base de la cookie
  const cookieOptions: Parameters<typeof cookieStore.set>[2] = {
    httpOnly: true,
    secure: isProduction, // Solo HTTPS en producción
    sameSite: "lax",
    path: "/",
  };
  
  // Si "Recordarme" está activado, usar cookie persistente (30 días)
  // Si no, usar cookie de sesión (se borra al cerrar el navegador)
  if (rememberMe) {
    const SESSION_TTL_DAYS = 30;
    const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    cookieOptions.maxAge = SESSION_TTL_MS / 1000; // En segundos
  }
  // Si rememberMe es false, no agregamos maxAge, haciendo que sea una cookie de sesión
  
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, cookieOptions);
}

/**
 * Destruye la sesión actual eliminando la cookie
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Obtiene el userId de la sesión actual desde la cookie
 * Retorna null si no hay sesión válida
 */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionToken) {
    return null;
  }
  
  // Extraer userId del token (formato: userId:timestamp:random)
  const parts = sessionToken.split(":");
  if (parts.length < 1) {
    return null;
  }
  
  const userId = parts[0];
  
  // Validar que el usuario existe
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  
  if (!user) {
    return null;
  }
  
  return userId;
}

/**
 * Obtiene el usuario completo desde la sesión
 * Retorna null si no hay sesión válida
 */
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  
  if (!userId) {
    return null;
  }
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
  
  return user;
}

// Re-export para compatibilidad con routes que ya usan SESSION_COOKIE_NAME_EXPORT.
// El middleware debe importar desde session-cookie-name.ts directamente (edge-safe).
export { SESSION_COOKIE_NAME as SESSION_COOKIE_NAME_EXPORT } from "./session-cookie-name";

