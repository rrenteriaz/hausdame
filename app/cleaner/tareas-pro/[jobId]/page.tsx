// app/cleaner/tareas-pro/[jobId]/page.tsx
import { requireUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import CleanerJobExecutor from "./CleanerJobExecutor";

export default async function CleanerJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const { jobId } = await params;

  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId },
    include: {
      property: { select: { name: true, shortName: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: {
              response: true,
              evidenceAssets: {
                where: { syncStatus: "UPLOADED" },
                orderBy: { order: "asc" },
                include: { asset: { select: { publicUrl: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!job) notFound();

  const initialSections = job.sections.map((section) => ({
    id: section.id,
    nameSnapshot: section.nameSnapshot,
    sectionTypeSnapshot: section.sectionTypeSnapshot,
    requiresGlobalConfirmSnapshot: section.requiresGlobalConfirmSnapshot,
    order: section.order,
    status: section.status,
    isCarryForwardInjected: section.isCarryForwardInjected,
    steps: section.steps.map((step) => ({
      id: step.id,
      nameSnapshot: step.nameSnapshot,
      descriptionSnapshot: step.descriptionSnapshot,
      capturesYesNoSnapshot: step.capturesYesNoSnapshot,
      yesNoRequiredSnapshot: step.yesNoRequiredSnapshot,
      capturesNumberSnapshot: step.capturesNumberSnapshot,
      numberRequiredSnapshot: step.numberRequiredSnapshot,
      capturesPhotoSnapshot: step.capturesPhotoSnapshot,
      photoRequiredSnapshot: step.photoRequiredSnapshot,
      capturesTextSnapshot: step.capturesTextSnapshot,
      textRequiredSnapshot: step.textRequiredSnapshot,
      isRequiredSnapshot: step.isRequiredSnapshot,
      blocksCompletionSnapshot: step.blocksCompletionSnapshot,
      snapshotVersion: step.snapshotVersion,
      order: step.order,
      status: step.status,
      response: step.response
        ? {
            confirmed: step.response.confirmed,
            boolValue: step.response.boolValue,
            numberValue: step.response.numberValue !== null ? Number(step.response.numberValue) : null,
            textValue: step.response.textValue,
            notes: step.response.notes,
            notCompletedReasonCode: step.response.notCompletedReasonCode,
            notCompletedNote: step.response.notCompletedNote,
          }
        : null,
      evidencePhotos: step.evidenceAssets
        .filter((ea) => ea.asset !== null && ea.asset!.publicUrl !== null)
        .map((ea) => ({
          id: ea.id,
          thumbUrl: ea.asset!.publicUrl as string,
        })),
    })),
  }));

  return (
    <CleanerJobExecutor
      job={{
        id: job.id,
        templateNameSnapshot: job.templateNameSnapshot,
        status: job.status,
        property: job.property,
      }}
      initialSections={initialSections}
    />
  );
}
