// app/host/tareas-pro/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import Link from "next/link";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import Page from "@/lib/ui/Page";
import CreateChecklistModal from "./components/CreateChecklistModal";
import PropertyFilterRouter from "./components/PropertyFilterRouter";
import TareasProSplitView from "./components/TareasProSplitView";
import { isScheduleComplete } from "@/lib/tareas-pro/domain/schedule-anchor";

export default async function TareasProPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sp = searchParams ? await searchParams : undefined;
  const propertyFilter = sp?.property;

  const properties = (await (prisma.property as any).findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, shortName: true, groupName: true, coverAssetGroupId: true },
  })).sort((a: any, b: any) =>
    (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name, "es")
  );

  const templates = await prisma.taskTemplate.findMany({
    where: {
      tenantId,
      status: { not: "DELETED" },
    },
    orderBy: { createdAt: "desc" },
    include: {
      property: { select: { name: true, shortName: true } },
      schedule: { select: { frequency: true, anchorDayOfWeek: true, anchorDayOfMonth: true } },
      _count: { select: { sections: true, jobs: true } },
    },
  });

  // --- Datos para el split de web ---

  // Obtener thumbnails de propiedades que tienen coverAssetGroupId
  const assetGroupIds = properties
    .map((p: any) => p.coverAssetGroupId)
    .filter((id: any): id is string => id != null);

  const thumbAssets =
    assetGroupIds.length > 0
      ? await prisma.asset.findMany({
          where: { groupId: { in: assetGroupIds }, variant: "THUMB_256" },
          select: { groupId: true, publicUrl: true },
        })
      : [];

  const thumbByGroupId = new Map(thumbAssets.map((a) => [a.groupId, a.publicUrl]));

  // Calcular contadores por propiedad
  const countsByProperty = new Map<string, { active: number; draft: number }>();
  for (const t of templates) {
    const entry = countsByProperty.get(t.propertyId) ?? { active: 0, draft: 0 };
    if (t.status === "ACTIVE") entry.active++;
    else if (t.status === "DRAFT") entry.draft++;
    countsByProperty.set(t.propertyId, entry);
  }

  const propertiesForSplit = properties.map((p: any) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName ?? null,
    groupName: p.groupName ?? null,
    coverThumbUrl: p.coverAssetGroupId
      ? (thumbByGroupId.get(p.coverAssetGroupId) ?? null)
      : null,
    activeCount: countsByProperty.get(p.id)?.active ?? 0,
    draftCount: countsByProperty.get(p.id)?.draft ?? 0,
  }));

  const templatesForSplit = templates.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    propertyId: t.propertyId,
    sectionCount: t._count.sections,
    jobCount: t._count.jobs,
    schedule: t.schedule,
  }));

  // --- Datos para la lista mobile (respeta el filtro por propiedad) ---
  const mobileTemplates = propertyFilter && propertyFilter !== "all"
    ? templates.filter((t) => t.propertyId === propertyFilter)
    : templates;

  return (
    <HostWebContainer>
      <Page
        title="Tareas"
        subtitle="Estándares operativos por propiedad"
        showBack
        backHref="/host/menu"
        rightActions={
          <div className="flex items-center gap-3">
            <Link href="/host/tareas-pro/pendientes" className="text-sm text-amber-600 hover:underline">
              Pendientes
            </Link>
            <Link href="/host/tareas-pro/jobs" className="text-sm text-blue-600 hover:underline">
              Historial
            </Link>
          </div>
        }
      >
        {/* Botón crear — solo mobile (desktop: el botón vive en el panel derecho del split) */}
        <div className="mb-5 lg:hidden">
          <CreateChecklistModal properties={properties} />
        </div>

        {/* VISTA WEB (lg+): split de dos paneles, sin filtro de propiedad */}
        <div className="hidden lg:block">
          {propertiesForSplit.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No hay propiedades activas.
            </p>
          ) : (
            <TareasProSplitView
              properties={propertiesForSplit}
              templates={templatesForSplit}
            />
          )}
        </div>

        {/* VISTA MOBILE (< lg): lista plana con filtro de propiedad */}
        <div className="lg:hidden max-w-2xl space-y-5">
          {/* Filtro de propiedad */}
          {properties.length > 1 && (
            <PropertyFilterRouter
              properties={properties}
              selectedPropertyId={propertyFilter ?? ""}
            />
          )}

          {/* Lista de checklists */}
          <div className="space-y-2">
            {mobileTemplates.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                {propertyFilter && propertyFilter !== "all"
                  ? "Esta propiedad aún no tiene tareas."
                  : "Aún no hay tareas. Crea la primera."}
              </p>
            ) : (
              mobileTemplates.map((t) => {
                const isLegacyPeriodic =
                  t.schedule != null &&
                  ["DAILY", "WEEKLY", "MONTHLY"].includes(t.schedule.frequency);
                const legacyIncomplete =
                  isLegacyPeriodic &&
                  !isScheduleComplete(
                    t.schedule!.frequency,
                    t.schedule!.anchorDayOfWeek,
                    t.schedule!.anchorDayOfMonth,
                  );
                return (
                  <Link
                    key={t.id}
                    href={`/host/tareas-pro/${t.id}`}
                    className="flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.property.shortName ?? t.property.name} ·{" "}
                        {t._count.sections} áreas · {t._count.jobs} tareas
                      </p>
                      {isLegacyPeriodic && (
                        <p className="text-xs text-orange-600 mt-1">
                          Usa periodicidad legacy a nivel de template. Considera migrar a frecuencia por tarea.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : t.status === "DRAFT"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {t.status === "ACTIVE"
                          ? "Activo"
                          : t.status === "DRAFT"
                          ? "Borrador"
                          : "Inactivo"}
                      </span>
                      {isLegacyPeriodic && (
                        <span
                          title={legacyIncomplete ? "Configuración legacy incompleta — falta el ancla de día." : "Usa el modelo legacy de periodicidad a nivel de template."}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${
                            legacyIncomplete
                              ? "bg-amber-100 text-amber-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {legacyIncomplete ? "⚠ Legacy incompleto" : "Periódico legacy"}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </Page>
    </HostWebContainer>
  );
}
