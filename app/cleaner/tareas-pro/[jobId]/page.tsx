// app/cleaner/tareas-pro/[jobId]/page.tsx
import { requireUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  startTaskJob,
  respondTaskStep,
  confirmTaskSection,
  deferTaskSection,
  completeTaskJob,
} from "../actions";

export default async function CleanerJobExecutionPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const { jobId } = await params;

  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId },
    include: {
      property: { select: { name: true, shortName: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          response: true,
          evidenceAssets: true,
          steps: {
            orderBy: { order: "asc" },
            include: {
              response: true,
              evidenceAssets: true,
            },
          },
        },
      },
    },
  });

  if (!job) notFound();

  const isCompleted = job.status === "COMPLETED" || job.status === "CANCELLED";

  // Calcular progreso
  const totalSteps = job.sections.flatMap((s) => s.steps).filter(
    (s) => s.responseTypeSnapshot !== "NONE"
  ).length;
  const respondedSteps = job.sections
    .flatMap((s) => s.steps)
    .filter((s) => s.status === "RESPONDED").length;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/cleaner/tareas-pro" className="text-gray-400 hover:text-gray-700 mt-0.5">
          ←
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{job.templateNameSnapshot}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {job.property.shortName ?? job.property.name}
          </p>
          {totalSteps > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {respondedSteps}/{totalSteps} pasos completados
            </p>
          )}
        </div>
      </div>

      {/* Botón iniciar */}
      {job.status === "PENDING" && (
        <form action={startTaskJob}>
          <input type="hidden" name="jobId" value={job.id} />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700"
          >
            Iniciar tarea
          </button>
        </form>
      )}

      {/* Secciones */}
      {job.sections.map((section) => (
        <div
          key={section.id}
          className={`border rounded-xl overflow-hidden ${
            section.status === "DEFERRED" ? "opacity-60" : ""
          }`}
        >
          {/* Header sección */}
          <div
            className={`px-4 py-3 flex items-center justify-between ${
              section.sectionTypeSnapshot === "CRITICAL"
                ? "bg-red-50 border-b border-red-100"
                : section.sectionTypeSnapshot === "INFORMATIVE"
                ? "bg-blue-50 border-b border-blue-100"
                : "bg-gray-50 border-b"
            }`}
          >
            <div>
              {section.isCarryForwardInjected && (
                <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full mb-1">
                  Pendiente anterior
                </span>
              )}
              <p className="font-medium text-sm">{section.nameSnapshot}</p>
              {section.sectionTypeSnapshot === "CRITICAL" && (
                <p className="text-xs text-red-500 mt-0.5">Sección crítica</p>
              )}
              {section.sectionTypeSnapshot === "INFORMATIVE" && (
                <p className="text-xs text-blue-500 mt-0.5">Solo informativa</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {section.status === "CONFIRMED" && (
                <span className="text-xs text-green-600 font-medium">✓ Confirmada</span>
              )}
              {section.status === "DEFERRED" && (
                <span className="text-xs text-orange-600">⟳ Diferida</span>
              )}
              {/* Diferir sección */}
              {job.status === "IN_PROGRESS" &&
                section.status === "PENDING" &&
                !isCompleted && (
                  <form action={deferTaskSection} className="inline">
                    <input type="hidden" name="sectionId" value={section.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <input
                      type="hidden"
                      name="reason"
                      value="Marcado como diferido por cleaner"
                    />
                    <button
                      type="submit"
                      className="text-xs text-orange-500 hover:underline"
                    >
                      Diferir
                    </button>
                  </form>
                )}
            </div>
          </div>

          {/* Pasos */}
          <div className="divide-y">
            {section.steps.map((step) => (
              <div key={step.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span
                    className={`text-sm mt-0.5 ${
                      step.status === "RESPONDED" ? "text-green-500" : "text-gray-300"
                    }`}
                  >
                    {step.status === "RESPONDED" ? "✓" : "○"}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{step.nameSnapshot}</p>
                    {step.descriptionSnapshot && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {step.descriptionSnapshot}
                      </p>
                    )}
                    {step.blocksCompletionSnapshot && (
                      <p className="text-xs text-red-500">Requerido para completar</p>
                    )}
                  </div>
                </div>

                {/* Respuesta según tipo */}
                {job.status === "IN_PROGRESS" &&
                  !isCompleted &&
                  section.status !== "DEFERRED" &&
                  step.responseTypeSnapshot !== "NONE" && (
                    <form action={respondTaskStep} className="ml-6 space-y-2">
                      <input type="hidden" name="stepId" value={step.id} />
                      <input type="hidden" name="jobId" value={job.id} />

                      {step.responseTypeSnapshot === "CONFIRMATION" && (
                        <input type="hidden" name="confirmed" value="true" />
                      )}

                      {step.responseTypeSnapshot === "YES_NO" && (
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            name="boolValue"
                            value="true"
                            className={`flex-1 py-2 rounded-lg text-sm border ${
                              step.response?.boolValue === true
                                ? "bg-green-600 text-white border-green-600"
                                : "bg-white text-gray-700 border-gray-200"
                            }`}
                          >
                            Sí
                          </button>
                          <button
                            type="submit"
                            name="boolValue"
                            value="false"
                            className={`flex-1 py-2 rounded-lg text-sm border ${
                              step.response?.boolValue === false
                                ? "bg-red-500 text-white border-red-500"
                                : "bg-white text-gray-700 border-gray-200"
                            }`}
                          >
                            No
                          </button>
                        </div>
                      )}

                      {step.responseTypeSnapshot === "NUMBER" && (
                        <div className="flex gap-2">
                          <input
                            name="numberValue"
                            type="number"
                            step="any"
                            defaultValue={step.response?.numberValue?.toString() ?? ""}
                            className="flex-1 border rounded-lg px-3 py-2 text-sm"
                            placeholder="Ingresa valor"
                          />
                          <button
                            type="submit"
                            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm"
                          >
                            OK
                          </button>
                        </div>
                      )}

                      {step.responseTypeSnapshot === "TEXT" && (
                        <div className="space-y-2">
                          <textarea
                            name="textValue"
                            rows={2}
                            defaultValue={step.response?.textValue ?? ""}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            placeholder="Escribe tu respuesta"
                          />
                          <button
                            type="submit"
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
                          >
                            Guardar
                          </button>
                        </div>
                      )}

                      {step.responseTypeSnapshot === "EVIDENCE" && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">
                            Evidencias: {step.evidenceAssets.filter(a => a.syncStatus === "UPLOADED").length} subidas
                          </p>
                          {step.evidenceAssets.length === 0 && (
                            <p className="text-xs text-red-500">
                              Se requiere evidencia fotográfica
                            </p>
                          )}
                        </div>
                      )}

                      {step.responseTypeSnapshot === "CONFIRMATION" && (
                        <button
                          type="submit"
                          className={`w-full py-2 rounded-lg text-sm font-medium border ${
                            step.status === "RESPONDED"
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white text-gray-700 border-gray-200 hover:border-green-400"
                          }`}
                        >
                          {step.status === "RESPONDED" ? "✓ Confirmado" : "Confirmar"}
                        </button>
                      )}
                    </form>
                  )}

                {/* Mostrar respuesta actual */}
                {step.response && (
                  <div className="ml-6 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                    {step.response.confirmed !== null && step.responseTypeSnapshot === "CONFIRMATION"
                      ? "✓ Confirmado"
                      : ""}
                    {step.response.boolValue !== null
                      ? step.response.boolValue
                        ? "✓ Sí"
                        : "✗ No"
                      : ""}
                    {step.response.numberValue !== null
                      ? `Valor: ${step.response.numberValue}`
                      : ""}
                    {step.response.textValue ? `"${step.response.textValue}"` : ""}
                    {step.response.notes ? ` · ${step.response.notes}` : ""}
                  </div>
                )}
              </div>
            ))}

            {/* Confirmar sección */}
            {job.status === "IN_PROGRESS" &&
              !isCompleted &&
              section.requiresGlobalConfirmSnapshot &&
              section.status !== "CONFIRMED" &&
              section.status !== "DEFERRED" && (
                <div className="px-4 py-3 bg-green-50">
                  <form action={confirmTaskSection}>
                    <input type="hidden" name="sectionId" value={section.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <button
                      type="submit"
                      className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                    >
                      Confirmar sección completa
                    </button>
                  </form>
                </div>
              )}
          </div>
        </div>
      ))}

      {/* Completar job */}
      {job.status === "IN_PROGRESS" && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3">
          <form action={completeTaskJob}>
            <input type="hidden" name="jobId" value={job.id} />
            <button
              type="submit"
              className="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700"
            >
              Completar tarea
            </button>
          </form>
        </div>
      )}

      {isCompleted && (
        <div className="text-center py-4">
          <p className="text-green-600 font-semibold">✓ Tarea completada</p>
          <p className="text-sm text-gray-400 mt-1">
            {job.completedAt
              ? new Date(job.completedAt).toLocaleString("es-MX", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
