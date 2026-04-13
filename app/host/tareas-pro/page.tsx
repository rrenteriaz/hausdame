// app/host/tareas-pro/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import Link from "next/link";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import Page from "@/lib/ui/Page";
import CreateChecklistModal from "./components/CreateChecklistModal";
import PropertyFilterRouter from "./components/PropertyFilterRouter";
import { isScheduleComplete } from "@/lib/tareas-pro/domain/schedule-anchor";

export default async function TareasProPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sp = searchParams ? await searchParams : undefined;
  const propertyFilter = sp?.property;

  const properties = await prisma.property.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, shortName: true },
    orderBy: { name: "asc" },
  });

  const templates = await prisma.taskTemplate.findMany({
    where: {
      tenantId,
      status: { not: "DELETED" },
      ...(propertyFilter && propertyFilter !== "all"
        ? { propertyId: propertyFilter }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      property: { select: { name: true, shortName: true } },
      schedule: { select: { frequency: true, anchorDayOfWeek: true, anchorDayOfMonth: true } },
      _count: { select: { sections: true, jobs: true } },
    },
  });

  return (
    <HostWebContainer>
      <Page
        title="Tareas Pro"
        subtitle="Estándares operativos por propiedad"
        showBack
        backHref="/host/menu"
        rightActions={
          <div className="flex items-center gap-3">
            <Link href="/host/tareas-pro/pendientes" className="text-sm text-amber-600 hover:underline">
              Pendientes
            </Link>
            <Link href="/host/tareas-pro/jobs" className="text-sm text-blue-600 hover:underline">
              Historial
            </Link>
          </div>
        }
      >
        <div className="max-w-2xl space-y-5">
          {/* Botón crear + filtro de propiedad */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <CreateChecklistModal properties={properties} />
            </div>
            {properties.length > 1 && (
              <PropertyFilterRouter
                properties={properties}
                selectedPropertyId={propertyFilter ?? ""}
              />
            )}
          </div>

          {/* Lista de checklists */}
          <div className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                {propertyFilter && propertyFilter !== "all"
                  ? "Esta propiedad aún no tiene checklists."
                  : "Aún no hay checklists. Crea el primero."}
              </p>
            ) : (
              templates.map((t) => {
                const isLegacyPeriodic =
                  t.schedule != null &&
                  ["DAILY", "WEEKLY", "MONTHLY"].includes(t.schedule.frequency);
                const legacyIncomplete =
                  isLegacyPeriodic &&
                  !isScheduleComplete(
                    t.schedule!.frequency,
                    t.schedule!.anchorDayOfWeek,
                    t.schedule!.anchorDayOfMonth,
                  );
                return (
                  <Link
                    key={t.id}
                    href={`/host/tareas-pro/${t.id}`}
                    className="flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.property.shortName ?? t.property.name} ·{" "}
                        {t._count.sections} áreas · {t._count.jobs} tareas
                      </p>
                      {isLegacyPeriodic && (
                        <p className="text-xs text-orange-600 mt-1">
                          Usa periodicidad legacy a nivel de template. Considera migrar a frecuencia por tarea.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : t.status === "DRAFT"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {t.status === "ACTIVE"
                          ? "Activo"
                          : t.status === "DRAFT"
                          ? "Borrador"
                          : "Inactivo"}
                      </span>
                      {isLegacyPeriodic && (
                        <span
                          title={legacyIncomplete ? "Configuración legacy incompleta — falta el ancla de día." : "Usa el modelo legacy de periodicidad a nivel de template."}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${
                            legacyIncomplete
                              ? "bg-amber-100 text-amber-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {legacyIncomplete ? "⚠ Legacy incompleto" : "Periódico legacy"}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </Page>
    </HostWebContainer>
  );
}
