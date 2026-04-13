"use client";

import { useRouter } from "next/navigation";
import PropertyPicker from "@/lib/ui/PropertyPicker";
import PropertyFilterIconButton from "@/lib/ui/PropertyFilterIconButton";

type Property = { id: string; name: string; shortName: string | null };

/**
 * Wrapper cliente que usa PropertyPicker (web) y PropertyFilterIconButton (móvil)
 * y navega via URL para filtrado server-side en la página de Tareas Pro.
 */
export default function PropertyFilterRouter({
  properties,
  selectedPropertyId,
}: {
  properties: Property[];
  selectedPropertyId: string;
}) {
  const router = useRouter();

  const handleSelect = (propertyId: string | "") => {
    if (propertyId) {
      router.push(`/host/tareas-pro?property=${propertyId}`);
    } else {
      router.push("/host/tareas-pro");
    }
  };

  return (
    <>
      {/* Móvil: ícono + bottom sheet */}
      <div className="sm:hidden shrink-0">
        <PropertyFilterIconButton
          properties={properties}
          selectedPropertyId={selectedPropertyId}
          onSelect={handleSelect}
        />
      </div>
      {/* Web: dropdown */}
      <div className="hidden sm:block shrink-0">
        <PropertyPicker
          properties={properties}
          selectedPropertyId={selectedPropertyId}
          onSelect={handleSelect}
        />
      </div>
    </>
  );
}
