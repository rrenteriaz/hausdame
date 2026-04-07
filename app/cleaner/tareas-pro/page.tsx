// app/cleaner/tareas-pro/page.tsx
import { requireUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import Link from "next/link";

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
  DEFERRED: "Diferido",
  CANCELLED: "Cancelado",
};

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  DEFERRED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default async function CleanerTareasProPage() {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const jobs = await prisma.taskJob.findMany({
    where: {
      tenantId,
      assignedUserId: user.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      property: { select: { name: true, shortName: true } },
      _count: { select: { sections: true } },
    },
  });

  const completedJobs = await prisma.taskJob.findMany({
    where: {
      tenantId,
      assignedUserId: user.id,
      status: "COMPLETED",
    },
    orderBy: { completedAt: "desc" },
    take: 10,
    include: {
      property: { select: { name: true, shortName: true } },
    },
  });

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mis Tareas Pro</h1>
        <p className="text-sm text-gray-500 mt-0.5">Jobs asignados a ti</p>
      </div>

      {/* Jobs activos */}
      {jobs.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          No tienes tareas pendientes por ahora.
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Activos
          </h2>
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/cleaner/tareas-pro/${job.id}`}
              className="flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <div>
                <p className="font-medium text-sm">{job.templateNameSnapshot}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {job.property.shortName ?? job.property.name} ·{" "}
                  {job._count.sections} secciones
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  statusColors[job.status] ?? "bg-gray-100 text-gray-500"
                }`}
              >
                {statusLabels[job.status] ?? job.status}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Historial */}
      {completedJobs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Completados recientes
          </h2>
          {completedJobs.map((job) => (
            <Link
              key={job.id}
              href={`/cleaner/tareas-pro/${job.id}`}
              className="flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors opacity-70"
            >
              <div>
                <p className="text-sm">{job.templateNameSnapshot}</p>
                <p className="text-xs text-gray-400">
                  {job.property.shortName ?? job.property.name} ·{" "}
                  {job.completedAt
                    ? new Date(job.completedAt).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                      })
                    : ""}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                Completado
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
