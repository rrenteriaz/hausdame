// app/host/inventory/page.tsx
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import Page from "@/lib/ui/Page";
import InventoryPropertyList from "./InventoryPropertyList";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";

export default async function InventoryHubPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const resolvedSearchParams = searchParams ? await searchParams : {};

  const properties = await (prisma.property as any).findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      shortName: true,
      groupName: true,
      coverAssetGroupId: true,
      _count: {
        select: {
          propertyZones: { where: { isActive: true } },
          inventoryLines: { where: { isActive: true } },
        },
      },
    },
    orderBy: { shortName: "asc" },
  });

  // Con una sola propiedad no tiene sentido mostrar selector.
  if (properties.length === 1) {
    const returnTo = resolvedSearchParams.returnTo ?? "/host/menu";
    redirect(
      `/host/properties/${properties[0].id}/inventory?returnTo=${encodeURIComponent(returnTo)}`
    );
  }

  // Obtener thumbnails en batch
  const thumbUrls = await getCoverThumbUrlsBatch(
    properties.map((p: any) => ({
      id: p.id,
      coverAssetGroupId: p.coverAssetGroupId || null,
    }))
  );

  // Agrupar propiedades por groupName
  const groupMap = new Map<string, typeof properties>();
  for (const p of properties) {
    const groupName = (p as any).groupName || "Sin grupo";
    if (!groupMap.has(groupName)) groupMap.set(groupName, []);
    groupMap.get(groupName)!.push(p);
  }

  // Ordenar grupos: "Sin grupo" al final, resto alfabéticamente
  const sortedGroups = Array.from(groupMap.entries()).sort(([a], [b]) => {
    if (a === "Sin grupo") return 1;
    if (b === "Sin grupo") return -1;
    return a.localeCompare(b);
  });

  const groups = sortedGroups.map(([groupName, groupProperties]) => ({
    name: groupName,
    properties: groupProperties.map((p: any) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName ?? null,
      thumbUrl: thumbUrls.get(p.id) ?? null,
      zones: p._count.propertyZones,
      lines: p._count.inventoryLines,
    })),
  }));

  return (
    <Page
      title="Inventario"
      subtitle="Selecciona un alojamiento para gestionar su inventario"
    >
      <InventoryPropertyList groups={groups} />
    </Page>
  );
}
