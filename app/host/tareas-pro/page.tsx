// app/host/tareas-pro/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { createTaskTemplate } from "./actions";

export default async function TareasProPage() {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const properties = await prisma.property.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, shortName: true },
    orderBy: { name: "asc" },
  });

  const templates = await prisma.taskTemplate.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      property: { select: { name: true, shortName: true } },
      _count: { select: { sections: true, jobs: true } },
    },
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tareas Pro</h1>
          <p className="text-sm text-gray-500 mt-0.5">Estándares operativos por propiedad</p>
        </div>
        <Link
          href="/host/tareas-pro/jobs"
          className="text-sm text-blue-600 hover:underline"
        >
          Ver jobs
        </Link>
      </div>

      {/* Crear template */}
      <details className="border rounded-xl p-4">
        <summary className="font-medium cursor-pointer select-none">
          + Nueva plantilla
        </summary>
        <form action={createTaskTemplate} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Propiedad</label>
            <select name="propertyId" required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Seleccionar...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortName ?? p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              name="name"
              required
              placeholder="Ej: Protocolo limpieza checkout"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descripción (opcional)</label>
            <textarea
              name="description"
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Crear plantilla
          </button>
        </form>
      </details>

      {/* Lista de templates */}
      <div className="space-y-2">
        {templates.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Aún no hay plantillas. Crea la primera.
          </p>
        ) : (
          templates.map((t) => (
            <Link
              key={t.id}
              href={`/host/tareas-pro/${t.id}`}
              className="flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t.property.shortName ?? t.property.name} ·{" "}
                  {t._count.sections} secciones · {t._count.jobs} jobs
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  t.status === "ACTIVE"
                    ? "bg-green-100 text-green-700"
                    : t.status === "DRAFT"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {t.status === "ACTIVE" ? "Activo" : t.status === "DRAFT" ? "Borrador" : "Inactivo"}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
