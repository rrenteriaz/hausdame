// app/host/tareas-pro/[templateId]/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  updateTaskTemplate,
  updateTaskTemplateSchedule,
  createTaskSection,
  updateTaskSection,
  deleteTaskSection,
  createTaskStep,
  updateTaskStep,
  deleteTaskStep,
  generateTaskJobAction,
} from "../actions";
import { SubmitConfirmButton } from "../components/SubmitConfirmButton";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const { templateId } = await params;

  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, tenantId },
    include: {
      property: { select: { name: true, shortName: true } },
      schedule: true,
      sections: {
        orderBy: { order: "asc" },
        include: {
          steps: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!template) notFound();

  const sectionTypeLabels: Record<string, string> = {
    INFORMATIVE: "Solo revisión",
    STANDARD: "Normal",
    CRITICAL: "Obligatoria",
  };

  const responseTypeLabels: Record<string, string> = {
    NONE: "Sin respuesta",
    CONFIRMATION: "Confirmación",
    YES_NO: "Sí / No",
    NUMBER: "Número",
    TEXT: "Texto",
    EVIDENCE: "Evidencia fotográfica",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/host/tareas-pro" className="text-gray-400 hover:text-gray-700 mt-0.5">
          ←
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{template.name}</h1>
          <p className="text-xs text-gray-400">
            {template.property.shortName ?? template.property.name}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            template.status === "ACTIVE"
              ? "bg-green-100 text-green-700"
              : template.status === "DRAFT"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {template.status === "ACTIVE" ? "Activo" : template.status === "DRAFT" ? "Borrador" : "Inactivo"}
        </span>
      </div>

      {/* Editar checklist */}
      <details className="border rounded-xl p-4">
        <summary className="font-medium cursor-pointer select-none text-sm">
          Editar checklist
        </summary>
        <form action={updateTaskTemplate} className="mt-4 space-y-3">
          <input type="hidden" name="templateId" value={template.id} />
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Nombre</label>
            <input
              name="name"
              defaultValue={template.name}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Descripción</label>
            <textarea
              name="description"
              defaultValue={template.description ?? ""}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Estado</label>
            <select
              name="status"
              defaultValue={template.status}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="DRAFT">Borrador</option>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
            Guardar cambios
          </button>
        </form>
      </details>

      {/* Frecuencia */}
      <details className="border rounded-xl p-4">
        <summary className="font-medium cursor-pointer select-none text-sm">
          ¿Cada cuándo se debe hacer?
        </summary>
        <form action={updateTaskTemplateSchedule} className="mt-4 space-y-3">
          <input type="hidden" name="templateId" value={template.id} />
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Frecuencia</label>
            <select
              name="frequency"
              defaultValue={template.schedule?.frequency ?? "MANUAL"}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="MANUAL">Manual</option>
              <option value="PER_CHECKOUT">Por checkout</option>
              <option value="DAILY">Diaria</option>
              <option value="WEEKLY">Semanal</option>
              <option value="MONTHLY">Mensual</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Ej: limpieza diaria, semanal o después de cada huésped
            </p>
          </div>

          {/* Opciones avanzadas */}
          <details className="border rounded-lg p-3">
            <summary className="text-xs text-gray-500 cursor-pointer select-none hover:text-gray-700">
              Mostrar opciones avanzadas
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">
                  Si no se completa, ¿qué pasa?
                </label>
                <select
                  name="carryForwardPolicy"
                  defaultValue={template.schedule?.carryForwardPolicy ?? "LIMITED"}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="LIMITED">Reintentar (limitado)</option>
                  <option value="UNLIMITED">Siempre reintentar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">
                  Máximo de reintentos
                </label>
                <input
                  name="maxCarryForwardAttempts"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={template.schedule?.maxCarryForwardAttempts ?? 2}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </details>

          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
            Guardar configuración
          </button>
        </form>
      </details>

      {/* Generar tarea manual */}
      {template.status === "ACTIVE" && (
        <div className="border rounded-xl p-4 bg-blue-50 border-blue-200">
          <p className="text-sm font-medium text-blue-800 mb-3">Generar tarea manualmente</p>
          <form action={generateTaskJobAction} className="space-y-2">
            <input type="hidden" name="templateId" value={template.id} />
            <input type="hidden" name="propertyId" value={template.propertyId} />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Generar tarea ahora
            </button>
          </form>
        </div>
      )}

      {/* Áreas */}
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold">Áreas ({template.sections.length})</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Divide tu checklist por áreas como cocina, baño, etc.
          </p>
        </div>

        {template.sections.map((section) => (
          <div key={section.id} className="border rounded-xl overflow-hidden">
            {/* Header área */}
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{section.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {sectionTypeLabels[section.sectionType]} · {section.steps.length} pasos
                </p>
              </div>
              <div className="flex gap-2">
                <details className="relative">
                  <summary className="cursor-pointer text-xs text-blue-600 hover:underline list-none">
                    Editar
                  </summary>
                  <div className="absolute right-0 top-6 z-10 bg-white border rounded-xl shadow-lg p-4 w-72">
                    <form action={updateTaskSection} className="space-y-3">
                      <input type="hidden" name="sectionId" value={section.id} />
                      <input
                        name="name"
                        defaultValue={section.name}
                        required
                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        placeholder="Nombre del área"
                      />
                      <textarea
                        name="description"
                        defaultValue={section.description ?? ""}
                        rows={2}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        placeholder="Descripción"
                      />
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">
                          Nivel de importancia
                        </label>
                        <select
                          name="sectionType"
                          defaultValue={section.sectionType}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        >
                          <option value="STANDARD">Normal</option>
                          <option value="INFORMATIVE">Solo revisión</option>
                          <option value="CRITICAL">Obligatoria</option>
                        </select>
                      </div>
                      <details className="border rounded-lg p-2">
                        <summary className="text-xs text-gray-500 cursor-pointer select-none hover:text-gray-700">
                          Opciones avanzadas
                        </summary>
                        <label className="flex items-center gap-2 text-sm mt-2">
                          <input
                            type="checkbox"
                            name="requiresGlobalConfirm"
                            value="true"
                            defaultChecked={section.requiresGlobalConfirm}
                          />
                          Requiere confirmación global
                        </label>
                      </details>
                      <button
                        type="submit"
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs w-full"
                      >
                        Guardar
                      </button>
                    </form>
                  </div>
                </details>
                <form action={deleteTaskSection}>
                  <input type="hidden" name="sectionId" value={section.id} />
                  <SubmitConfirmButton
                    confirmMessage="¿Eliminar área y todos sus pasos?"
                    className="text-xs text-red-500 hover:underline"
                  >
                    Eliminar
                  </SubmitConfirmButton>
                </form>
              </div>
            </div>

            {/* Pasos */}
            <div className="divide-y">
              {section.steps.map((step) => (
                <div key={step.id} className="px-4 py-3 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm">{step.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {responseTypeLabels[step.responseType]}
                      {step.isRequired ? " · Obligatorio" : ""}
                      {step.blocksCompletion ? " · Bloquea cierre" : ""}
                    </p>
                  </div>
                  <form action={deleteTaskStep}>
                    <input type="hidden" name="stepId" value={step.id} />
                    <SubmitConfirmButton
                      confirmMessage="¿Eliminar este paso?"
                      className="text-xs text-red-400 hover:underline ml-3"
                    >
                      ×
                    </SubmitConfirmButton>
                  </form>
                </div>
              ))}

              {/* Agregar paso */}
              <details className="px-4 py-3">
                <summary className="text-xs text-blue-600 cursor-pointer select-none hover:underline">
                  + Agregar paso
                </summary>
                <form action={createTaskStep} className="mt-3 space-y-2">
                  <input type="hidden" name="sectionId" value={section.id} />
                  <input
                    name="name"
                    required
                    placeholder="Nombre del paso"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  />
                  <textarea
                    name="description"
                    placeholder="Instrucciones (opcional)"
                    rows={2}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  />
                  <select
                    name="responseType"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="NONE">Sin respuesta</option>
                    <option value="CONFIRMATION">Confirmación</option>
                    <option value="YES_NO">Sí / No</option>
                    <option value="NUMBER">Número</option>
                    <option value="TEXT">Texto libre</option>
                    <option value="EVIDENCE">Evidencia fotográfica</option>
                  </select>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="isRequired" value="true" defaultChecked />
                      Obligatorio
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="blocksCompletion" value="true" />
                      Bloquea cierre
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs"
                  >
                    Agregar paso
                  </button>
                </form>
              </details>
            </div>
          </div>
        ))}

        {/* Agregar área */}
        <details className="border rounded-xl p-4">
          <summary className="text-sm font-medium cursor-pointer select-none">
            + Agregar área
          </summary>
          <form action={createTaskSection} className="mt-4 space-y-3">
            <input type="hidden" name="templateId" value={template.id} />
            <input
              name="name"
              required
              placeholder="Nombre del área (ej: Cocina, Baño, Dormitorio)"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              placeholder="Descripción (opcional)"
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">
                Nivel de importancia
              </label>
              <select name="sectionType" className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="STANDARD">Normal</option>
                <option value="INFORMATIVE">Solo revisión</option>
                <option value="CRITICAL">Obligatoria</option>
              </select>
            </div>
            <details className="border rounded-lg p-3">
              <summary className="text-xs text-gray-500 cursor-pointer select-none hover:text-gray-700">
                Opciones avanzadas
              </summary>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" name="requiresGlobalConfirm" value="true" />
                Requiere confirmación global
              </label>
            </details>
            <button
              type="submit"
              className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm"
            >
              Agregar área
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
