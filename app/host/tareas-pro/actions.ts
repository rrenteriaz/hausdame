"use server";

// app/host/tareas-pro/actions.ts
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidTimezone } from "@/lib/tareas-pro/domain/schedule-anchor";
import { TaskTemplateStatus } from "@/lib/generated/prisma";

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

  // Auto-crear sección "General" para empezar a agregar tareas de inmediato
  await prisma.taskSectionTemplate.create({
    data: {
      tenantId,
      templateId: template.id,
      name: "General",
      sectionType: "STANDARD",
      order: 0,
    },
  });

  revalidatePath("/host/tareas-pro");
  redirect(`/host/tareas-pro/${template.id}`);
}

export async function reorderTaskTemplates(orderedIds: string[]) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.taskTemplate.updateMany({
        where: { id, tenantId },
        data: { displayOrder: index },
      })
    )
  );
  revalidatePath("/host/tareas-pro");
}

export async function updateTaskTemplateStatus(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const templateId = String(formData.get("templateId") || "");
  const status = String(formData.get("status") || "") as TaskTemplateStatus;

  const template = await prisma.taskTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!template) throw new Error("Template no encontrado");

  await prisma.taskTemplate.update({ where: { id: templateId }, data: { status } });

  revalidatePath(`/host/tareas-pro/${templateId}`);
  revalidatePath("/host/tareas-pro");
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
    10,
  );

  // Anchor fields — solo relevantes para WEEKLY / MONTHLY
  const rawDayOfWeek = formData.get("anchorDayOfWeek");
  const rawDayOfMonth = formData.get("anchorDayOfMonth");
  const rawTimezone = String(formData.get("timezone") || "").trim();

  const parsedDayOfWeek =
    rawDayOfWeek !== null && rawDayOfWeek !== ""
      ? parseInt(String(rawDayOfWeek), 10)
      : null;
  const parsedDayOfMonth =
    rawDayOfMonth !== null && rawDayOfMonth !== ""
      ? parseInt(String(rawDayOfMonth), 10)
      : null;

  // Validación de timezone: debe ser IANA válida si viene informada
  if (rawTimezone && !isValidTimezone(rawTimezone)) {
    throw new Error(
      `Zona horaria inválida: "${rawTimezone}". Usa formato IANA, ej. "America/Mexico_City".`,
    );
  }

  // Validación estricta: anclas requeridas para frecuencias programadas
  if (frequency === "WEEKLY") {
    if (parsedDayOfWeek === null || parsedDayOfWeek < 0 || parsedDayOfWeek > 6) {
      throw new Error("La frecuencia Semanal requiere un día de la semana (0=domingo … 6=sábado).");
    }
  }
  if (frequency === "MONTHLY") {
    if (parsedDayOfMonth === null || parsedDayOfMonth < 1 || parsedDayOfMonth > 28) {
      throw new Error("La frecuencia Mensual requiere un día del mes entre 1 y 28.");
    }
  }

  // Normalización: limpiar anchors que no corresponden a la frecuencia elegida
  const anchorDayOfWeek = frequency === "WEEKLY" ? parsedDayOfWeek : null;
  const anchorDayOfMonth = frequency === "MONTHLY" ? parsedDayOfMonth : null;
  const timezone =
    frequency === "DAILY" || frequency === "WEEKLY" || frequency === "MONTHLY"
      ? rawTimezone || null
      : null;

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
      anchorDayOfWeek,
      anchorDayOfMonth,
      timezone,
    },
    update: {
      frequency,
      carryForwardPolicy,
      maxCarryForwardAttempts,
      anchorDayOfWeek,
      anchorDayOfMonth,
      timezone,
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
    include: { _count: { select: { jobs: true } } },
  });
  if (!template) throw new Error("Template no encontrado");

  if (template._count.jobs === 0) {
    // Sin historial — hard delete seguro
    await prisma.taskTemplate.delete({ where: { id: templateId } });
  } else {
    // Con historial — soft delete: ocultar completamente sin borrar los jobs
    await prisma.taskTemplate.update({
      where: { id: templateId },
      data: { status: "DELETED" },
    });
  }

  revalidatePath("/host/tareas-pro");
  redirect("/host/tareas-pro");
}

export async function archiveTaskTemplate(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const templateId = String(formData.get("templateId") || "");

  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) throw new Error("Template no encontrado");

  await prisma.taskTemplate.update({
    where: { id: templateId },
    data: { status: "INACTIVE" },
  });

  revalidatePath("/host/tareas-pro");
  revalidatePath(`/host/tareas-pro/${templateId}`);
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

  const section = await prisma.taskSectionTemplate.create({
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
  return { id: section.id, name: section.name, sectionType: section.sectionType, order: section.order, steps: [] as any[] };
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
  const capturesYesNo = formData.get("capturesYesNo") === "true";
  const yesNoRequired = formData.get("yesNoRequired") === "true";
  const capturesNumber = formData.get("capturesNumber") === "true";
  const numberRequired = formData.get("numberRequired") === "true";
  const capturesPhoto = formData.get("capturesPhoto") === "true";
  const photoRequired = formData.get("photoRequired") === "true";
  const capturesText = formData.get("capturesText") === "true";
  const textRequired = formData.get("textRequired") === "true";
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

  const step = await prisma.taskStepTemplate.create({
    data: {
      tenantId,
      sectionId,
      name,
      description,
      capturesYesNo,
      yesNoRequired,
      capturesNumber,
      numberRequired,
      capturesPhoto,
      photoRequired,
      capturesText,
      textRequired,
      isRequired,
      blocksCompletion,
      order,
      captureVersion: "MULTI_CAPTURE_V2",
    },
  });

  revalidatePath(`/host/tareas-pro/${section.templateId}`);
  return {
    id: step.id,
    name: step.name,
    stepFrequency: step.stepFrequency,
    stepAnchorDayOfWeek: step.stepAnchorDayOfWeek,
    stepAnchorDayOfMonth: step.stepAnchorDayOfMonth,
    intervalDays: step.intervalDays,
    startDate: step.startDate,
    order: step.order,
    capturesYesNo: step.capturesYesNo,
    yesNoRequired: step.yesNoRequired,
    capturesNumber: step.capturesNumber,
    numberRequired: step.numberRequired,
    capturesPhoto: step.capturesPhoto,
    photoRequired: step.photoRequired,
    capturesText: step.capturesText,
    textRequired: step.textRequired,
    captureVersion: step.captureVersion,
  };
}

export async function updateTaskStep(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const capturesYesNo = formData.get("capturesYesNo") === "true";
  const yesNoRequired = formData.get("yesNoRequired") === "true";
  const capturesNumber = formData.get("capturesNumber") === "true";
  const numberRequired = formData.get("numberRequired") === "true";
  const capturesPhoto = formData.get("capturesPhoto") === "true";
  const photoRequired = formData.get("photoRequired") === "true";
  const capturesText = formData.get("capturesText") === "true";
  const textRequired = formData.get("textRequired") === "true";
  const isRequired = formData.get("isRequired") !== "false";
  const blocksCompletion = formData.get("blocksCompletion") === "true";

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Paso no encontrado");

  await prisma.taskStepTemplate.update({
    where: { id: stepId },
    data: { name, description, capturesYesNo, yesNoRequired, capturesNumber, numberRequired, capturesPhoto, photoRequired, capturesText, textRequired, isRequired, blocksCompletion },
  });

  revalidatePath(`/host/tareas-pro/${step.section.templateId}`);
}

export async function updateTaskStepName(formData: FormData): Promise<void> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("El nombre no puede estar vacío");

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Paso no encontrado");

  await prisma.taskStepTemplate.update({
    where: { id: stepId },
    data: { name },
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

export async function updateTaskStepFrequency(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const raw = formData.get("stepFrequency")?.toString() ?? "";
  const stepFrequency = raw === "" ? null : (raw as any);

  // Anchors semanales/mensuales
  const rawDow = formData.get("stepAnchorDayOfWeek")?.toString();
  const rawDom = formData.get("stepAnchorDayOfMonth")?.toString();
  const stepAnchorDayOfWeek =
    stepFrequency === "WEEKLY" && rawDow !== undefined ? parseInt(rawDow, 10) : null;
  const stepAnchorDayOfMonth =
    stepFrequency === "MONTHLY" && rawDom !== undefined ? parseInt(rawDom, 10) : null;

  // Intervalo
  const rawInterval  = formData.get("intervalDays")?.toString();
  const rawStartDate = formData.get("startDate")?.toString();
  const intervalDays =
    stepFrequency === "INTERVAL" && rawInterval ? parseInt(rawInterval, 10) : null;
  // startDate se guarda para WEEKLY, MONTHLY e INTERVAL — define cuándo inicia la repetición
  const startDate =
    (stepFrequency === "INTERVAL" || stepFrequency === "WEEKLY" || stepFrequency === "MONTHLY") && rawStartDate
      ? new Date(rawStartDate)
      : null;

  // Validaciones
  if (stepFrequency === "WEEKLY") {
    if (stepAnchorDayOfWeek === null || isNaN(stepAnchorDayOfWeek) || stepAnchorDayOfWeek < 0 || stepAnchorDayOfWeek > 6)
      throw new Error("La frecuencia Semanal requiere un día de la semana válido (0=domingo … 6=sábado).");
  }
  if (stepFrequency === "MONTHLY") {
    if (stepAnchorDayOfMonth === null || isNaN(stepAnchorDayOfMonth) || stepAnchorDayOfMonth < 1 || stepAnchorDayOfMonth > 31)
      throw new Error("La frecuencia Mensual requiere un día del mes entre 1 y 31.");
  }
  if (stepFrequency === "INTERVAL") {
    if (!intervalDays || isNaN(intervalDays) || intervalDays < 1)
      throw new Error("La frecuencia por intervalo requiere un número de días mayor a 0.");
    if (!startDate || isNaN(startDate.getTime()))
      throw new Error("La frecuencia por intervalo requiere una fecha de inicio válida.");
  }

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Tarea no encontrada");

  await prisma.taskStepTemplate.update({
    where: { id: stepId },
    data: {
      stepFrequency,
      stepAnchorDayOfWeek,
      stepAnchorDayOfMonth,
      intervalDays,
      startDate,
    },
  });
  revalidatePath(`/host/tareas-pro/${step.section.templateId}`);
}

export async function updateTaskStepCaptures(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const capturesYesNo = formData.get("capturesYesNo") === "true";
  const yesNoRequired = formData.get("yesNoRequired") === "true";
  const capturesNumber = formData.get("capturesNumber") === "true";
  const numberRequired = formData.get("numberRequired") === "true";
  const capturesPhoto = formData.get("capturesPhoto") === "true";
  const photoRequired = formData.get("photoRequired") === "true";
  const capturesText = formData.get("capturesText") === "true";
  const textRequired = formData.get("textRequired") === "true";

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Tarea no encontrada");

  await prisma.taskStepTemplate.update({
    where: { id: stepId },
    data: {
      capturesYesNo, yesNoRequired, capturesNumber, numberRequired,
      capturesPhoto, photoRequired, capturesText, textRequired,
      captureVersion: "MULTI_CAPTURE_V2", // upgrade legacy step to new model
    },
  });

  revalidatePath(`/host/tareas-pro/${step.section.templateId}`);
}

