// app/host/tareas-pro/jobs/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
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

export default async function HostJobsPage() {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const jobs = await prisma.taskJob.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      property: { select: { name: true, shortName: true } },
      assignedUser: { select: { name: true } },
      _count: { select: { sections: true } },
    },
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/host/tareas-pro" className="text-gray-400 hover:text-gray-700">
          ←
        </Link>
        <h1 className="text-xl font-semibold">Jobs de Tareas Pro</h1>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          Aún no hay jobs. Genera uno desde una plantilla activa.
        </p>
      ) : (
        jobs.map((job) => (
          <Link
            key={job.id}
            href={`/host/tareas-pro/jobs/${job.id}`}
            className="flex items-start justify-between border rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-medium text-sm">{job.templateNameSnapshot}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {job.property.shortName ?? job.property.name} ·{" "}
                {job._count.sections} secciones
                {job.assignedUser ? ` · ${job.assignedUser.name}` : ""}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(job.createdAt).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
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
        ))
      )}
    </div>
  );
}
