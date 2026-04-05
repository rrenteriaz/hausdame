"use server";

import prisma from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function updateProfileAction(
  formData: FormData
): Promise<{ success?: true; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "No autenticado" };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (name.length === 0) return { error: "El nombre es requerido" };
  if (name.length > 100) return { error: "El nombre es demasiado largo" };

  await prisma.user.update({
    where: { id: userId },
    data: { name },
  });

  return { success: true };
}

export async function changePasswordAction(
  formData: FormData
): Promise<{ success?: true; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "No autenticado" };

  const currentPassword = (formData.get("currentPassword") as string | null) ?? "";
  const newPassword = (formData.get("newPassword") as string | null) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";

  if (!currentPassword) return { error: "Ingresa tu contraseña actual" };
  if (!newPassword) return { error: "Ingresa la nueva contraseña" };
  if (newPassword.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres" };
  if (newPassword !== confirmPassword) return { error: "Las contraseñas no coinciden" };

  // Fetch user con hashedPassword (no incluido en getCurrentUser select)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hashedPassword: true },
  });

  if (!user) return { error: "Usuario no encontrado" };
  if (!user.hashedPassword) return { error: "Esta cuenta no tiene contraseña configurada" };

  const isValid = await verifyPassword(currentPassword, user.hashedPassword);
  if (!isValid) return { error: "La contraseña actual es incorrecta" };

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { hashedPassword: hashed },
  });

  return { success: true };
}
