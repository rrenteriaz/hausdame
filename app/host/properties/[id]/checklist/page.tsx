// app/host/properties/[id]/checklist/page.tsx
// Legacy route — redirige silenciosamente a Tareas Pro filtrado por propiedad.
// NO eliminar: mantiene deep links y marcadores existentes funcionando.
import { redirect } from "next/navigation";

export default async function PropertyChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/host/tareas-pro?property=${id}`);
}
