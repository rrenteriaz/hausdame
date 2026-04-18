"use client";

import { useRouter } from "next/navigation";
import PropertyFilterIconButton from "@/lib/ui/PropertyFilterIconButton";

interface Property {
  id: string;
  name: string;
  shortName: string | null;
}

interface Props {
  properties: Property[];
  selectedPropertyId: string;
  currentMonthParam: string;
}

export default function ReservationsPropertyFilter({
  properties,
  selectedPropertyId,
  currentMonthParam,
}: Props) {
  const router = useRouter();

  const handleSelect = (propertyId: string | "") => {
    const params = new URLSearchParams();
    params.set("month", currentMonthParam);
    if (propertyId) params.set("propertyId", propertyId);
    router.push(`/host/reservations?${params.toString()}`);
  };

  return (
    <PropertyFilterIconButton
      properties={properties}
      selectedPropertyId={selectedPropertyId}
      onSelect={handleSelect}
    />
  );
}
