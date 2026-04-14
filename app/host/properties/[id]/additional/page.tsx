// app/host/properties/[id]/additional/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { Property } from "@/lib/generated/prisma";
import Page from "@/lib/ui/Page";
import PageHeader from "@/lib/ui/PageHeader";
import { deleteProperty, deactivateProperty, activateProperty } from "../../actions";
import ConfirmModalWrapper from "../ConfirmModalWrapper";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";

export default async function PropertyAdditionalInfoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string; action?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const property = await prisma.property.findFirst({
    where: {
      id: resolvedParams.id,
      tenantId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!property) notFound();

  const typedProperty = property as unknown as Property & {
    user: { id: string; name: string | null; email: string };
    isActive: boolean;
  };
  
  // Validar returnTo y usar fallback seguro
  // MUST: Fallback siempre a /host/properties (lista), nunca a la misma URL del detalle
  const returnTo = safeReturnTo(
    resolvedSearchParams?.returnTo ? String(resolvedSearchParams.returnTo) : undefined,
    "/host/properties"
  );
  
  const isConfirmingDelete = resolvedSearchParams?.action === "delete";
  const isConfirmingDeactivate = resolvedSearchParams?.action === "deactivate";

  return (
    <>
      <ConfirmModalWrapper
        propertyId={typedProperty.id}
        returnTo={returnTo}
        isConfirmingDelete={isConfirmingDelete}
        isConfirmingDeactivate={isConfirmingDeactivate}
        propertyName={typedProperty.name}
        isActive={typedProperty.isActive}
      />
      <Page
        showBack
        backHref={returnTo}
        title="Información adicional"
        subtitle={typedProperty.name}
        variant="compact"
      >
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
          <div>
            <p className="text-xs text-neutral-500 mb-1">Propietario</p>
            <p className="text-base text-neutral-900">
              {typedProperty.user.name || typedProperty.user.email}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-1">ID</p>
            <p className="text-base text-neutral-900 font-mono text-xs">
              {typedProperty.id}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-1">Creada</p>
            <p className="text-base text-neutral-900">
              {typedProperty.createdAt.toLocaleString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-1">Última actualización</p>
            <p className="text-base text-neutral-900">
              {typedProperty.updatedAt.toLocaleString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        {/* Acciones peligrosas */}
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3 mt-6">
          <div className="space-y-2">
            {typedProperty.isActive ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/host/properties/${typedProperty.id}/additional?returnTo=${encodeURIComponent(returnTo)}&action=deactivate`}
                    className="flex-1 block rounded-lg border border-amber-300 bg-white px-3 py-2 text-base font-medium text-amber-700 hover:bg-amber-50 active:scale-[0.99] transition text-center"
                  >
                    Inactivar propiedad
                  </Link>

                  <Link
                    href={`/host/properties/${typedProperty.id}/additional?returnTo=${encodeURIComponent(returnTo)}&action=delete`}
                    className="flex-1 block rounded-lg border border-red-300 bg-white px-3 py-2 text-base font-medium text-red-700 hover:bg-red-50 active:scale-[0.99] transition text-center"
                  >
                    Eliminar propiedad
                  </Link>
                </div>

                <p className="text-xs text-red-700">
                  <strong>Inactivar:</strong> La propiedad dejará de generar actividades futuras, pero se conservarán todos los datos históricos.
                  <br />
                  <strong>Eliminar:</strong> Se eliminará completamente la propiedad y todos sus datos relacionados (reservas, limpiezas, cerraduras, etc.).
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <form action={activateProperty} className="flex-1">
                    <input type="hidden" name="propertyId" value={typedProperty.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-base font-medium text-emerald-700 hover:bg-emerald-50 active:scale-[0.99] transition"
                    >
                      Reactivar propiedad
                    </button>
                  </form>

                  <Link
                    href={`/host/properties/${typedProperty.id}/additional?returnTo=${encodeURIComponent(returnTo)}&action=delete`}
                    className="flex-1 block rounded-lg border border-red-300 bg-white px-3 py-2 text-base font-medium text-red-700 hover:bg-red-50 active:scale-[0.99] transition text-center"
                  >
                    Eliminar propiedad
                  </Link>
                </div>

                <p className="text-xs text-red-700">
                  <strong>Eliminar:</strong> Se eliminará completamente la propiedad y todos sus datos relacionados (reservas, limpiezas, cerraduras, etc.).
                </p>
              </div>
            )}
          </div>
        </section>
      </Page>
    </>
  );
}


