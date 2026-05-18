// app/host/hoy/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import Page from "@/lib/ui/Page";
import HoyClient from "./HoyClient";
import { getHoyData, getProximasData } from "./data";
import CreatePropertyForm from "../properties/CreatePropertyForm";
import HostGettingStartedCard from "@/components/onboarding/HostGettingStartedCard";

export default async function HoyPage({
  searchParams,
}: {
  searchParams?: Promise<{ propertyId?: string; tab?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const params = searchParams ? await searchParams : {};
  const selectedPropertyId = params?.propertyId || "";
  const activeTab = params?.tab === "proximas" ? "proximas" : "hoy";

  // Obtener todas las propiedades para el filtro
  const [properties, hoyData, proximasData] = await Promise.all([
    prisma.property.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        shortName: true,
      },
      orderBy: { shortName: "asc" },
    }),
    getHoyData(tenantId, selectedPropertyId || undefined),
    getProximasData(tenantId, selectedPropertyId || undefined),
  ]);

  if (properties.length === 0) {
    return (
      <Page
        title="Actividad"
        subtitle="Prepara tu operación antes de recibir reservas y limpiezas"
      >
        <HostGettingStartedCard action={<CreatePropertyForm />} />
      </Page>
    );
  }

  return (
    <Page
      title="Actividad"
      subtitle="Tareas y actividades que requieren tu atención"
    >
      <HoyClient
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        activeTab={activeTab}
        hoyData={hoyData}
        proximasData={proximasData}
      />
    </Page>
  );
}

