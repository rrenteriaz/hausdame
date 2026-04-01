// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME as SESSION_COOKIE_NAME_EXPORT } from "@/lib/auth/session-cookie-name";

const CLEANER_MEMBER_COOKIE = "hd_cleaner_member_id";

/**
 * Middleware simplificado: solo verifica cookies y limpia cookies cruzadas
 * La validación de role se hace en los layouts server components (que SÍ pueden hacer queries a DB)
 * para evitar errores de WebSocket en Edge Runtime
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME_EXPORT);
  const cleanerMemberCookie = request.cookies.get(CLEANER_MEMBER_COOKIE);

  // Ruta /app: redirigir según sesión (el page.tsx lo maneja)
  if (pathname === "/app") {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  const isHostPath = pathname.startsWith("/host");
  const isCleanerPath = pathname.startsWith("/cleaner");

  // Solo procesar rutas /host/* y /cleaner/*
  if (!isHostPath && !isCleanerPath) {
    return NextResponse.next();
  }

  // Crear respuesta base
  const response = NextResponse.next();

  // LIMPIAR COOKIES CRUZADAS según el contexto
  if (isHostPath) {
    // En /host: limpiar cookie de cleaner si existe (evitar "both")
    if (cleanerMemberCookie) {
      response.cookies.delete(CLEANER_MEMBER_COOKIE);
    }

    // Si no hay sesión, redirigir a login
    // La validación de role se hace en los layouts server components
    if (!sessionCookie) {
      const redirect = NextResponse.redirect(new URL("/login", request.url));
      // Eliminar cookie legacy también en el response de redirect
      if (cleanerMemberCookie) {
        redirect.cookies.delete(CLEANER_MEMBER_COOKIE);
      }
      return redirect;
    }
  }

  if (isCleanerPath) {
    // En /cleaner: limpiar cookie legacy si existe (higiene defensiva)
    // MODERNO: /cleaner/* SIEMPRE requiere sesión (no más bypass por cookie legacy)
    if (cleanerMemberCookie) {
      response.cookies.delete(CLEANER_MEMBER_COOKIE);
    }

    // SIEMPRE requerir sesión para /cleaner/* (retirado bypass legacy)
    if (!sessionCookie) {
      const redirect = NextResponse.redirect(new URL("/login", request.url));
      // Eliminar cookie legacy también en el response de redirect (higiene)
      if (cleanerMemberCookie) {
        redirect.cookies.delete(CLEANER_MEMBER_COOKIE);
      }
      return redirect;
    }
  }

  // Permitir acceso (la validación de role se hace en los layouts server components)
  return response;
}

export const config = {
  matcher: [
    /*
     * Match only protected routes: /host/* and /cleaner/*
     * Also match /app for routing
     */
    "/app",
    "/host/(.*)",
    "/cleaner/(.*)",
  ],
};

