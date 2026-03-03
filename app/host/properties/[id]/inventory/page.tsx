// app/host/properties/[id]/inventory/page.tsx
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { listInventoryByProperty } from "@/lib/inventory";
import Page from "@/lib/ui/Page";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import AddInventoryItemButton from "./AddInventoryItemButton";
import CopyInventoryModal from "./CopyInventoryModal";
import ApplyTemplateModal from "./ApplyTemplateModal";
import DeleteAreaButton from "./DeleteAreaButton";
import { InventoryCategory, InventoryPriority } from "@prisma/client";
import { getInventoryItemImageThumbsBatch } from "@/lib/media/getInventoryItemImageThumbs";
import InventoryList from "./InventoryList";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    q?: string;
    area?: string;
    category?: string;
    priority?: string;
    page?: string;
    returnTo?: string;
  }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  // Verificar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: {
      id: resolvedParams.id,
      tenantId,
    },
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  });

  if (!property) notFound();

  // Obtener todas las propiedades del tenant (excepto la actual) para el modal de copiar
  const availableProperties = await prisma.property.findMany({
    where: {
      tenantId,
      id: { not: property.id },
    },
    select: {
      id: true,
      name: true,
      shortName: true,
    },
    orderBy: { shortName: "asc" },
  });

  // Obtener parámetros de filtrado y paginación
  const searchTerm = resolvedSearchParams?.q || "";
  const areaFilter = resolvedSearchParams?.area || undefined;
  const categoryFilter = resolvedSearchParams?.category
    ? (resolvedSearchParams.category as InventoryCategory)
    : undefined;
  const priorityFilter = (["HIGH", "MEDIUM", "LOW"] as const).includes(
    resolvedSearchParams?.priority as InventoryPriority
  )
    ? (resolvedSearchParams?.priority as InventoryPriority)
    : undefined;
  const page = parseInt(resolvedSearchParams?.page || "1", 10);
  const pageSize = 50;

  // Obtener inventario con filtros y paginación server-side
  const { lines: inventoryLines, total, hasMore } = await listInventoryByProperty(
    tenantId,
    property.id,
    {
      search: searchTerm || undefined,
      area: areaFilter,
      category: categoryFilter,
      priority: priorityFilter,
      page,
      pageSize,
    }
  );

  // Agrupar por área (basado en resultados paginados)
  const groupedByArea = inventoryLines.reduce(
    (acc, line) => {
      if (!acc[line.area]) {
        acc[line.area] = [];
      }
      acc[line.area].push(line);
      return acc;
    },
    {} as Record<string, typeof inventoryLines>
  );

  // Ordenar áreas alfabéticamente
  const areas = Object.keys(groupedByArea).sort((a, b) => 
    a.localeCompare(b, "es", { sensitivity: "base" })
  );

  // Ordenar líneas dentro de cada área por nombre del item (alfabético, respetando casing)
  Object.keys(groupedByArea).forEach(area => {
    groupedByArea[area].sort((a, b) => 
      a.item.name.localeCompare(b.item.name, "es", { sensitivity: "base" })
    );
  });

  // Obtener thumbs de imágenes para todos los items (batch)
  const itemIds = [...new Set(inventoryLines.map((line) => line.item.id))];
  const itemThumbsMap = await getInventoryItemImageThumbsBatch(itemIds);

  // Obtener reportes de daño/falla para las líneas mostradas (para etiqueta en inventario)
  const lineIds = inventoryLines.map((l) => l.id);
  const reports = lineIds.length > 0
    ? await (prisma as any).inventoryReport.findMany({
        where: {
          tenantId,
          inventoryLineId: { in: lineIds },
          type: {
            in: ["DAMAGED_WORKS", "DAMAGED_NOT_WORKING", "MISSING_PHYSICAL", "REPLACED_DIFFERENT", "DETAILS_MISMATCH", "OTHER"],
          },
        },
        include: {
          createdBy: { select: { name: true, email: true } },
          evidence: { include: { asset: { select: { publicUrl: true } } } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const reportsByLineId = new Map<
    string,
    { id: string; type: string; severity: string; description: string | null; status: string; createdAt: Date; createdBy: { name: string | null; email: string } | null; evidenceUrls: string[] }
  >();
  for (const r of reports) {
    const lineId = (r as any).inventoryLineId;
    if (lineId && !reportsByLineId.has(lineId)) {
      const evidenceUrls = ((r as any).evidence ?? []).map((e: any) => e.asset?.publicUrl).filter(Boolean);
      reportsByLineId.set(lineId, {
        id: r.id,
        type: r.type,
        severity: r.severity,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        evidenceUrls,
      });
    }
  }

  // Validar returnTo y usar fallback seguro
  // MUST: Fallback siempre a /host/properties (lista), nunca a la misma URL del detalle
  const returnTo = safeReturnTo(
    resolvedSearchParams?.returnTo ? String(resolvedSearchParams.returnTo) : undefined,
    "/host/properties"
  );

  return (
    <HostWebContainer className="space-y-6">
      <Page
        title="Inventario"
        subtitle={property.shortName || property.name}
        showBack
        backHref={returnTo}
      >
        <div className="space-y-6">
          {/* Lista agrupada por área */}
          {inventoryLines.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
              <p className="text-base text-neutral-700 font-medium mb-4">
                Aún no has creado Items para esta propiedad. Agrega tu primer item o copia el inventario desde otra propiedad.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
                <AddInventoryItemButton propertyId={property.id} />
                <ApplyTemplateModal
                  propertyId={property.id}
                  hasExistingInventory={false}
                />
                {availableProperties.length > 0 && (
                  <CopyInventoryModal
                    propertyId={property.id}
                    propertyName={property.shortName || property.name}
                    availableProperties={availableProperties}
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Buscador y botones */}
              <div className="flex flex-col sm:flex-row gap-3">
                <form
                  method="get"
                  className="flex-1 relative"
                  action={`/host/properties/${property.id}/inventory`}
                >
                  <input
                    type="text"
                    name="q"
                    placeholder="Buscar por nombre, área o categoría..."
                    defaultValue={searchTerm}
                    className="w-full rounded-lg border border-neutral-300 pl-3 pr-10 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-neutral-700 rounded transition-colors"
                    aria-label="Buscar"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </button>
                  {areaFilter && (
                    <input type="hidden" name="area" value={areaFilter} />
                  )}
                  {categoryFilter && (
                    <input type="hidden" name="category" value={categoryFilter} />
                  )}
                  {priorityFilter && (
                    <input type="hidden" name="priority" value={priorityFilter} />
                  )}
                </form>
                <div className="flex flex-col sm:flex-row gap-2">
                  <AddInventoryItemButton propertyId={property.id} />
                  <ApplyTemplateModal
                    propertyId={property.id}
                    hasExistingInventory={inventoryLines.length > 0}
                  />
                  {availableProperties.length > 0 && (
                    <CopyInventoryModal
                      propertyId={property.id}
                      propertyName={property.shortName || property.name}
                      availableProperties={availableProperties}
                    />
                  )}
                </div>
              </div>

              {/* Filtros de prioridad (Alta, Media, Baja) */}
              <div className="flex flex-wrap gap-2">
                {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => {
                  const isActive = p === "ALL" ? !priorityFilter : priorityFilter === p;
                  const params = new URLSearchParams();
                  if (searchTerm) params.set("q", searchTerm);
                  if (areaFilter) params.set("area", areaFilter);
                  if (categoryFilter) params.set("category", categoryFilter);
                  if (page > 1) params.set("page", String(page));
                  if (p !== "ALL") params.set("priority", p);
                  const href = `/host/properties/${property.id}/inventory${params.toString() ? `?${params.toString()}` : ""}`;
                  const label =
                    p === "ALL"
                      ? "Todo"
                      : p === "HIGH"
                      ? "🟥 Alta"
                      : p === "MEDIUM"
                      ? "🟨 Media"
                      : "🟩 Baja";
                  return (
                    <a
                      key={p}
                      href={href}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                        isActive
                          ? "bg-neutral-900 text-white"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      {label}
                    </a>
                  );
                })}
              </div>

              {/* Info de resultados */}
              {total > 0 && (
                <p className="text-xs text-neutral-500">
                  Mostrando {inventoryLines.length} de {total} items
                  {searchTerm && ` para "${searchTerm}"`}
                  {priorityFilter &&
                    ` · Prioridad ${priorityFilter === "HIGH" ? "alta" : priorityFilter === "MEDIUM" ? "media" : "baja"}`}
                </p>
              )}

              {/* Lista */}
              <div className="space-y-4">
                {areas.map((area) => (
                  <CollapsibleSection
                    key={area}
                    title={area}
                    count={groupedByArea[area].length}
                    defaultOpen={true}
                    headerActions={
                      <DeleteAreaButton
                        propertyId={property.id}
                        area={area}
                        itemCount={groupedByArea[area].length}
                      />
                    }
                  >
                    <InventoryList
                      lines={groupedByArea[area]}
                      propertyId={property.id}
                      itemThumbsMap={itemThumbsMap}
                      reportsByLineId={reportsByLineId}
                    />
                  </CollapsibleSection>
                ))}
              </div>

              {/* Paginación */}
              {(hasMore || page > 1) && (
                <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
                  {page > 1 && (
                    <form
                      method="get"
                      action={`/host/properties/${property.id}/inventory`}
                    >
                      <input type="hidden" name="q" value={searchTerm} />
                      {areaFilter && (
                        <input type="hidden" name="area" value={areaFilter} />
                      )}
                      {categoryFilter && (
                        <input
                          type="hidden"
                          name="category"
                          value={categoryFilter}
                        />
                      )}
                      {priorityFilter && (
                        <input type="hidden" name="priority" value={priorityFilter} />
                      )}
                      <input type="hidden" name="page" value={page - 1} />
                      <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition"
                      >
                        ← Anterior
                      </button>
                    </form>
                  )}
                  {hasMore && (
                    <form
                      method="get"
                      action={`/host/properties/${property.id}/inventory`}
                    >
                      <input type="hidden" name="q" value={searchTerm} />
                      {areaFilter && (
                        <input type="hidden" name="area" value={areaFilter} />
                      )}
                      {categoryFilter && (
                        <input
                          type="hidden"
                          name="category"
                          value={categoryFilter}
                        />
                      )}
                      {priorityFilter && (
                        <input type="hidden" name="priority" value={priorityFilter} />
                      )}
                      <input type="hidden" name="page" value={page + 1} />
                      <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition"
                      >
                        Siguiente →
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Page>
    </HostWebContainer>
  );
}

