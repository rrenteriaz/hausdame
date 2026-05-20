"use client";

import { useRouter, useSearchParams } from "next/navigation";
import PropertyPicker from "@/lib/ui/PropertyPicker";
import PropertyFilterIconButton from "@/lib/ui/PropertyFilterIconButton";
import HoyTabContent from "./HoyTabContent";
import ProximasTabContent from "./ProximasTabContent";
import { HoyData, ProximasData } from "./types";
import type { HostOnboardingProgress } from "@/lib/onboarding/host";

interface Property {
  id: string;
  name: string;
  shortName: string | null;
}

interface HoyClientProps {
  properties: Property[];
  selectedPropertyId: string;
  activeTab: "hoy" | "proximas";
  hoyData: HoyData;
  proximasData: ProximasData;
  onboardingProgress: HostOnboardingProgress;
}

export default function HoyClient({
  properties,
  selectedPropertyId,
  activeTab,
  hoyData,
  proximasData,
  onboardingProgress,
}: HoyClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePropertyChange = (propertyId: string | "") => {
    const params = new URLSearchParams(searchParams.toString());
    if (propertyId) {
      params.set("propertyId", propertyId);
    } else {
      params.delete("propertyId");
    }
    // Mantener el tab actual
    if (activeTab === "proximas") {
      params.set("tab", "proximas");
    } else {
      params.delete("tab");
    }
    router.push(`/host/hoy?${params.toString()}`);
  };

  const handleTabChange = (tab: "hoy" | "proximas") => {
    const params = new URLSearchParams(searchParams.toString());
    // Mantener el filtro de propiedad
    if (selectedPropertyId) {
      params.set("propertyId", selectedPropertyId);
    }
    if (tab === "proximas") {
      params.set("tab", "proximas");
    } else {
      params.delete("tab");
    }
    router.push(`/host/hoy?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Tabs y Filtro de Propiedad en la misma línea */}
      <div className="flex items-center justify-between gap-4">
        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => handleTabChange("hoy")}
              className={`px-4 py-2 text-base font-medium transition ${
                activeTab === "hoy"
                  ? "text-black border-b-2 border-black"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("proximas")}
              className={`px-4 py-2 text-base font-medium transition ${
                activeTab === "proximas"
                  ? "text-black border-b-2 border-black"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              Próximas
            </button>
          </div>
        </div>

        {/* Selector de Propiedad */}
        {/* Móvil: Botón tipo icono (como en Reservas) */}
        <div className="sm:hidden shrink-0">
          <PropertyFilterIconButton
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            onSelect={handlePropertyChange}
          />
        </div>

        {/* Desktop: Dropdown original */}
        <div className="hidden sm:block shrink-0">
          <PropertyPicker
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            onSelect={handlePropertyChange}
          />
        </div>
      </div>

      {/* Contenido del tab activo */}
      {activeTab === "hoy" ? (
        <HoyTabContent
          selectedPropertyId={selectedPropertyId}
          data={hoyData}
          onboardingProgress={onboardingProgress}
        />
      ) : (
        <ProximasTabContent selectedPropertyId={selectedPropertyId} data={proximasData} />
      )}
    </div>
  );
}
