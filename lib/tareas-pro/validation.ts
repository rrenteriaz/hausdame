// lib/tareas-pro/validation.ts
// Reglas de cierre estricto de un TaskJob
import prisma from "@/lib/prisma";

// Tipo local para no depender del estado del cliente Prisma en el servidor TS de VS Code.
// Los valores deben mantenerse alineados con el enum TaskSectionType del schema.
type SectionType = "INFORMATIVE" | "STANDARD" | "CRITICAL";

export interface JobValidationResult {
  canComplete: boolean;
  blockers: string[];
}

/**
 * Prefijo semántico para mensajes de bloqueo según el tipo de sección.
 * Hace que los mensajes sean informativos para el Cleaner.
 */
function sectionPrefix(name: string, type: SectionType): string {
  switch (type) {
    case "CRITICAL":
      return `[CRÍTICO] Sección "${name}"`;
    case "INFORMATIVE":
      return `[INFO] Sección "${name}"`;
    default:
      return `Sección "${name}"`;
  }
}

export async function validateJobCompletion(
  jobId: string,
  tenantId: string
): Promise<JobValidationResult> {
  const blockers: string[] = [];

  const sections = await prisma.taskJobSection.findMany({
    where: { jobId, tenantId },
    include: {
      response: true,
      steps: {
        include: {
          response: true,
          evidenceAssets: true,
        },
      },
      evidenceAssets: true,
    },
  });

  for (const section of sections) {
    // Secciones DEFERRED no bloquean en ningún caso
    if (section.status === "DEFERRED") continue;

    const type = section.sectionTypeSnapshot as SectionType;
    const prefix = sectionPrefix(section.nameSnapshot, type);

    // ---- Secciones INFORMATIVE ----
    // No bloquean salvo que tengan confirmación global explícita.
    // Sus pasos (que típicamente son NONE) tampoco bloquean.
    if (type === "INFORMATIVE") {
      if (section.requiresGlobalConfirmSnapshot && !section.response) {
        blockers.push(`${prefix}: requiere confirmación aunque es informativa`);
      }
      // Verificar sync de evidencia de sección (por si se añadió una)
      for (const ev of section.evidenceAssets) {
        if (ev.syncStatus === "FAILED" || ev.syncStatus === "LOCAL_PENDING") {
          blockers.push(`${prefix}: evidencia no sincronizada (${ev.syncStatus})`);
        }
      }
      // No validamos pasos de secciones informativas
      continue;
    }

    // ---- Secciones STANDARD y CRITICAL ----

    // Confirmación global obligatoria
    if (section.requiresGlobalConfirmSnapshot && !section.response) {
      blockers.push(`${prefix}: falta confirmación global`);
    }

    // Evidencia de sección con sync inválido
    for (const ev of section.evidenceAssets) {
      if (ev.syncStatus === "FAILED" || ev.syncStatus === "LOCAL_PENDING") {
        blockers.push(`${prefix}: evidencia no sincronizada (${ev.syncStatus})`);
      }
    }

    // Validar pasos
    for (const step of section.steps) {
      // Pasos DEFERRED no bloquean
      if (step.status === "DEFERRED") continue;

      const responseType = step.responseTypeSnapshot;

      // Pasos sin tipo de respuesta nunca bloquean
      if (responseType === "NONE") continue;

      // Verificar respuesta obligatoria
      if (step.isRequiredSnapshot || step.blocksCompletionSnapshot) {
        if (!step.response) {
          // Para secciones CRITICAL, mensaje más explícito
          const stepMsg =
            type === "CRITICAL"
              ? `${prefix} — paso crítico "${step.nameSnapshot}" sin respuesta`
              : `${prefix} — paso "${step.nameSnapshot}" requiere respuesta`;
          blockers.push(stepMsg);
          continue;
        }

        // EVIDENCE: verificar que tenga al menos un asset UPLOADED
        if (responseType === "EVIDENCE") {
          const validEvidence = step.evidenceAssets.filter(
            (a: { syncStatus: string }) => a.syncStatus === "UPLOADED"
          );
          if (validEvidence.length === 0) {
            const evidenceMsg =
              type === "CRITICAL"
                ? `${prefix} — evidencia crítica del paso "${step.nameSnapshot}" sin foto sincronizada`
                : `${prefix} — paso "${step.nameSnapshot}" requiere evidencia fotográfica sincronizada`;
            blockers.push(evidenceMsg);
          }
        }

        // Evidencia en assets con sync inválido
        for (const ev of step.evidenceAssets) {
          if (ev.syncStatus === "FAILED" || ev.syncStatus === "LOCAL_PENDING") {
            blockers.push(
              `${prefix} — evidencia del paso "${step.nameSnapshot}" no sincronizada (${ev.syncStatus})`
            );
          }
        }
      }
    }
  }

  return { canComplete: blockers.length === 0, blockers };
}
