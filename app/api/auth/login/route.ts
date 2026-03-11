// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import {
  validateRedirect,
  AUTH_REDIRECT_PREFIXES,
} from "@/lib/auth/validateRedirect";

/**
 * POST /api/auth/login
 * Login con email o teléfono + contraseña
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, password, redirect } = body;

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "identifier y password son requeridos" },
        { status: 400 }
      );
    }

    // Rate limiting por IP + identifier
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimitKey = `login:${ip}:${identifier}`;
    
    if (!checkRateLimit(rateLimitKey, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
        { status: 429 }
      );
    }

    // Buscar usuario por email o teléfono
    // Nota: Si el modelo User no tiene campo phone, solo buscar por email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          // Si hay campo phone, descomentar:
          // { phone: identifier },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        hashedPassword: true,
      },
    });

    // Logging temporal para diagnóstico
    if (process.env.NODE_ENV === "development") {
      console.log("[LOGIN DEBUG] Identifier:", identifier);
      console.log("[LOGIN DEBUG] User found:", !!user);
      if (user) {
        console.log("[LOGIN DEBUG] User email:", user.email);
        console.log("[LOGIN DEBUG] User has password:", !!user.hashedPassword);
        console.log("[LOGIN DEBUG] User role:", user.role);
      }
    }

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        console.log("[LOGIN DEBUG] ❌ Usuario no encontrado para:", identifier);
      }
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (!user.hashedPassword) {
      if (process.env.NODE_ENV === "development") {
        console.log("[LOGIN DEBUG] ❌ Usuario sin contraseña configurada:", user.email);
        console.log("[LOGIN DEBUG] 💡 Usa: npx tsx scripts/set-password.ts <email> <password>");
      }
      return NextResponse.json(
        { error: "Usuario sin contraseña configurada. Contacta al administrador." },
        { status: 401 }
      );
    }

    // Verificar contraseña
    let isValid = false;
    try {
      isValid = await verifyPassword(password, user.hashedPassword);
    } catch (error: any) {
      console.error("[LOGIN DEBUG] ❌ Error verificando contraseña:", error);
      return NextResponse.json(
        { error: "Error verificando contraseña" },
        { status: 500 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[LOGIN DEBUG] Password valid:", isValid);
      if (!isValid) {
        console.log("[LOGIN DEBUG] ❌ Contraseña incorrecta para:", user.email);
      }
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    // Determinar redirección: validar redirect param, default seguro según rol
    const validatedRedirect = validateRedirect(redirect, [
      ...AUTH_REDIRECT_PREFIXES,
    ]);
    const redirectTo =
      validatedRedirect ??
      (user.role === "CLEANER" ? "/cleaner" : "/host/hoy");

    // Crear respuesta PRIMERO
    const response = NextResponse.json({
      ok: true,
      redirectTo,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    });

    // Crear sesión DESPUÉS de crear la respuesta
    // Esto asegura que la cookie se establezca correctamente
    const sessionToken = `${user.id}:${Date.now()}:${Math.random().toString(36).substring(7)}`;
    const isProduction = process.env.NODE_ENV === "production";
    
    response.cookies.set("hausdame_session", sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });

    // LIMPIAR COOKIES CRUZADAS según el contexto
    if (user.role === "CLEANER") {
      // Login como CLEANER: limpiar cookies de host si existen
      // (No hay cookies específicas de host además de hausdame_session, pero limpiamos cleaner legacy)
      response.cookies.delete("hd_cleaner_member_id"); // Limpiar legacy si existe
    } else {
      // Login como HOST: limpiar cookies de cleaner
      response.cookies.delete("hd_cleaner_member_id");
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[LOGIN DEBUG] Session cookie set:", sessionToken.substring(0, 20) + "...");
    }

    return response;
  } catch (error: any) {
    console.error("Error en login:", error);
    return NextResponse.json(
      { error: error.message || "Error en el login" },
      { status: 500 }
    );
  }
}

