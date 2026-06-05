// app/host/tareas-pro/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import Link from "next/link";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import Page from "@/lib/ui/Page";
import MobileGroupedView from "./components/MobileGroupedView";
import TareasProSplitView from "./components/TareasProSplitView";
import { isMissingPrismaSchemaError } from "@/lib/prisma-schema-errors";

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

  let tareasProSchemaUnavailable = false;
  const templates = await prisma.taskTemplate.findMany({
    where: {
      tenantId,
      status: { not: "DELETED" },
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    include: {
      property: { select: { name: true, shortName: true } },
      schedule: { select: { frequency: true, anchorDayOfWeek: true, anchorDayOfMonth: true } },
      _count: { select: { sections: true, jobs: true } },
      sections: { select: { _count: { select: { steps: true } } } },
    },
  }).catch((error) => {
    if (!isMissingPrismaSchemaError(error)) {
      throw error;
    }

    tareasProSchemaUnavailable = true;
    console.warn("[EMPTY_STATE_DIAG]", {
      route: "/host/tareas-pro",
      reason: "missing_task_template_table",
      tenantId,
      propertyCount: properties.length,
    });

    return [];
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
    stepCount: t.sections.reduce((sum, s) => sum + s._count.steps, 0),
    schedule: t.schedule,
  }));

  // Todos los templates mapeados para la vista mobile (sin filtrar — MobileGroupedView filtra client-side)
  const allMobileTemplates = templates.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    propertyId: t.propertyId,
    property: t.property,
    sectionCount: t._count.sections,
    stepCount: t.sections.reduce((sum, s) => sum + s._count.steps, 0),
    schedule: t.schedule,
  }));

  return (
    <HostWebContainer>
      <Page
        title="Tareas"
        subtitle="Estándares operativos por propiedad"
        showBack
        backHref="/host/menu"
        rightActions={
          tareasProSchemaUnavailable ? null : (
            <div className="flex items-center gap-3">
              <Link href="/host/tareas-pro/pendientes" className="text-sm text-amber-600 hover:underline">
                Pendientes
              </Link>
              <Link href="/host/tareas-pro/jobs" className="text-sm text-blue-600 hover:underline">
                Historial
              </Link>
            </div>
          )
        }
      >
        {tareasProSchemaUnavailable && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tareas todavía no está inicializado para esta base de datos. La app seguirá disponible mientras se completa la configuración.
          </div>
        )}

        {/* VISTA WEB (lg+): split de dos paneles, sin filtro de propiedad */}
        <div className="hidden lg:block">
          {tareasProSchemaUnavailable ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No hay tareas disponibles por ahora.
            </p>
          ) : propertiesForSplit.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No hay propiedades activas.
            </p>
          ) : (
            <TareasProSplitView
              properties={propertiesForSplit}
              templates={templatesForSplit}
              initialPropertyId={
                propertyFilter ?? (propertiesForSplit.length === 1 ? propertiesForSplit[0].id : "")
              }
            />
          )}
        </div>

        {/* VISTA MOBILE (< lg): agrupada por propiedad con transición deslizante */}
        <div className="lg:hidden max-w-2xl">
          {tareasProSchemaUnavailable ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No hay tareas disponibles por ahora.
            </p>
          ) : (
            <MobileGroupedView
              properties={propertiesForSplit}
              allTemplates={allMobileTemplates}
              initialPropertyId={
                propertyFilter ??
                (propertiesForSplit.length === 1 ? propertiesForSplit[0].id : undefined)
              }
            />
          )}
        </div>
      </Page>
    </HostWebContainer>
  );
}
