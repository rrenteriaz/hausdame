/**
 * QA funcional de flujos Cleaner: accept / decline / complete
 *
 * Crea limpiezas sintéticas en el tenant de Itzel (dev), ejecuta todos
 * los escenarios con la misma lógica de transacción que usan las Server Actions,
 * verifica el estado en cada paso y limpia al final.
 *
 * Run: npx tsx scripts/qa/qa-cleaner-flows.ts
 */
import "dotenv/config";
import prisma from "@/lib/prisma";
import { createId } from "@paralleldrive/cuid2";

if (process.env.NODE_ENV === "production") {
  throw new Error("QA scripts no deben ejecutarse en producción.");
}

// ─── Datos del entorno dev ───────────────────────────────────────────────────
const CLEANER = {
  membershipId: "cmkrcl0ge0004aco7ikdscitt",
  teamId:       "cmkrcl07m0003aco7ckjin9be",
  tenantId:     "cmkrckzsd0001aco74u8fn53v",
  userId:       "cmkrckzvh0002aco72s552nnk",
  name:         "Itzel",
};
// Propiedad accesible para este team (primera OPEN del diagnóstico)
const PROPERTY_ID = "ffh2f4ym8mgxgxeac25bnf44";

// IDs únicos para las limpiezas sintéticas de esta ejecución
const CLEANING_A = createId(); // accept → decline → accept → start → complete
const CLEANING_B = createId(); // accept → complete directo (sin start, permissive)

// ─── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, detail?: string) {
  const icon = cond ? "✅" : "❌";
  console.log(`  ${icon} ${label}${detail ? ` (${detail})` : ""}`);
  if (cond) passed++; else failed++;
}

async function fetchCleaning(id: string) {
  return (prisma as any).cleaning.findUnique({
    where: { id },
    select: {
      id: true, status: true, assignmentStatus: true,
      assignedMembershipId: true, assignedMemberId: true,
      needsAttention: true, attentionReason: true, completedAt: true,
    },
  });
}

async function fetchAssignees(cleaningId: string) {
  return prisma.cleaningAssignee.findMany({
    where: { cleaningId },
    select: { id: true, memberId: true, status: true, assignedAt: true },
    orderBy: { assignedAt: "desc" },
  });
}

function availabilityStart(): Date {
  // Misma lógica que getAvailabilityStartDate con includePastOpen: true
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d;
}
function availabilityEnd(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── Setup ───────────────────────────────────────────────────────────────────
async function setup() {
  console.log("\n🔧 Setup: creando limpiezas sintéticas...");

  // Verificar que el membership existe
  const membership = await prisma.teamMembership.findUnique({
    where: { id: CLEANER.membershipId },
    select: { id: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    throw new Error(`Membership ${CLEANER.membershipId} no existe o no está ACTIVE`);
  }

  // Usar hoy como fecha (dentro de la ventana de disponibilidad)
  const today = new Date();
  today.setHours(10, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  await (prisma as any).cleaning.createMany({
    data: [
      {
        id: CLEANING_A,
        tenantId: CLEANER.tenantId,
        propertyId: PROPERTY_ID,
        teamId: CLEANER.teamId,
        scheduledDate: today,
        status: "PENDING",
        assignmentStatus: "OPEN",
        needsAttention: false,
      },
      {
        id: CLEANING_B,
        tenantId: CLEANER.tenantId,
        propertyId: PROPERTY_ID,
        teamId: CLEANER.teamId,
        scheduledDate: tomorrow,
        status: "PENDING",
        assignmentStatus: "OPEN",
        needsAttention: false,
      },
    ],
  });

  console.log(`  Cleaning A: ${CLEANING_A} (today ${today.toISOString().slice(0, 10)})`);
  console.log(`  Cleaning B: ${CLEANING_B} (tomorrow ${tomorrow.toISOString().slice(0, 10)})`);
  console.log("  ✅ Setup completo\n");
}

// ─── Lógica de accept (replicada de acceptCleaning MEMBERSHIP path) ───────────
async function acceptCleaning(cleaningId: string): Promise<"OK" | "ALREADY_TAKEN" | "NOT_AVAILABLE"> {
  const cleaning = await fetchCleaning(cleaningId);
  if (!cleaning) return "NOT_AVAILABLE";

  const now = new Date();
  const startDate = availabilityStart();
  const end = availabilityEnd();

  const isUnassigned =
    cleaning.assignmentStatus === "OPEN" &&
    cleaning.assignedMembershipId === null &&
    cleaning.assignedMemberId === null &&
    cleaning.status === "PENDING";

  const isInWindow =
    new Date(cleaning.scheduledDate || now) >= startDate &&
    new Date(cleaning.scheduledDate || now) <= end;

  if (!isUnassigned || !isInWindow) return "NOT_AVAILABLE";

  try {
    await prisma.$transaction(async (tx) => {
      const current = await (tx as any).cleaning.findFirst({
        where: {
          id: cleaningId,
          assignmentStatus: "OPEN",
          status: "PENDING",
          assignedMembershipId: null,
          assignedMemberId: null,
          scheduledDate: { gte: startDate, lte: end },
        },
        select: { needsAttention: true, attentionReason: true },
      });
      if (!current) throw new Error("ALREADY_TAKEN");

      await (tx as any).cleaning.update({
        where: { id: cleaningId },
        data: {
          assignmentStatus: "ASSIGNED",
          assignedMembershipId: CLEANER.membershipId,
          needsAttention:
            current.needsAttention && current.attentionReason === "NO_AVAILABLE_MEMBER"
              ? false
              : current.needsAttention,
          attentionReason:
            current.needsAttention && current.attentionReason === "NO_AVAILABLE_MEMBER"
              ? null
              : current.attentionReason,
        },
      });
    });
    return "OK";
  } catch (e: any) {
    if (e?.message === "ALREADY_TAKEN") return "ALREADY_TAKEN";
    throw e;
  }
}

// ─── Lógica de decline (replicada de declineCleaning con el fix aplicado) ────
async function declineCleaning(cleaningId: string): Promise<"OK" | "NO_OP"> {
  const access = await fetchCleaning(cleaningId);
  if (!access) return "NO_OP";

  let noOp = false;
  await prisma.$transaction(async (tx) => {
    // Fix: cleaning updateMany PRIMERO
    const result = await (tx as any).cleaning.updateMany({
      where: {
        id: cleaningId,
        tenantId: CLEANER.tenantId,
        assignmentStatus: "ASSIGNED",
        status: "PENDING",
        assignedMembershipId: CLEANER.membershipId,
      },
      data: {
        assignmentStatus: "OPEN",
        assignedMemberId: null,
        assignedMembershipId: null,
        needsAttention: true,
        attentionReason: "DECLINED_BY_ASSIGNEE",
      },
    });
    if (result.count === 0) { noOp = true; return; }

    // Solo marcar assignee si se resetó el cleaning
    await tx.cleaningAssignee.updateMany({
      where: {
        cleaningId,
        status: "ASSIGNED",
      },
      data: { status: "DECLINED" },
    });
  });
  return noOp ? "NO_OP" : "OK";
}

// ─── Lógica de startCleaning (replicada) ─────────────────────────────────────
async function startCleaning(cleaningId: string): Promise<number> {
  const result = await (prisma as any).cleaning.updateMany({
    where: {
      id: cleaningId,
      tenantId: CLEANER.tenantId,
      assignmentStatus: "ASSIGNED",
      status: "PENDING",
      assignedMembershipId: CLEANER.membershipId,
    },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  return result.count;
}

// ─── Lógica de completeCleaning (replicada — sin status guard) ───────────────
async function completeCleaning(cleaningId: string): Promise<number> {
  const result = await (prisma as any).cleaning.updateMany({
    where: {
      id: cleaningId,
      tenantId: CLEANER.tenantId,
      assignmentStatus: "ASSIGNED",
      assignedMembershipId: CLEANER.membershipId,
    },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  return result.count;
}

// ─── Contadores (query de getCleanerCleaningsCounts) ─────────────────────────
async function getCounters() {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(now); sevenDaysLater.setDate(now.getDate() + 7); sevenDaysLater.setHours(23, 59, 59, 999);
  const availStart = availabilityStart();

  const base = { tenantId: CLEANER.tenantId, propertyId: PROPERTY_ID };

  const [assigned, available, upcoming7d, inProgress] = await Promise.all([
    (prisma as any).cleaning.count({
      where: { ...base, assignmentStatus: "ASSIGNED", assignedMembershipId: CLEANER.membershipId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    }),
    (prisma as any).cleaning.count({
      where: { ...base, assignmentStatus: "OPEN", assignedMembershipId: null, assignedMemberId: null, status: "PENDING", scheduledDate: { gte: availStart } },
    }),
    (prisma as any).cleaning.count({
      where: { ...base, assignmentStatus: "ASSIGNED", assignedMembershipId: CLEANER.membershipId, status: { in: ["PENDING", "IN_PROGRESS"] }, scheduledDate: { gte: startOfToday, lte: sevenDaysLater } },
    }),
    (prisma as any).cleaning.count({
      where: { ...base, assignmentStatus: "ASSIGNED", assignedMembershipId: CLEANER.membershipId, status: "IN_PROGRESS" },
    }),
  ]);

  return { assigned, available, upcoming7d, inProgress };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log("\n🧹 Cleanup...");
  await prisma.cleaningAssignee.deleteMany({
    where: { cleaningId: { in: [CLEANING_A, CLEANING_B] } },
  });
  await (prisma as any).cleaning.deleteMany({
    where: { id: { in: [CLEANING_A, CLEANING_B] }, tenantId: CLEANER.tenantId },
  });
  console.log("  ✅ Limpiezas sintéticas eliminadas");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("====================================================");
  console.log("QA FUNCIONAL — Flujos Cleaner (accept/decline/complete)");
  console.log(`Cleaner: ${CLEANER.name} | membership: ${CLEANER.membershipId}`);
  console.log("====================================================");

  await setup();

  // ── ESCENARIO A: Accept ──────────────────────────────────────────────────
  console.log("\n📋 ESCENARIO A — Accept limpieza disponible");
  const preAccept = await fetchCleaning(CLEANING_A);
  ok("Pre-check: OPEN/PENDING/no assignee",
    preAccept.assignmentStatus === "OPEN" &&
    preAccept.status === "PENDING" &&
    preAccept.assignedMembershipId === null
  );

  const countersBeforeAccept = await getCounters();
  const resultA = await acceptCleaning(CLEANING_A);
  ok("acceptCleaning retorna OK", resultA === "OK", resultA);

  const postAccept = await fetchCleaning(CLEANING_A);
  ok("assignmentStatus → ASSIGNED",    postAccept.assignmentStatus === "ASSIGNED");
  ok("status sigue PENDING",           postAccept.status === "PENDING");
  ok("assignedMembershipId correcto",  postAccept.assignedMembershipId === CLEANER.membershipId);
  ok("assignedMemberId null (WGE)",    postAccept.assignedMemberId === null);

  const countersAfterAccept = await getCounters();
  ok("available contador decrementó",  countersAfterAccept.available === countersBeforeAccept.available - 1,
    `${countersBeforeAccept.available} → ${countersAfterAccept.available}`);
  ok("assigned contador incrementó",   countersAfterAccept.assigned === countersBeforeAccept.assigned + 1,
    `${countersBeforeAccept.assigned} → ${countersAfterAccept.assigned}`);

  // ── ESCENARIO A2: Accept doble (idempotencia) ────────────────────────────
  console.log("\n📋 ESCENARIO A2 — Accept doble (debe fallar silenciosamente)");
  const resultA2 = await acceptCleaning(CLEANING_A);
  ok("Segunda aceptación NO es OK", resultA2 !== "OK", resultA2);
  const postAcceptDouble = await fetchCleaning(CLEANING_A);
  ok("Estado no cambió tras doble-accept", postAcceptDouble.assignedMembershipId === CLEANER.membershipId);

  // ── ESCENARIO B: Decline ─────────────────────────────────────────────────
  console.log("\n📋 ESCENARIO B — Decline limpieza asignada (PENDING)");
  const preDecline = await fetchCleaning(CLEANING_A);
  ok("Pre-check: ASSIGNED/PENDING antes de declinar",
    preDecline.assignmentStatus === "ASSIGNED" && preDecline.status === "PENDING"
  );

  const resultB = await declineCleaning(CLEANING_A);
  ok("declineCleaning retorna OK", resultB === "OK", resultB);

  const postDecline = await fetchCleaning(CLEANING_A);
  ok("assignmentStatus → OPEN",             postDecline.assignmentStatus === "OPEN");
  ok("status sigue PENDING",                postDecline.status === "PENDING");
  ok("assignedMembershipId limpiado",       postDecline.assignedMembershipId === null);
  ok("needsAttention → true",               postDecline.needsAttention === true);
  ok("attentionReason DECLINED_BY_ASSIGNEE", postDecline.attentionReason === "DECLINED_BY_ASSIGNEE");

  const countersAfterDecline = await getCounters();
  ok("available volvió a subir",  countersAfterDecline.available === countersBeforeAccept.available,
    `esperado: ${countersBeforeAccept.available}, actual: ${countersAfterDecline.available}`);
  ok("assigned volvió a bajar",   countersAfterDecline.assigned === countersBeforeAccept.assigned,
    `esperado: ${countersBeforeAccept.assigned}, actual: ${countersAfterDecline.assigned}`);

  // ── ESCENARIO B2: Decline IN_PROGRESS (debe hacer NO_OP) ────────────────
  console.log("\n📋 ESCENARIO B2 — Decline IN_PROGRESS (no debe inconsistencia)");
  // Primero aceptar y forzar a IN_PROGRESS directo (simular que ya se inició)
  await acceptCleaning(CLEANING_A);
  // Forzar a IN_PROGRESS sin pasar por la acción (bypass para test)
  await (prisma as any).cleaning.update({
    where: { id: CLEANING_A },
    data: { status: "IN_PROGRESS" },
  });
  const preDeclineIP = await fetchCleaning(CLEANING_A);
  ok("Pre-check: ASSIGNED/IN_PROGRESS", preDeclineIP.assignmentStatus === "ASSIGNED" && preDeclineIP.status === "IN_PROGRESS");

  const resultB2 = await declineCleaning(CLEANING_A);
  ok("declineCleaning IN_PROGRESS retorna NO_OP (no declinable)", resultB2 === "NO_OP", resultB2);

  const postDeclineIP = await fetchCleaning(CLEANING_A);
  ok("assignmentStatus NO cambió (sigue ASSIGNED)", postDeclineIP.assignmentStatus === "ASSIGNED",
    `actual: ${postDeclineIP.assignmentStatus}`);
  ok("status NO cambió (sigue IN_PROGRESS)",        postDeclineIP.status === "IN_PROGRESS",
    `actual: ${postDeclineIP.status}`);

  // Restaurar a PENDING para el siguiente test
  await (prisma as any).cleaning.update({
    where: { id: CLEANING_A },
    data: { status: "PENDING" },
  });

  // ── ESCENARIO C1: Start → Complete (flujo nominal) ───────────────────────
  console.log("\n📋 ESCENARIO C1 — Start → Complete (flujo nominal)");
  // Cleaning A ya está ASSIGNED/PENDING tras restauración
  const preStart = await fetchCleaning(CLEANING_A);
  ok("Pre-check: ASSIGNED/PENDING para start", preStart.assignmentStatus === "ASSIGNED" && preStart.status === "PENDING");

  const startCount = await startCleaning(CLEANING_A);
  ok("startCleaning actualiza 1 fila", startCount === 1, `count=${startCount}`);

  const postStart = await fetchCleaning(CLEANING_A);
  ok("status → IN_PROGRESS",           postStart.status === "IN_PROGRESS");
  ok("assignmentStatus sigue ASSIGNED", postStart.assignmentStatus === "ASSIGNED");

  const countersAfterStart = await getCounters();
  ok("inProgress contador = 1",   countersAfterStart.inProgress === 1,
    `actual: ${countersAfterStart.inProgress}`);

  const completeCount = await completeCleaning(CLEANING_A);
  ok("completeCleaning actualiza 1 fila", completeCount === 1, `count=${completeCount}`);

  const postComplete = await fetchCleaning(CLEANING_A);
  ok("status → COMPLETED",          postComplete.status === "COMPLETED");
  ok("completedAt seteado",         postComplete.completedAt !== null);
  ok("assignmentStatus sigue ASSIGNED", postComplete.assignmentStatus === "ASSIGNED");

  const countersAfterComplete = await getCounters();
  ok("assigned contador decrementó (COMPLETED ya no cuenta)", countersAfterComplete.assigned === countersBeforeAccept.assigned,
    `esperado: ${countersBeforeAccept.assigned}, actual: ${countersAfterComplete.assigned}`);
  ok("inProgress volvió a 0", countersAfterComplete.inProgress === 0,
    `actual: ${countersAfterComplete.inProgress}`);

  // ── ESCENARIO C2: Complete sin start (PENDING → COMPLETED, permisivo) ────
  console.log("\n📋 ESCENARIO C2 — Complete directo PENDING → COMPLETED (permissive)");
  // Cleaning B todavía está OPEN/PENDING, primero aceptar
  await acceptCleaning(CLEANING_B);
  const preCompleteB = await fetchCleaning(CLEANING_B);
  ok("Pre-check: ASSIGNED/PENDING", preCompleteB.assignmentStatus === "ASSIGNED" && preCompleteB.status === "PENDING");

  const completeBCount = await completeCleaning(CLEANING_B);
  ok("completeCleaning PENDING actualiza 1 fila (permisivo)", completeBCount === 1, `count=${completeBCount}`);

  const postCompleteB = await fetchCleaning(CLEANING_B);
  ok("status → COMPLETED (sin pasar por IN_PROGRESS)", postCompleteB.status === "COMPLETED",
    `actual: ${postCompleteB.status}`);

  console.log("\n  ℹ️  B1 documenta: completeCleaning es permisivo (no requiere IN_PROGRESS).");
  console.log("     Impacto: bajo — permite saltarse el step de start.");

  // ── ESCENARIO D: Refresh / estado final consistente ───────────────────────
  console.log("\n📋 ESCENARIO D — Estado final consistente (simula refresh)");
  const finalA = await fetchCleaning(CLEANING_A);
  const finalB = await fetchCleaning(CLEANING_B);
  ok("Cleaning A estado final: COMPLETED", finalA.status === "COMPLETED");
  ok("Cleaning B estado final: COMPLETED", finalB.status === "COMPLETED");

  const finalCounters = await getCounters();
  ok("Contadores finales — ninguna cleaning sintética en available",
    finalCounters.available === countersBeforeAccept.available - 2 ||
    finalCounters.available === countersBeforeAccept.available,
    `available: ${finalCounters.available}`);
  ok("Contadores finales — assigned = 0 para las sintéticas",
    finalCounters.assigned === countersBeforeAccept.assigned,
    `assigned: ${finalCounters.assigned}`);

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log("\n====================================================");
  console.log(`RESULTADO: ${passed} ✅ pasaron | ${failed} ❌ fallaron`);
  console.log("====================================================");

  if (failed > 0) {
    console.log("⚠️  Revisa los items con ❌ arriba.");
  } else {
    console.log("🎉 Todos los checks pasaron.");
  }

  await cleanup();
}

main()
  .catch(async (e) => {
    console.error("\n💥 Error inesperado:", e?.message || e);
    await cleanup().catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
