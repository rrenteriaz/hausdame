import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import InventoryPropertySplitView from "./InventoryPropertySplitView";
import type { InventoryGroupItemSplit } from "./InventoryPropertySplitView";

export default function InventoryPropertyList({
  groups,
}: {
  groups: InventoryGroupItemSplit[];
}) {
  const isEmpty =
    groups.length === 0 || groups.every((g) => g.properties.length === 0);

  if (isEmpty) {
    return (
      <p className="text-sm text-neutral-500 text-center py-8">
        No hay alojamientos registrados.
      </p>
    );
  }

  return (
    <>
      {/* VISTA WEB (lg+): split de dos paneles */}
      <div className="hidden lg:block">
        <InventoryPropertySplitView groups={groups} />
      </div>

      {/* VISTA MOBILE (<lg): lista colapsable por grupo */}
      <div className="lg:hidden space-y-4">
        {groups.map((group) => (
          <CollapsibleSection
            key={group.name}
            title={group.name}
            count={group.properties.length}
            defaultOpen={false}
          >
            <ListContainer>
              {group.properties.map((p, index) => {
                const isLast = index === group.properties.length - 1;
                return (
                  <ListRow
                    key={p.id}
                    href={`/host/properties/${p.id}/inventory?returnTo=/host/inventory`}
                    isLast={isLast}
                    ariaLabel={`Ver inventario de ${p.name}`}
                  >
                    <ListThumb src={p.thumbUrl} alt={p.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-medium text-neutral-900 truncate">
                          {p.name}
                        </h3>
                        {p.shortName && (
                          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-black text-white">
                            {p.shortName}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {p.zones} {p.zones === 1 ? "área" : "áreas"} ·{" "}
                        {p.lines} {p.lines === 1 ? "ítem" : "ítems"}
                      </p>
                    </div>
                  </ListRow>
                );
              })}
            </ListContainer>
          </CollapsibleSection>
        ))}
      </div>
    </>
  );
}
