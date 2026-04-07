"use server";

// app/host/tareas-pro/actions.ts
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateTaskJob } from "@/lib/tareas-pro/job-generation";
import { TaskTemplateStatus } from "@prisma/client";

// =====================================================================
// TEMPLATE CRUD
// =====================================================================

export async function createTaskTemplate(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const propertyId = String(formData.get("propertyId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;

  if (!propertyId || !name) throw new Error("Datos incompletos");

  // Verificar que la propiedad pertenece al tenant del host
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
  });
  if (!property) throw new Error("Propiedad no encontrada");

  const template = await prisma.taskTemplate.create({
    data: {
      tenantId,
      propertyId,
      name,
      description,
      status: "DRAFT",
    },
  });

  // Crear schedule por defecto (MANUAL, LIMITED, 2 intentos)
  await prisma.taskTemplateSchedule.create({
    data: {
      tenantId,
      templateId: template.id,
      frequency: "MANUAL",
      carryForwardPolicy: "LIMITED",
      maxCarryForwardAttempts: 2,
    },
  });

  revalidatePath("/host/tareas-pro");
  redirect(`/host/tareas-pro/${template.id}`);
}

export async function updateTaskTemplate(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const templateId = String(formData.get("templateId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const status = String(formData.get("status") || "") as TaskTemplateStatus;

  if (!templateId || !name) throw new Error("Datos incompletos");

  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) throw new Error("Template no encontrado");

  await prisma.taskTemplate.update({
    where: { id: templateId },
    data: { name, description, status: status || undefined },
  });

  revalidatePath(`/host/tareas-pro/${templateId}`);
  revalidatePath("/host/tareas-pro");
}

export async function updateTaskTemplateSchedule(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const templateId = String(formData.get("templateId") || "");
  const frequency = String(formData.get("frequency") || "MANUAL") as any;
  const carryForwardPolicy = String(formData.get("carryForwardPolicy") || "LIMITED") as any;
  const maxCarryForwardAttempts = parseInt(
    String(formData.get("maxCarryForwardAttempts") || "2"),
    10
  );

  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) throw new Error("Template no encontrado");

  await prisma.taskTemplateSchedule.upsert({
    where: { templateId },
    create: {
      tenantId,
      templateId,
      frequency,
      carryForwardPolicy,
      maxCarryForwardAttempts,
    },
    update: {
      frequency,
      carryForwardPolicy,
      maxCarryForwardAttempts,
    },
  });

  revalidatePath(`/host/tareas-pro/${templateId}`);
}

export async function deleteTaskTemplate(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const templateId = String(formData.get("templateId") || "");

  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) throw new Error("Template no encontrado");

  await prisma.taskTemplate.delete({ where: { id: templateId } });

  revalidatePath("/host/tareas-pro");
  redirect("/host/tareas-pro");
}

// =====================================================================
// SECCIONES
// =====================================================================

export async function createTaskSection(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const templateId = String(formData.get("templateId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const sectionType = String(formData.get("sectionType") || "STANDARD") as any;
  const requiresGlobalConfirm = formData.get("requiresGlobalConfirm") === "true";

  if (!templateId || !name) throw new Error("Datos incompletos");

  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) throw new Error("Template no encontrado");

  // Orden: al final
  const maxOrder = await prisma.taskSectionTemplate.aggregate({
    where: { templateId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  await prisma.taskSectionTemplate.create({
    data: {
      tenantId,
      templateId,
      name,
      description,
      sectionType,
      requiresGlobalConfirm,
      order,
    },
  });

  revalidatePath(`/host/tareas-pro/${templateId}`);
}

export async function updateTaskSection(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sectionId = String(formData.get("sectionId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const sectionType = String(formData.get("sectionType") || "STANDARD") as any;
  const requiresGlobalConfirm = formData.get("requiresGlobalConfirm") === "true";

  const section = await prisma.taskSectionTemplate.findFirst({
    where: { id: sectionId, tenantId },
  });
  if (!section) throw new Error("Sección no encontrada");

  await prisma.taskSectionTemplate.update({
    where: { id: sectionId },
    data: { name, description, sectionType, requiresGlobalConfirm },
  });

  revalidatePath(`/host/tareas-pro/${section.templateId}`);
}

export async function deleteTaskSection(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sectionId = String(formData.get("sectionId") || "");

  const section = await prisma.taskSectionTemplate.findFirst({
    where: { id: sectionId, tenantId },
  });
  if (!section) throw new Error("Sección no encontrada");

  await prisma.taskSectionTemplate.delete({ where: { id: sectionId } });
  revalidatePath(`/host/tareas-pro/${section.templateId}`);
}

// =====================================================================
// PASOS
// =====================================================================

export async function createTaskStep(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sectionId = String(formData.get("sectionId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const responseType = String(formData.get("responseType") || "NONE") as any;
  const isRequired = formData.get("isRequired") !== "false";
  const blocksCompletion = formData.get("blocksCompletion") === "true";

  if (!sectionId || !name) throw new Error("Datos incompletos");

  const section = await prisma.taskSectionTemplate.findFirst({
    where: { id: sectionId, tenantId },
  });
  if (!section) throw new Error("Sección no encontrada");

  const maxOrder = await prisma.taskStepTemplate.aggregate({
    where: { sectionId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  await prisma.taskStepTemplate.create({
    data: {
      tenantId,
      sectionId,
      name,
      description,
      responseType,
      isRequired,
      blocksCompletion,
      order,
    },
  });

  revalidatePath(`/host/tareas-pro/${section.templateId}`);
}

export async function updateTaskStep(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const responseType = String(formData.get("responseType") || "NONE") as any;
  const isRequired = formData.get("isRequired") !== "false";
  const blocksCompletion = formData.get("blocksCompletion") === "true";

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Paso no encontrado");

  await prisma.taskStepTemplate.update({
    where: { id: stepId },
    data: { name, description, responseType, isRequired, blocksCompletion },
  });

  revalidatePath(`/host/tareas-pro/${step.section.templateId}`);
}

export async function deleteTaskStep(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Paso no encontrado");

  await prisma.taskStepTemplate.delete({ where: { id: stepId } });
  revalidatePath(`/host/tareas-pro/${step.section.templateId}`);
}

// =====================================================================
// GENERACIÓN MANUAL DE JOB
// =====================================================================

export async function generateTaskJobAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const templateId = String(formData.get("templateId") || "");
  const propertyId = String(formData.get("propertyId") || "");
  const cleaningId = String(formData.get("cleaningId") || "") || undefined;
  const assignedUserId = String(formData.get("assignedUserId") || "") || undefined;

  if (!templateId || !propertyId) throw new Error("Datos incompletos");

  const job = await generateTaskJob({
    tenantId,
    templateId,
    propertyId,
    cleaningId,
    assignedUserId,
    actorId: user.id,
  });

  revalidatePath("/host/tareas-pro/jobs");
  redirect(`/host/tareas-pro/jobs/${job.id}`);
}
