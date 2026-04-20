// app/host/tareas-pro/[templateId]/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getTaskStepImageThumbsBatch } from "@/lib/media/getTaskStepImageThumbs";
import ChecklistEditor from "../components/ChecklistEditor";
import HostWebContainer from "@/lib/ui/HostWebContainer";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const { templateId } = await params;

  const [template, tenantProperties] = await Promise.all([
    prisma.taskTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: {
        property: { select: { name: true, shortName: true } },
        schedule: true,
        sections: {
          orderBy: { order: "asc" },
          include: {
            steps: { orderBy: { order: "asc" } },
          },
        },
        _count: { select: { jobs: true } },
      },
    }),
    // Propiedades del tenant para el selector "Copiar a otra propiedad"
    prisma.property.findMany({
      where: { tenantId },
      select: { id: true, name: true, shortName: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!template) notFound();
  if (template.status === "DELETED") redirect("/host/tareas-pro");

  // Batch-fetch initial thumbnails for all steps
  const allStepIds = template.sections.flatMap((s) => s.steps.map((st) => st.id));
  const thumbsMapRaw = await getTaskStepImageThumbsBatch(allStepIds);

  // Convert Map to serializable array for passing to Client Component
  const initialThumbsEntries: [string, Array<string | null>][] = Array.from(thumbsMapRaw.entries());

  // Shape sections for the editor
  const initialSections = template.sections.map((section) => ({
    id: section.id,
    name: section.name,
    sectionType: section.sectionType,
    order: section.order,
    steps: section.steps.map((step) => ({
      id: step.id,
      name: step.name,
      capturesYesNo: step.capturesYesNo,
      yesNoRequired: step.yesNoRequired,
      capturesNumber: step.capturesNumber,
      numberRequired: step.numberRequired,
      capturesPhoto: step.capturesPhoto,
      photoRequired: step.photoRequired,
      capturesText: step.capturesText,
      textRequired: step.textRequired,
      captureVersion: step.captureVersion,
      stepFrequency: step.stepFrequency ?? null,
      stepAnchorDayOfWeek: step.stepAnchorDayOfWeek ?? null,
      stepAnchorDayOfMonth: step.stepAnchorDayOfMonth ?? null,
      intervalDays: step.intervalDays ?? null,
      startDate: step.startDate ? step.startDate.toISOString() : null,
      order: step.order,
    })),
  }));

  const templateData = {
    id: template.id,
    name: template.name,
    description: template.description,
    status: template.status,
    propertyId: template.propertyId,
    property: template.property,
    schedule: template.schedule
      ? {
          frequency: template.schedule.frequency,
          carryForwardPolicy: template.schedule.carryForwardPolicy,
          maxCarryForwardAttempts: template.schedule.maxCarryForwardAttempts,
          anchorDayOfWeek: template.schedule.anchorDayOfWeek,
          anchorDayOfMonth: template.schedule.anchorDayOfMonth,
          timezone: template.schedule.timezone,
        }
      : null,
    _count: template._count,
  };

  return (
    <HostWebContainer>
      <ChecklistEditor
        template={templateData}
        initialSections={initialSections}
        initialThumbsEntries={initialThumbsEntries}
        tenantProperties={tenantProperties}
      />
    </HostWebContainer>
  );
}
