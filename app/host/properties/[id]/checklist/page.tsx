// app/host/properties/[id]/checklist/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import ChecklistManager from "./ChecklistManager";
import Page from "@/lib/ui/Page";
import PageHeader from "@/lib/ui/PageHeader";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";
import { getChecklistItemImageThumbsBatch } from "@/lib/media/getChecklistItemImageThumbs";

export default async function PropertyChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

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

  // FASE 4: property.id ahora es el nuevo PK directamente
  const checklistItems = await (prisma as any).propertyChecklistItem.findMany({
    where: {
      propertyId: property.id, // FASE 4: propertyId ahora apunta directamente a Property.id
      tenantId,
    },
    orderBy: [
      { area: "asc" },
      { sortOrder: "asc" },
    ],
  });

  const allProperties = await prisma.property.findMany({
    where: {
      tenantId,
      id: { not: resolvedParams.id },
    },
    select: {
      id: true,
      name: true,
      shortName: true,
    },
    orderBy: { name: "asc" },
  });

  // MUST: Fallback siempre a /host/properties (lista), nunca a la misma URL del detalle
  const returnTo = safeReturnTo(resolvedSearchParams?.returnTo, "/host/properties");

  // Obtener thumbs de imágenes para todos los items (batch)
  const checklistItemIds = checklistItems.map((item: any) => item.id);
  const itemThumbsMap = await getChecklistItemImageThumbsBatch(checklistItemIds);
  const itemThumbsEntries: [string, Array<string | null>][] = Array.from(
    itemThumbsMap.entries()
  );

  return (
    <HostWebContainer className="space-y-4">
      <header className="flex items-center justify-between">
        <PageHeader
          showBack
          backHref={returnTo}
          title="Checklist de limpieza"
          subtitle={property.shortName || property.name}
          variant="compact"
        />
      </header>

      <ChecklistManager
        propertyId={property.id}
        items={checklistItems.map((item: any) => ({
          id: item.id,
          area: item.area,
          title: item.title,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
          requiresValue: item.requiresValue || false,
          valueLabel: item.valueLabel,
        }))}
        allProperties={allProperties}
        itemThumbsEntries={itemThumbsEntries}
      />
    </HostWebContainer>
  );
}


