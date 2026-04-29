// app/host/properties/page.tsx
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import Link from "next/link";
import CreatePropertyForm from "./CreatePropertyForm";
import SyncAllIcalButton from "./SyncAllIcalButton";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";
import PropertiesSplitView from "./PropertiesSplitView";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    throw new Error("Usuario sin tenant asociado");
  }

  const params = searchParams ? await searchParams : {};
  // Usar safeReturnTo común con fallback explícito para el back del Page
  const returnTo = safeReturnTo(params?.returnTo, "/host/menu");

  const [properties, inactivePropertiesCount] = await Promise.all([
    prisma.property.findMany({
      where: { 
        tenantId,
        ...({ isActive: true } as any), // Solo mostrar propiedades activas - Temporal hasta que TypeScript reconozca el campo
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        address: true,
        icalUrl: true,
        coverAssetGroupId: true,
        groupName: true,
      },
      orderBy: { shortName: "asc" },
    }),
    (prisma.property as any).count({
      where: {
        tenantId,
        ...({ isActive: false } as any), // Contar propiedades inactivas
      },
    }),
  ]);

  // Obtener thumbnails en batch
  const thumbUrls = await getCoverThumbUrlsBatch(
    properties.map((p) => ({ id: p.id, coverAssetGroupId: (p as any).coverAssetGroupId || null }))
  );

  // Helper para construir returnTo (para detalles de propiedad)
  // MUST: Cuando se navega desde la lista, siempre usar /host/properties como returnTo
  const buildReturnTo = () => "/host/properties";

  return (
    <Page title="Propiedades" subtitle="Gestiona aquí tus alojamientos conectados a Hausdame" showBack backHref={returnTo}>
      <div className="space-y-6">

      {/* Botón temporal: Sincronizar iCal (todas) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-700">
          Sincronización masiva
        </h2>
        <SyncAllIcalButton />
      </section>

      {/* Lista de propiedades */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-800">
            Tus propiedades
          </h2>
          {inactivePropertiesCount > 0 && (
            <Link
              href="/host/properties/inactive"
              className="text-xs text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
            >
              Propiedades inactivas
            </Link>
          )}
        </div>

        {properties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-base text-neutral-600">
            Todavía no has registrado ninguna propiedad.
            <br />
            Usa el botón "Agregar propiedad" para agregar la primera.
          </div>
        ) : (
          (() => {
            // Agrupar propiedades por groupName
            const propertiesByGroup = new Map<string, typeof properties>();

            properties.forEach((p) => {
              const groupName = (p as any).groupName || "Sin grupo";
              if (!propertiesByGroup.has(groupName)) {
                propertiesByGroup.set(groupName, []);
              }
              propertiesByGroup.get(groupName)!.push(p);
            });

            // Ordenar grupos: "Sin grupo" al final, resto alfabéticamente
            const sortedGroups = Array.from(propertiesByGroup.entries()).sort((a, b) => {
              if (a[0] === "Sin grupo") return 1;
              if (b[0] === "Sin grupo") return -1;
              return a[0].localeCompare(b[0]);
            });

            const groupsForSplit = sortedGroups.map(([groupName, groupProperties]) => ({
              name: groupName,
              properties: groupProperties.map((p) => ({
                id: p.id,
                name: p.name,
                shortName: p.shortName,
                address: p.address,
                icalUrl: p.icalUrl,
                thumbUrl: thumbUrls.get(p.id) || null,
              })),
            }));

            return (
              <>
                {/* VISTA WEB (lg+): split de dos paneles */}
                <div className="hidden lg:block">
                  <PropertiesSplitView
                    groups={groupsForSplit}
                    returnTo={buildReturnTo()}
                  />
                </div>

                {/* VISTA MOBILE (<lg): lista colapsable por grupo */}
                <div className="lg:hidden space-y-4">
                  {sortedGroups.map(([groupName, groupProperties], groupIndex) => {
                    const isLastGroup = groupIndex === sortedGroups.length - 1;
                    return (
                      <CollapsibleSection
                        key={groupName}
                        title={groupName}
                        count={groupProperties.length}
                        defaultOpen={false}
                      >
                        <ListContainer>
                          {groupProperties.map((p, index) => {
                            const detailsHref = `/host/properties/${p.id}?returnTo=${encodeURIComponent(buildReturnTo())}`;
                            const isLast = isLastGroup && index === groupProperties.length - 1;
                            return (
                              <ListRow
                                key={p.id}
                                href={detailsHref}
                                isLast={isLast}
                                ariaLabel={`Ver detalles de propiedad ${p.name}`}
                              >
                                <ListThumb src={thumbUrls.get(p.id) || null} alt={p.name} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-base font-medium text-neutral-900 truncate">
                                      {p.name}
                                    </h3>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {p.shortName && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black text-white">
                                          {p.shortName}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-0.5 flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      {p.address && (
                                        <p className="text-xs text-neutral-500 truncate mt-0.5">
                                          {p.address}
                                        </p>
                                      )}
                                    </div>
                                    <div className="shrink-0 text-right ml-2">
                                      {p.icalUrl ? (
                                        <p className="text-[11px] text-emerald-600 whitespace-nowrap">
                                          iCal conectado
                                        </p>
                                      ) : (
                                        <p className="text-[11px] text-amber-600 whitespace-nowrap">
                                          iCal no configurado
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </ListRow>
                            );
                          })}
                        </ListContainer>
                      </CollapsibleSection>
                    );
                  })}
                </div>
              </>
            );
          })()
        )}

        {/* Botón para agregar propiedad al final */}
        <div className="flex justify-end">
          <CreatePropertyForm />
        </div>
      </section>
    </div>
    </Page>
  );
}
