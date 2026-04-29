"use server";

import prisma from "@/lib/prisma";
import { requireCleanerUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { hashPassword } from "@/lib/auth/password";

export type UpdateCleanerProfileInput = {
  nickname?: string | null;
  fullName: string;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export async function updateCleanerProfile(input: UpdateCleanerProfileInput) {
  const user = await requireCleanerUser();

  const fullName = (input.fullName ?? "").toString().trim();
  if (!fullName) {
    throw new Error("El nombre completo es requerido.");
  }

  const nicknameRaw = input.nickname?.toString().trim() ?? "";
  const nickname = nicknameRaw ? nicknameRaw : null;

  const phoneRaw = input.phone?.toString().trim() ?? "";
  const phone = phoneRaw ? phoneRaw : null;

  const addressLine1 = input.addressLine1?.toString().trim() || null;
  const addressLine2 = input.addressLine2?.toString().trim() || null;
  const neighborhood = input.neighborhood?.toString().trim() || null;
  const city = input.city?.toString().trim() || null;
  const state = input.state?.toString().trim() || null;
  const postalCode = input.postalCode?.toString().trim() || null;
  const country = input.country?.toString().trim() || "MX";
  const latitude = typeof input.latitude === "number" ? input.latitude : null;
  const longitude = typeof input.longitude === "number" ? input.longitude : null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { name: nickname },
    });

    await tx.cleanerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fullName,
        phone,
        addressLine1,
        addressLine2,
        neighborhood,
        city,
        state,
        postalCode,
        country,
        latitude,
        longitude,
      },
      update: {
        fullName,
        phone,
        addressLine1,
        addressLine2,
        neighborhood,
        city,
        state,
        postalCode,
        country,
        latitude,
        longitude,
      },
    });
  });

  revalidatePath("/cleaner/profile");
  revalidatePath("/cleaner");

  return { ok: true as const };
}

/**
 * Resuelve una URL de Google Maps (incluyendo cortas como maps.app.goo.gl)
 * y devuelve la URL final tras redirecciones. No requiere autenticación de usuario.
 */
export async function resolveGoogleMapsUrl(rawUrl: string): Promise<{ finalUrl: string }> {
  const url = rawUrl.trim();

  // Solo permitimos dominios de Google Maps
  const allowed =
    url.startsWith("https://maps.google") ||
    url.startsWith("https://www.google.com/maps") ||
    url.startsWith("https://goo.gl/maps") ||
    url.startsWith("https://maps.app.goo.gl");

  if (!allowed) {
    throw new Error("URL no reconocida como enlace de Google Maps.");
  }

  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" },
    // No almacenamos cookies ni credenciales
    credentials: "omit",
  });

  return { finalUrl: res.url };
}

export async function changePassword(input: { newPassword: string }) {
  const user = await requireCleanerUser();

  if (input.newPassword.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  const hashed = await hashPassword(input.newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword: hashed },
  });

  return { ok: true as const };
}


