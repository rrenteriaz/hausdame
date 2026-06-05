// app/host/checklists/page.tsx
// Legacy route — redirige silenciosamente a Tareas Pro.
// NO eliminar: mantiene deep links y marcadores existentes funcionando.
import { redirect } from "next/navigation";

export default function ChecklistsHubPage() {
  redirect("/host/tareas-pro");
}
