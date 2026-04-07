/**
 * prisma/seed-tareas-pro.ts
 *
 * Seed operativo para el dominio Tareas Pro.
 * Crea datos mínimos para probar:
 *   - Ejecución de job
 *   - Validaciones de cierre
 *   - Inyección automática de carry-forward
 *
 * Uso:
 *   npx tsx prisma/seed-tareas-pro.ts
 *
 * IMPORTANTE: Requiere que ya exista al menos un Tenant y un User OWNER en la BD.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { createId } from "@paralleldrive/cuid2";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Iniciando seed de Tareas Pro...");

  // ---- 1. Obtener tenant y propietario ----
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("No hay Tenant en la base de datos. Ejecuta el seed principal primero.");

  const owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
  });
  if (!owner) throw new Error("No hay usuario OWNER en el tenant.");

  const cleaner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "CLEANER" },
  });

  // ---- 2. Crear propiedad de prueba (si no existe una ya) ----
  let property = await prisma.property.findFirst({
    where: { tenantId: tenant.id },
  });

  if (!property) {
    property = await prisma.property.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        name: "Casa de prueba - Tareas Pro",
        shortName: "Prueba TP",
        isActive: true,
      },
    });
    console.log("  ✓ Propiedad creada:", property.name);
  } else {
    console.log("  ✓ Usando propiedad existente:", property.name);
  }

  // ---- 3. Crear TaskTemplate ----
  const existingTemplate = await prisma.taskTemplate.findFirst({
    where: { tenantId: tenant.id, propertyId: property.id, name: "Protocolo Checkout - Seed" },
  });

  if (existingTemplate) {
    console.log("  ℹ️  Template seed ya existe, saltando creación de template/secciones.");
    await prisma.$disconnect();
    return;
  }

  const template = await prisma.taskTemplate.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      name: "Protocolo Checkout - Seed",
      description: "Protocolo de ejemplo generado por el seed de Tareas Pro.",
      status: "ACTIVE",
    },
  });
  console.log("  ✓ Template creado:", template.name);

  // Schedule
  await prisma.taskTemplateSchedule.create({
    data: {
      tenantId: tenant.id,
      templateId: template.id,
      frequency: "PER_CHECKOUT",
      carryForwardPolicy: "LIMITED",
      maxCarryForwardAttempts: 2,
    },
  });

  // ---- 4. Sección 1: Informativa ----
  const section1 = await prisma.taskSectionTemplate.create({
    data: {
      tenantId: tenant.id,
      templateId: template.id,
      name: "Instrucciones generales",
      description: "Leer antes de iniciar la limpieza.",
      sectionType: "INFORMATIVE",
      order: 0,
      requiresGlobalConfirm: false,
    },
  });

  await prisma.taskStepTemplate.create({
    data: {
      tenantId: tenant.id,
      sectionId: section1.id,
      name: "Revisar notas del Host antes de iniciar",
      description: "Consulta el chat o la bitácora de la propiedad.",
      responseType: "NONE",
      isRequired: false,
      blocksCompletion: false,
      order: 0,
    },
  });

  // ---- 5. Sección 2: Estándar ----
  const section2 = await prisma.taskSectionTemplate.create({
    data: {
      tenantId: tenant.id,
      templateId: template.id,
      name: "Cocina",
      sectionType: "STANDARD",
      order: 1,
      requiresGlobalConfirm: true,
    },
  });

  await prisma.taskStepTemplate.createMany({
    data: [
      {
        tenantId: tenant.id,
        sectionId: section2.id,
        name: "Limpiar estufa",
        responseType: "CONFIRMATION",
        isRequired: true,
        blocksCompletion: false,
        order: 0,
      },
      {
        tenantId: tenant.id,
        sectionId: section2.id,
        name: "Revisar existencias en despensa (contar)",
        responseType: "NUMBER",
        isRequired: false,
        blocksCompletion: false,
        order: 1,
      },
    ],
  });

  // ---- 6. Sección 3: Crítica con evidencia ----
  const section3 = await prisma.taskSectionTemplate.create({
    data: {
      tenantId: tenant.id,
      templateId: template.id,
      name: "Baño principal",
      sectionType: "CRITICAL",
      order: 2,
      requiresGlobalConfirm: true,
    },
  });

  await prisma.taskStepTemplate.createMany({
    data: [
      {
        tenantId: tenant.id,
        sectionId: section3.id,
        name: "Desinfectar inodoro",
        responseType: "CONFIRMATION",
        isRequired: true,
        blocksCompletion: true,
        order: 0,
      },
      {
        tenantId: tenant.id,
        sectionId: section3.id,
        name: "Foto del baño terminado",
        description: "Toma una foto panorámica del baño limpio.",
        responseType: "EVIDENCE",
        isRequired: true,
        blocksCompletion: true,
        order: 1,
      },
    ],
  });

  console.log("  ✓ Secciones y pasos creados (3 secciones, 5 pasos)");

  // ---- 7. Crear TaskJob en IN_PROGRESS ----
  const occurrenceKey = `${template.id}:seed:${createId()}`;

  // Cargar secciones y pasos del template
  const templateFull = await prisma.taskTemplate.findUnique({
    where: { id: template.id },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { steps: { orderBy: { order: "asc" } } },
      },
    },
  });

  const job = await prisma.taskJob.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      templateId: template.id,
      assignedUserId: cleaner?.id ?? owner.id,
      status: "IN_PROGRESS",
      occurrenceKey,
      templateNameSnapshot: template.name,
      startedAt: new Date(),
    },
  });
  console.log("  ✓ Job creado:", job.id, "| status: IN_PROGRESS");

  // Crear secciones y pasos del job con snapshot
  const jobSectionMap: Record<string, string> = {}; // templateSectionId -> jobSectionId

  for (const section of templateFull!.sections) {
    const jobSection = await prisma.taskJobSection.create({
      data: {
        tenantId: tenant.id,
        jobId: job.id,
        templateSectionId: section.id,
        nameSnapshot: section.name,
        sectionTypeSnapshot: section.sectionType,
        requiresGlobalConfirmSnapshot: section.requiresGlobalConfirm,
        order: section.order,
        status: "PENDING",
        isCarryForwardInjected: false,
      },
    });
    jobSectionMap[section.id] = jobSection.id;

    for (const step of section.steps) {
      await prisma.taskJobStep.create({
        data: {
          tenantId: tenant.id,
          sectionId: jobSection.id,
          templateStepId: step.id,
          nameSnapshot: step.name,
          descriptionSnapshot: step.description,
          responseTypeSnapshot: step.responseType,
          isRequiredSnapshot: step.isRequired,
          blocksCompletionSnapshot: step.blocksCompletion,
          order: step.order,
          status: "PENDING",
        },
      });
    }
  }

  // ---- 8. Evidencia parcial: confirmar un paso de cocina ----
  const cocina = await prisma.taskJobSection.findFirst({
    where: { jobId: job.id, nameSnapshot: "Cocina" },
    include: { steps: true },
  });

  if (cocina) {
    const stepEstufa = cocina.steps.find((s) => s.nameSnapshot === "Limpiar estufa");
    if (stepEstufa) {
      await prisma.taskJobStepResponse.create({
        data: {
          tenantId: tenant.id,
          stepId: stepEstufa.id,
          respondedAt: new Date(),
          confirmed: true,
        },
      });
      await prisma.taskJobStep.update({
        where: { id: stepEstufa.id },
        data: { status: "RESPONDED" },
      });
      console.log("  ✓ Paso 'Limpiar estufa' respondido (parcial)");
    }
  }

  // ---- 9. Event log ----
  await prisma.taskJobEventLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        jobId: job.id,
        eventType: "CREATED",
        actorId: owner.id,
        metadata: { source: "seed" },
      },
      {
        tenantId: tenant.id,
        jobId: job.id,
        eventType: "STARTED",
        actorId: cleaner?.id ?? owner.id,
      },
    ],
  });

  // ---- 10. Crear TaskCarryForward OPEN ----
  // Simula una sección diferida de un job anterior
  const carryForward = await prisma.taskCarryForward.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      sourceJobId: job.id,
      status: "OPEN",
      policy: "LIMITED",
      maxAttempts: 2,
      currentAttempt: 0,
      reason: "Terraza no accesible por huéspedes tardíos",
      contextSnapshot: {
        sectionName: "Terraza",
        sectionType: "STANDARD",
        requiresGlobalConfirm: false,
        order: 3,
        reason: "Terraza no accesible por huéspedes tardíos",
      },
    },
  });

  console.log("  ✓ TaskCarryForward OPEN creado:", carryForward.id);

  console.log("\n✅ Seed de Tareas Pro completado exitosamente.");
  console.log("\n📋 Resumen:");
  console.log(`   Tenant:       ${tenant.id} (${tenant.name})`);
  console.log(`   Propiedad:    ${property.id} (${property.name})`);
  console.log(`   Template:     ${template.id} (${template.name})`);
  console.log(`   Job:          ${job.id} (IN_PROGRESS)`);
  console.log(`   CarryForward: ${carryForward.id} (OPEN)`);
  console.log("\n🔗 URLs de prueba:");
  console.log(`   Host templates:   /host/tareas-pro`);
  console.log(`   Host template:    /host/tareas-pro/${template.id}`);
  console.log(`   Host jobs:        /host/tareas-pro/jobs`);
  console.log(`   Host job:         /host/tareas-pro/jobs/${job.id}`);
  console.log(`   Cleaner bandeja:  /cleaner/tareas-pro`);
  console.log(`   Cleaner job:      /cleaner/tareas-pro/${job.id}`);
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
