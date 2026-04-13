// lib/tareas-pro/validation.ts
// Reglas de cierre estricto de un TaskJob
import prisma from "@/lib/prisma";

type SectionType = "INFORMATIVE" | "STANDARD" | "CRITICAL";

export interface JobValidationResult {
  canComplete: boolean;
  blockers: string[];
}

function sectionPrefix(name: string, type: SectionType): string {
  switch (type) {
    case "CRITICAL": return `[CRÍTICO] Sección "${name}"`;
    case "INFORMATIVE": return `[INFO] Sección "${name}"`;
    default: return `Sección "${name}"`;
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
    if (section.status === "DEFERRED") continue;

    const type = section.sectionTypeSnapshot as SectionType;
    const prefix = sectionPrefix(section.nameSnapshot, type);

    if (type === "INFORMATIVE") {
      if (section.requiresGlobalConfirmSnapshot && !section.response) {
        blockers.push(`${prefix}: requiere confirmación`);
      }
      for (const ev of section.evidenceAssets) {
        if (ev.syncStatus === "FAILED" || ev.syncStatus === "LOCAL_PENDING") {
          blockers.push(`${prefix}: evidencia no sincronizada`);
        }
      }
      continue;
    }

    if (section.requiresGlobalConfirmSnapshot && !section.response) {
      blockers.push(`${prefix}: falta confirmación global`);
    }

    for (const ev of section.evidenceAssets) {
      if (ev.syncStatus === "FAILED" || ev.syncStatus === "LOCAL_PENDING") {
        blockers.push(`${prefix}: evidencia no sincronizada`);
      }
    }

    for (const step of section.steps) {
      if (step.status === "DEFERRED" || step.status === "SKIPPED") continue;

      const isLegacy = step.snapshotVersion === "LEGACY_V1";
      const hasAnyCapture =
        step.capturesYesNoSnapshot ||
        step.capturesNumberSnapshot ||
        step.capturesPhotoSnapshot ||
        step.capturesTextSnapshot;

      // LEGACY_V1 steps with no captures: only require a response (confirmed=true).
      // No specific capture validation — the original responseType data was lost in migration.
      // The sheet UX shows "Marca como completada" and allows saving with confirmed=true.
      if (isLegacy && !hasAnyCapture) {
        if (step.isRequiredSnapshot || step.blocksCompletionSnapshot) {
          if (!step.response) {
            const qualifier = " (legacy — confirmar en el sheet)";
            const msg = type === "CRITICAL"
              ? `${prefix} — paso crítico "${step.nameSnapshot}" sin confirmar${qualifier}`
              : `${prefix} — paso "${step.nameSnapshot}" sin confirmar${qualifier}`;
            blockers.push(msg);
          }
        }
        continue;
      }

      // MULTI_CAPTURE_V2 or LEGACY_V1 with inferred captures: standard validation
      if (!hasAnyCapture && !step.isRequiredSnapshot && !step.blocksCompletionSnapshot) continue;

      // Step must be responded
      if (step.isRequiredSnapshot || step.blocksCompletionSnapshot) {
        if (!step.response) {
          const msg = type === "CRITICAL"
            ? `${prefix} — paso crítico "${step.nameSnapshot}" sin respuesta`
            : `${prefix} — paso "${step.nameSnapshot}" sin completar`;
          blockers.push(msg);
          continue;
        }

        // Validate individual required captures
        if (step.capturesYesNoSnapshot && step.yesNoRequiredSnapshot && step.response.boolValue === null) {
          blockers.push(`${prefix} — "${step.nameSnapshot}": falta respuesta Sí/No`);
        }
        if (step.capturesNumberSnapshot && step.numberRequiredSnapshot && step.response.numberValue === null) {
          blockers.push(`${prefix} — "${step.nameSnapshot}": falta el número`);
        }
        if (step.capturesTextSnapshot && step.textRequiredSnapshot && !step.response.textValue) {
          blockers.push(`${prefix} — "${step.nameSnapshot}": falta el texto`);
        }
        if (step.capturesPhotoSnapshot && step.photoRequiredSnapshot) {
          const validEvidence = step.evidenceAssets.filter(
            (a: { syncStatus: string }) => a.syncStatus === "UPLOADED"
          );
          if (validEvidence.length === 0) {
            blockers.push(`${prefix} — "${step.nameSnapshot}": falta foto de evidencia`);
          }
        }

        // Check evidence sync status
        for (const ev of step.evidenceAssets) {
          if (ev.syncStatus === "FAILED" || ev.syncStatus === "LOCAL_PENDING") {
            blockers.push(`${prefix} — evidencia de "${step.nameSnapshot}" no sincronizada`);
          }
        }
      }
    }
  }

  return { canComplete: blockers.length === 0, blockers };
}
