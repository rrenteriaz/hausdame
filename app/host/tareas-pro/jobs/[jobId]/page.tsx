// app/host/tareas-pro/jobs/[jobId]/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import JobExecutor from "./JobExecutor";

export default async function HostJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requireHostUser();
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
                include: { asset: { select: { publicUrl: true } } },
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!job) notFound();

  const jobInfo = {
    id: job.id,
    templateNameSnapshot: job.templateNameSnapshot,
    status: job.status,
    property: job.property,
  };

  const initialSections = job.sections.map((section) => ({
    id: section.id,
    nameSnapshot: section.nameSnapshot,
    sectionTypeSnapshot: section.sectionTypeSnapshot,
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
            numberValue:
              step.response.numberValue !== null
                ? Number(step.response.numberValue)
                : null,
            textValue: step.response.textValue,
            notes: step.response.notes,
          }
        : null,
      evidencePhotos: step.evidenceAssets.map((ea) => ({
        id: ea.id,
        thumbUrl: ea.asset?.publicUrl ?? "",
      })),
    })),
  }));

  return (
    <HostWebContainer>
      <JobExecutor job={jobInfo} initialSections={initialSections} />
    </HostWebContainer>
  );
}
