// app/host/tareas-pro/pendientes/page.tsx
import Link from "next/link";
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import { getOpenRecurringDues } from "@/lib/tareas-pro/recurring-due";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import Page from "@/lib/ui/Page";
import SubmitConfirmButton from "@/app/host/tareas-pro/components/SubmitConfirmButton";
import { skipRecurringDueAction, assignRecurringDueAction } from "./actions";

/** Convierte un periodKey a texto legible en español. */
function periodKeyToLabel(periodKey: string): string {
  if (periodKey.startsWith("daily:")) {
    const d = new Date(periodKey.slice(6) + "T12:00:00Z");
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  }
  if (periodKey.startsWith("weekly:")) {
    const part = periodKey.slice(7); // "2024-W15"
    const [year, week] = part.split("-W");
    return `Semana ${week} · ${year}`;
  }
  if (periodKey.startsWith("monthly:")) {
    const [year, month] = periodKey.slice(8).split("-");
    const d = new Date(`${year}-${month}-15T12:00:00Z`);
    return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  }
  return periodKey;
}

/** Indica si la obligación está vencida comparando el período con hoy. */
function isOverdue(periodKey: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (periodKey.startsWith("daily:")) {
    const d = new Date(periodKey.slice(6) + "T00:00:00Z");
    return d < today;
  }
  if (periodKey.startsWith("weekly:")) {
    const part = periodKey.slice(7);
    const [year, weekStr] = part.split("-W");
    const week = parseInt(weekStr, 10);
    const jan4 = new Date(Date.UTC(parseInt(year), 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
    return monday < today;
  }
  if (periodKey.startsWith("monthly:")) {
    const [year, month] = periodKey.slice(8).split("-");
    const firstOfMonth = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
    return firstOfMonth < today;
  }
  return false;
}

function formatCleaningOption(cleaning: { scheduledDate: Date; status: string }): string {
  const date = new Date(cleaning.scheduledDate).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = new Date(cleaning.scheduledDate).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const statusLabel = cleaning.status === "IN_PROGRESS" ? "En progreso" : "Pendiente";
  return `${date} ${time} · ${statusLabel}`;
}

const freqLabels: Record<string, string> = {
  DAILY: "Diario",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
};

const statusLabels: Record<string, string> = {
  PENDING_ASSIGNMENT: "Sin asignar",
  ASSIGNED: "Asignada a limpieza",
};

export default async function PendientesPage() {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const dues = await getOpenRecurringDues(tenantId);

  // Fetch upcoming cleanings for all involved properties in a single query
  const propertyIds = [...new Set(dues.map((d) => d.propertyId))];
  const upcomingCleanings =
    propertyIds.length > 0
      ? await prisma.cleaning.findMany({
          where: {
            tenantId,
            propertyId: { in: propertyIds },
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          select: { id: true, propertyId: true, scheduledDate: true, status: true },
          orderBy: { scheduledDate: "asc" },
        })
      : [];

  // Group cleanings by propertyId for O(1) lookup per due
  const cleaningsByProperty = new Map<string, typeof upcomingCleanings>();
  for (const c of upcomingCleanings) {
    if (!cleaningsByProperty.has(c.propertyId)) {
      cleaningsByProperty.set(c.propertyId, []);
    }
    cleaningsByProperty.get(c.propertyId)!.push(c);
  }

  return (
    <HostWebContainer>
      <Page
        title="Actividades periódicas pendientes"
        subtitle="Actividades que han vencido y necesitan resolverse en una limpieza real"
        showBack
        backHref="/host/tareas-pro"
      >
        <div className="max-w-2xl space-y-4">
          {dues.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 font-medium">Sin pendientes</p>
              <p className="text-xs text-gray-400 mt-1">
                Todas las actividades periódicas están al día.
              </p>
            </div>
          ) : (
            dues.map((due) => {
              const overdue = isOverdue(due.periodKey);
              const periodLabel = periodKeyToLabel(due.periodKey);
              const availableCleanings = cleaningsByProperty.get(due.propertyId) ?? [];

              return (
                <div
                  key={due.id}
                  className={`border rounded-xl px-4 py-4 space-y-3 ${
                    overdue ? "border-amber-200 bg-amber-50/40" : ""
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {due.step ? (
                        <>
                          <p className="font-medium text-sm truncate">{due.step.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {due.template.name} · {due.property.shortName ?? due.property.name} ·{" "}
                            {freqLabels[due.frequency] ?? due.frequency} · {periodLabel}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-sm truncate">{due.template.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {due.property.shortName ?? due.property.name} ·{" "}
                            {freqLabels[due.frequency] ?? due.frequency} · {periodLabel}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          due.status === "ASSIGNED"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {statusLabels[due.status] ?? due.status}
                      </span>
                      {overdue && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                          ⚠ Vencida
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Limpieza asignada (si existe) */}
                  {due.assignedCleaning && (
                    <p className="text-xs text-blue-600">
                      Asignada a limpieza del{" "}
                      {new Date(due.assignedCleaning.scheduledDate).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      ({due.assignedCleaning.status === "COMPLETED" ? "completada" : due.assignedCleaning.status === "IN_PROGRESS" ? "en progreso" : "pendiente"})
                    </p>
                  )}

                  {/* Acciones */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Asignar a limpieza (solo si está PENDING_ASSIGNMENT) */}
                    {due.status === "PENDING_ASSIGNMENT" && (
                      <>
                        {availableCleanings.length > 0 ? (
                          <form action={assignRecurringDueAction} className="flex items-center gap-2 flex-1 min-w-0">
                            <input type="hidden" name="dueId" value={due.id} />
                            <select
                              name="cleaningId"
                              className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 flex-1 min-w-0 bg-white"
                            >
                              {availableCleanings.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {formatCleaningOption(c)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition shrink-0"
                            >
                              Asignar
                            </button>
                          </form>
                        ) : (
                          <p className="text-xs text-neutral-400 flex-1">
                            No hay limpiezas disponibles.{" "}
                            <Link href="/host/cleanings" className="underline hover:text-neutral-600">
                              Crear una limpieza
                            </Link>
                          </p>
                        )}
                      </>
                    )}

                    {/* Omitir */}
                    <form action={skipRecurringDueAction} className="shrink-0">
                      <input type="hidden" name="dueId" value={due.id} />
                      <SubmitConfirmButton
                        confirmMessage={`¿Omitir la actividad "${due.template.name}" (${periodLabel})? No se podrá deshacer.`}
                        className="text-xs text-neutral-500 hover:text-neutral-700 border border-neutral-200 rounded-lg px-3 py-1.5 transition hover:border-neutral-300"
                      >
                        Omitir esta vez
                      </SubmitConfirmButton>
                    </form>
                  </div>
                </div>
              );
            })
          )}

          {dues.length > 0 && (
            <p className="text-xs text-gray-400 text-center pt-2">
              Al asignar una actividad a una limpieza, el Cleaner la ejecutará dentro de esa limpieza y se cerrará automáticamente al concluir.
            </p>
          )}
        </div>
      </Page>
    </HostWebContainer>
  );
}
