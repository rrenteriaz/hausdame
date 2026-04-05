// app/host/checklists/page.tsx
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import Page from "@/lib/ui/Page";
import ChecklistPropertyList from "./ChecklistPropertyList";

export default async function ChecklistsHubPage({
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
    },
    orderBy: { shortName: "asc" },
  });

  // Con una sola propiedad no tiene sentido mostrar selector.
  // Se pasa returnTo para que el botón de regreso vuelva al origen (ej. /host/menu).
  if (properties.length === 1) {
    const returnTo = resolvedSearchParams.returnTo ?? "/host/menu";
    redirect(
      `/host/properties/${properties[0].id}/checklist?returnTo=${encodeURIComponent(returnTo)}`
    );
  }

  return (
    <Page
      title="Check List de limpieza"
      subtitle="Selecciona un alojamiento para gestionar sus actividades de limpieza"
    >
      <ChecklistPropertyList properties={properties} />
    </Page>
  );
}
