/**
 * Nombre de la cookie de sesión — exportado en archivo independiente
 * para que el middleware (edge runtime) pueda importarlo sin arrastrar
 * los imports de Prisma / next/headers que están en session.ts.
 */
export const SESSION_COOKIE_NAME = "hausdame_session";
