"use server";

import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { skipRecurringDue, assignRecurringDueToCleaning } from "@/lib/tareas-pro/recurring-due";

export async function skipRecurringDueAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const dueId = String(formData.get("dueId") || "");
  const skipReason = String(formData.get("skipReason") || "").trim() || undefined;
  if (!dueId) throw new Error("Datos incompletos");

  await skipRecurringDue(dueId, tenantId, skipReason);
  revalidatePath("/host/tareas-pro/pendientes");
}

export async function assignRecurringDueAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const dueId = String(formData.get("dueId") || "");
  const cleaningId = String(formData.get("cleaningId") || "");
  if (!dueId || !cleaningId) throw new Error("Datos incompletos");

  await assignRecurringDueToCleaning(dueId, cleaningId, tenantId);
  revalidatePath("/host/tareas-pro/pendientes");
}
