// app/host/tareas-pro/jobs/[jobId]/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

const stepStatusIcons: Record<string, string> = {
  PENDING: "○",
  RESPONDED: "✓",
  DEFERRED: "⟳",
  SKIPPED: "–",
};

const sectionStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  CONFIRMED: "Confirmada",
  DEFERRED: "Pendiente (diferida)",
  SKIPPED: "Omitida",
};

const sectionTypeLabels: Record<string, string> = {
  INFORMATIVE: "Solo revisión",
  STANDARD: "Normal",
  CRITICAL: "Obligatoria",
};

export default async function HostJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const { jobId } = await params;

  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId },
    include: {
      property: { select: { name: true, shortName: true } },
      assignedUser: { select: { name: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          response: true,
          steps: {
            orderBy: { order: "asc" },
            include: {
              response: true,
              evidenceAssets: true,
            },
          },
        },
      },
      eventLogs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { actor: { select: { name: true } } },
      },
    },
  });

  if (!job) notFound();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/host/tareas-pro/jobs" className="text-gray-400 hover:text-gray-700 mt-0.5">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-semibold">{job.templateNameSnapshot}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {job.property.shortName ?? job.property.name}
            {job.assignedUser ? ` · ${job.assignedUser.name}` : ""}
          </p>
          <p className="text-xs text-gray-400">
            Estado:{" "}
            <span className="font-medium text-gray-700">
              {job.status === "PENDING" ? "Pendiente"
                : job.status === "IN_PROGRESS" ? "En progreso"
                : job.status === "COMPLETED" ? "Completada"
                : job.status === "CANCELLED" ? "Cancelada"
                : job.status}
            </span>
          </p>
        </div>
      </div>

      {/* Áreas */}
      <div className="space-y-3">
        {job.sections.map((section) => (
          <div key={section.id} className="border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">
                  {section.isCarryForwardInjected && (
                    <span className="text-orange-500 text-xs mr-1">[Pendiente anterior]</span>
                  )}
                  {section.nameSnapshot}
                </p>
                <p className="text-xs text-gray-400">
                  {sectionStatusLabels[section.status] ?? section.status} ·{" "}
                  {sectionTypeLabels[section.sectionTypeSnapshot] ?? section.sectionTypeSnapshot}
                </p>
              </div>
              {section.response && (
                <span className="text-xs text-green-600 font-medium">✓ Confirmada</span>
              )}
            </div>

            <div className="divide-y">
              {section.steps.map((step) => (
                <div key={step.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span className="text-gray-400 text-sm mt-0.5">
                    {stepStatusIcons[step.status] ?? "○"}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm">{step.nameSnapshot}</p>
                    {step.response && (
                      <div className="mt-1 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                        {step.response.confirmed !== null &&
                          `Confirmado: ${step.response.confirmed ? "Sí" : "No"}`}
                        {step.response.boolValue !== null &&
                          `Resp: ${step.response.boolValue ? "Sí" : "No"}`}
                        {step.response.numberValue !== null &&
                          `Valor: ${step.response.numberValue}`}
                        {step.response.textValue && `"${step.response.textValue}"`}
                        {step.response.notes && ` · Nota: ${step.response.notes}`}
                      </div>
                    )}
                    {step.evidenceAssets.length > 0 && (
                      <p className="text-xs text-blue-500 mt-1">
                        {step.evidenceAssets.length} evidencia(s)
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Historial */}
      <div className="border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Historial</h3>
        {job.eventLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 text-xs text-gray-500">
            <span className="text-gray-300">·</span>
            <div>
              <span className="font-medium text-gray-700">{log.eventType}</span>
              {log.actor && ` · ${log.actor.name}`}
              {" · "}
              {new Date(log.createdAt).toLocaleString("es-MX", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
