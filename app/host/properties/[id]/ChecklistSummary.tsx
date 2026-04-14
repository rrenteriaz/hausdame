"use client";

import { useRouter } from "next/navigation";
import { ChecklistArea } from "@/lib/types/cleaning-enums";
import { usePathname, useSearchParams } from "next/navigation";

interface ChecklistSummaryProps {
  propertyId: string;
  itemsByArea: Record<ChecklistArea, number>;
}

export default function ChecklistSummary({
  propertyId,
  itemsByArea,
}: ChecklistSummaryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalAreas = Object.keys(itemsByArea).length;

  // Volver desde checklist debe regresar al detalle de la propiedad (no al listado).
  // No dependemos de que existan items para mostrar el entrypoint.
  const returnTo = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const checklistHref = `/host/properties/${propertyId}/checklist?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div
      onClick={() => router.push(checklistHref)}
      className="rounded-xl border border-neutral-200 bg-white p-4 cursor-pointer hover:border-neutral-300 transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-neutral-800">Checklist de limpieza</h2>
        <svg
          className="w-4 h-4 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
      <div className="space-y-1">
        {totalAreas === 0 ? (
          <p className="text-xs text-neutral-600">
            Aún no has creado tareas para esta propiedad. Agrega tu primer item o crea una plantilla base para empezar rápido.
          </p>
        ) : (
          <p className="text-xs text-neutral-500">
            Gestiona y revisa el checklist de limpieza de la propiedad.
          </p>
        )}
      </div>
    </div>
  );
}



