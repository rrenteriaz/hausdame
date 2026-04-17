// app/cleaner/cleanings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireCleanerAccessToCleaning } from "@/lib/cleaner/requireCleanerAccessToCleaning";
import { checkCleaningPropertyAccess } from "@/lib/cleaner/checkCleaningPropertyAccess";
import { acceptCleaning, startCleaning, completeCleaning, declineCleaning } from "../../actions";
import CleaningChecklist from "./CleaningChecklist";
import CompleteCleaningButton from "./CompleteCleaningButton";
import CollapsibleChecklist from "./CollapsibleChecklist";
import CleaningDetailClient from "./CleaningDetailClient";
import SubmittedInventoryCard from "./SubmittedInventoryCard";
import InventoryPreviewCard from "./InventoryPreviewCard";
import InventoryPreviewList from "./InventoryPreviewList";
import InventoryProblemsCard from "./InventoryProblemsCard";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import { createChecklistSnapshotForCleaning } from "@/lib/checklist-snapshot";
import { fetchActiveInventoryLines, fetchInventoryReview } from "@/lib/inventory-review-queries";
import { fetchInventoryHistoryStats } from "@/lib/inventory-history-queries";
import Page from "@/lib/ui/Page";
import { getActiveMembershipsForUser } from "@/lib/cleaner/getActiveMembershipsForUser";
import { getChecklistItemThumbsByProperty } from "@/lib/media/getChecklistItemThumbsByProperty";
import { getInventoryLineImageThumbsBatch } from "@/lib/media/getInventoryLineImageThumbs";
import TareasProBlock from "./TareasProBlock";

function safeReturnTo(input?: string, memberId?: string): string {
  const baseUrl = memberId ? `/cleaner?memberId=${encodeURIComponent(memberId)}` : "/cleaner";
  if (!input) return baseUrl;
  // Evitar open-redirect: solo permitimos volver a /cleaner...
  if (input.startsWith("/cleaner")) return input;
  return baseUrl;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string) {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "IN_PROGRESS":
      return "En progreso";
    case "COMPLETED":
      return "Completada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

function formatAssignmentStatus(status: string) {
  switch (status) {
    case "OPEN":
      return "Disponible";
    case "ASSIGNED":
      return "Asignada";
    default:
      return status;
  }
}

export default async function CleanerCleaningDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ memberId?: string; returnTo?: string }>;
}) {
  // Next.js App Router: params/searchParams como Promise
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const memberIdParam = resolvedSearchParams?.memberId;

  // PASO 1: Verificar acceso a la propiedad (permite preview sin asignación)
  const propertyAccess = await checkCleaningPropertyAccess(resolvedParams.id);
  
  // Si no tiene acceso a la propiedad, mostrar acceso denegado
  if (!propertyAccess.hasAccess) {
    const returnToParam = resolvedSearchParams?.returnTo;
    const backHref = returnToParam && returnToParam.startsWith("/cleaner")
      ? returnToParam
      : "/cleaner/cleanings/available";
    
    return (
      <Page title="Acceso denegado" containerClassName="pt-6">
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-base text-neutral-600">
            No tienes acceso a esta limpieza.
          </p>
          <Link
            href={backHref}
            className="mt-4 inline-block text-primary-600 hover:text-primary-700 underline"
          >
            Volver a limpiezas
          </Link>
        </div>
      </Page>
    );
  }

  // PASO 2: Si está asignado, usar requireCleanerAccessToCleaning para obtener datos completos
  // Si NO está asignado, cargar datos básicos para preview
  let access;
  let isPreviewMode = false;
  
  if (propertyAccess.isAssigned) {
    // Está asignado: usar función completa que valida asignación
    try {
      access = await requireCleanerAccessToCleaning(resolvedParams.id);
    } catch (error: any) {
      const status = (error as any).status || 403;
      if (status === 404) {
        notFound();
      }
      // Si falla pero tiene acceso a propiedad, mostrar preview
      isPreviewMode = true;
    }
  } else {
    // NO está asignado: modo preview
    isPreviewMode = true;
  }

  // Si está en modo preview, cargar datos básicos sin validar asignación
  if (isPreviewMode && !access) {
    // Cargar datos básicos para preview (sin datos sensibles)
    const context = await (await import("@/lib/cleaner/resolveCleanerContext")).resolveCleanerContext();
    const cleaningPreview = await prisma.cleaning.findUnique({
      where: { id: resolvedParams.id },
      select: {
        id: true,
        teamId: true,
        tenantId: true,
        scheduledDate: true,
        status: true,
        notes: true,
        assignedMembershipId: true,
        assignmentStatus: true,
        startedAt: true,
        completedAt: true,
        scheduledAtPlanned: true,
        property: {
          select: {
            id: true,
            name: true,
            shortName: true,
            address: true,
            latitude: true,
            longitude: true,
            coverAssetGroupId: true,
            checkInTime: true,
            checkOutTime: true,
            // NO incluir: wifiSsid, wifiPassword, accessCode
          },
        },
      },
    });

    if (!cleaningPreview) {
      notFound();
    }

    // Crear objeto access mínimo para preview
    access = {
      user: context.user,
      cleaning: cleaningPreview as any,
      mode: context.mode,
      membership: context.mode === "membership" ? context.memberships?.[0] : undefined,
      legacyMember: undefined, // LEGACY RETIRADO
    };
  }

  const { user, cleaning, mode, membership } = access!;
  const tenantId = cleaning.tenantId;

  // PASO 3: Props que esperaban currentMemberId
  // LEGACY RETIRADO: Ya no existe modo legacy
  // Obtener memberId para compatibilidad con componentes que lo necesitan
  let currentMemberId: string = "";
  if (mode === "membership") {
    // Intentar obtener TeamMember asociado si existe (para compatibilidad)
    // IMPORTANTE: cleaning.teamId puede ser null; Prisma no acepta teamId: null en filtros.
    if (cleaning.teamId) {
      const teamMember = await (prisma as any).teamMember.findFirst({
        where: {
          userId: user.id,
          teamId: cleaning.teamId,
          isActive: true,
        },
        select: { id: true },
      });
      if (teamMember) {
        currentMemberId = teamMember.id;
      }
    }
  }

  // PASO 2: La limpieza ya viene cargada desde requireCleanerAccessToCleaning
  // Pero necesitamos cargar cleaningChecklistItems y otras relaciones adicionales
  
  // Sincronizar checklist con la plantilla si la limpieza está activa (PENDING/IN_PROGRESS)
  if (cleaning.status === "PENDING" || cleaning.status === "IN_PROGRESS") {
    await (await import("@/lib/checklist-snapshot")).syncChecklistSnapshotForCleaning(
      tenantId,
      cleaning.property.id,
      cleaning.id
    );
  }

  const cleaningWithChecklist = await (prisma as any).cleaning.findUnique({
    where: { id: cleaning.id },
    select: {
      id: true,
      cleaningChecklistItems: {
        where: {
          isRemovedFromTemplate: false, // Solo mostrar items que siguen vigentes en la plantilla
        },
        orderBy: [
          { area: "asc" },
          { sortOrder: "asc" },
        ],
      },
    },
  });

  const cleaningChecklistItems = cleaningWithChecklist?.cleaningChecklistItems || [];

  // Obtener thumbs de imágenes para hacer match con los items del checklist
  const checklistThumbsMap = await getChecklistItemThumbsByProperty(cleaning.property.id, tenantId);

  // Si viene returnTo del calendario, usarlo; si no, construir uno por defecto
  const returnToParam = resolvedSearchParams?.returnTo;
  const backUrl = returnToParam && returnToParam.startsWith("/cleaner")
    ? returnToParam
    : "/cleaner/cleanings/available"; // Default: volver a limpiezas disponibles
  const returnTo = safeReturnTo(returnToParam || `/cleaner/cleanings/available`, memberIdParam);
  
  // PASO 3: Ajustar lógica de asignación
  // En modo preview, no puede ver secretos ni operar
  if (isPreviewMode) {
    // En preview, ocultar datos sensibles
    (cleaning as any).property = {
      ...cleaning.property,
      wifiSsid: null,
      wifiPassword: null,
      accessCode: null,
    };
  }

  const membershipAccess = await getActiveMembershipsForUser(user.id);
  const canSeeSecrets =
    !isPreviewMode &&
    cleaning.assignmentStatus === "ASSIGNED" &&
    !!cleaning.assignedMembershipId &&
    (membershipAccess?.membershipIds || []).includes(cleaning.assignedMembershipId);

  const isHistoricalMembership = membership?.status === "REMOVED";
  const isAssignedToMe = !!membership && cleaning.assignedMembershipId === membership.id;

  // En modo preview, no puede ver secretos
  if (!canSeeSecrets && !isPreviewMode) {
    (cleaning as any).property = {
      ...cleaning.property,
      wifiSsid: null,
      wifiPassword: null,
      accessCode: null,
    };
  }
  
  const isOpen = cleaning.assignmentStatus === "OPEN";
  const canAccept =
    !isHistoricalMembership &&
    isOpen &&
    !cleaning.assignedMembershipId;
  const canOperate =
    !isPreviewMode &&
    isAssignedToMe &&
    !isHistoricalMembership &&
    (cleaning.status === "PENDING" || cleaning.status === "IN_PROGRESS");
  const canDecline = !isPreviewMode && isAssignedToMe && !isHistoricalMembership && cleaning.status === "PENDING";

  // Sincronizar Tareas Pro: auto-generar jobs para templates activos de la propiedad
  // Solo cuando el cleaner está asignado y la limpieza está activa
  if (isAssignedToMe && (cleaning.status === "PENDING" || cleaning.status === "IN_PROGRESS")) {
    await (await import("@/lib/tareas-pro/sync-for-cleaning")).syncTaskJobsForCleaning({
      tenantId,
      propertyId: cleaning.property.id,
      cleaningId: cleaning.id,
      cleaningStatus: cleaning.status,
      actorId: user.id,
    });
  }

  // Obtener inventario activo de la propiedad y revisión completa
  // Usar lib compartida (no host actions) para evitar redirect: requireHostUser redirige CLEANER a /cleaner
  const [inventoryLines, inventoryReview] = await Promise.all([
    fetchActiveInventoryLines(cleaning.property.id, tenantId),
    fetchInventoryReview(cleaning.id, tenantId),
  ]);

  // Obtener estadísticas de historial y thumbnails para las líneas mostradas
  const lineIds = inventoryLines.map(l => l.id);
  const [historyStatsMap, lineThumbsBatchMap] = await Promise.all([
    fetchInventoryHistoryStats(lineIds, tenantId),
    getInventoryLineImageThumbsBatch(inventoryLines.map(l => ({ id: l.id, itemId: l.item.id }))),
  ]);

  // Convertir Map a Record para props del cliente
  const lineThumbs: Record<string, Array<string | null>> = {};
  for (const [lineId, thumbs] of lineThumbsBatchMap) {
    lineThumbs[lineId] = thumbs;
  }

  // Aumentar líneas con estadísticas de historial
  const linesWithHistory = inventoryLines.map(line => ({
    ...line,
    historyStats: historyStatsMap.get(line.id) || null,
  }));

  // Tareas Pro: obligaciones periódicas asignadas a esta limpieza (para contexto al Cleaner)
  const assignedRecurringDues = isAssignedToMe
    ? await prisma.taskRecurringDue.findMany({
        where: { assignedCleaningId: cleaning.id, status: "ASSIGNED" },
        select: { id: true, frequency: true, periodKey: true },
      })
    : [];

  // Tareas Pro: obtener jobs vinculados directamente a esta limpieza (generados por syncTaskJobsForCleaning)
  const tareasProJobsRaw = isAssignedToMe
    ? await prisma.taskJob.findMany({
        where: {
          tenantId,
          cleaningId: cleaning.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        include: {
          property: { select: { name: true, shortName: true } },
          sections: {
            orderBy: { order: "asc" },
            include: {
              steps: {
                orderBy: { order: "asc" },
                include: {
                  response: true,
                  evidenceAssets: {
                    where: { syncStatus: "UPLOADED" },
                    orderBy: { order: "asc" },
                    include: { asset: { select: { publicUrl: true } } },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const tareasProJobs = tareasProJobsRaw.map((tjob) => ({
    job: {
      id: tjob.id,
      templateNameSnapshot: tjob.templateNameSnapshot,
      status: tjob.status,
      property: tjob.property,
    },
    initialSections: tjob.sections.map((section) => ({
      id: section.id,
      nameSnapshot: section.nameSnapshot,
      sectionTypeSnapshot: section.sectionTypeSnapshot,
      requiresGlobalConfirmSnapshot: section.requiresGlobalConfirmSnapshot,
      order: section.order,
      status: section.status,
      isCarryForwardInjected: section.isCarryForwardInjected,
      steps: section.steps.map((step) => ({
        id: step.id,
        nameSnapshot: step.nameSnapshot,
        descriptionSnapshot: step.descriptionSnapshot,
        capturesYesNoSnapshot: step.capturesYesNoSnapshot,
        yesNoRequiredSnapshot: step.yesNoRequiredSnapshot,
        capturesNumberSnapshot: step.capturesNumberSnapshot,
        numberRequiredSnapshot: step.numberRequiredSnapshot,
        capturesPhotoSnapshot: step.capturesPhotoSnapshot,
        photoRequiredSnapshot: step.photoRequiredSnapshot,
        capturesTextSnapshot: step.capturesTextSnapshot,
        textRequiredSnapshot: step.textRequiredSnapshot,
        isRequiredSnapshot: step.isRequiredSnapshot,
        blocksCompletionSnapshot: step.blocksCompletionSnapshot,
        snapshotVersion: step.snapshotVersion,
        order: step.order,
        status: step.status,
        response: step.response
          ? {
              confirmed: step.response.confirmed,
              boolValue: step.response.boolValue,
              numberValue: step.response.numberValue !== null
                ? Number(step.response.numberValue)
                : null,
              textValue: step.response.textValue,
              notes: step.response.notes,
            }
          : null,
        evidencePhotos: step.evidenceAssets.flatMap((ea) =>
          ea.asset?.publicUrl ? [{ id: ea.id, thumbUrl: ea.asset.publicUrl }] : []
        ),
      })),
    })),
  }));

  // Nota: No calculamos attentionReasons en cleaner - es exclusivo de Host

  return (
    <Page
      showBack
      backHref={backUrl}
      title="Detalle de limpieza"
      subtitle={`${cleaning.property.shortName || cleaning.property.name} · ${formatDateTime(cleaning.scheduledDate)} · ${formatStatus(cleaning.status)}`}
      variant="compact"
    >

      <div className="space-y-4">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <CollapsibleSection title="Datos de la propiedad" defaultOpen>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1">Propiedad</p>
                <p className="text-base font-semibold text-neutral-900">
                  {cleaning.property.shortName || cleaning.property.name}
                </p>
              </div>

              {/* Domicilio y Ubicación */}
              {(cleaning.property.address || (cleaning.property.latitude && cleaning.property.longitude)) && (
                <div className="pt-3 border-t border-neutral-200 space-y-2">
                  {cleaning.property.address && (
                    <div>
                      <p className="text-xs text-neutral-500 mb-1">Domicilio</p>
                      <p className="text-base text-neutral-900">
                        {cleaning.property.address}
                      </p>
                    </div>
                  )}
                  
                  {/* Botón Abrir ubicación */}
                  {(() => {
                    let mapsUrl: string | null = null;
                    
                    // Preferencia 1: lat/lng si existen
                    if (cleaning.property.latitude && cleaning.property.longitude) {
                      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${cleaning.property.latitude},${cleaning.property.longitude}`;
                    }
                    // Preferencia 2: address si no hay coords
                    else if (cleaning.property.address) {
                      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleaning.property.address)}`;
                    }
                    
                    if (mapsUrl) {
                      return (
                        <div>
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-base font-medium text-neutral-900 hover:text-neutral-700 transition-colors"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            Abrir ubicación
                          </a>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              <div>
                <p className="text-xs text-neutral-500">Fecha y hora</p>
                <p className="text-base text-neutral-900">{formatDateTime(cleaning.scheduledDate)}</p>
              </div>

              {(cleaning.property.checkInTime || cleaning.property.checkOutTime) && (
                <div className="pt-3 border-t border-neutral-200">
                  <p className="text-xs text-neutral-500 mb-2">Horario de la propiedad</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cleaning.property.checkInTime && (
                      <div>
                        <p className="text-xs text-neutral-500">Hora de check-in</p>
                        <p className="text-base text-neutral-900">{cleaning.property.checkInTime}</p>
                      </div>
                    )}
                    {cleaning.property.checkOutTime && (
                      <div>
                        <p className="text-xs text-neutral-500">Hora de check-out</p>
                        <p className="text-base text-neutral-900">{cleaning.property.checkOutTime}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs text-neutral-500">Estado</p>
                <p className="text-base text-neutral-900">{formatStatus(cleaning.status)}</p>
              </div>

              <div>
                <p className="text-xs text-neutral-500">Asignación</p>
                <p className="text-base text-neutral-900">
                  {formatAssignmentStatus(cleaning.assignmentStatus)}
                  {cleaning.assignedMember && (
                    <>
                      {" "}· {cleaning.assignedMember.name} ({cleaning.assignedMember.team.name})
                    </>
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-neutral-500">Notas</p>
                <p className="text-base text-neutral-900">
                  {cleaning.notes?.trim() ? cleaning.notes : "—"}
                </p>
              </div>

              {cleaning.startedAt && (
                <div>
                  <p className="text-xs text-neutral-500">Iniciada</p>
                  <p className="text-base text-neutral-900">
                    {formatDateTime(cleaning.startedAt)}
                  </p>
                </div>
              )}

              {cleaning.completedAt && (
                <div>
                  <p className="text-xs text-neutral-500">Completada</p>
                  <p className="text-base text-neutral-900">
                    {formatDateTime(cleaning.completedAt)}
                  </p>
                </div>
              )}

              {canSeeSecrets ? (
                (cleaning.property.wifiSsid ||
                  cleaning.property.wifiPassword ||
                  cleaning.property.accessCode) && (
                  <div className="pt-3 border-t border-neutral-200">
                    <p className="text-xs text-neutral-500 mb-2">Acceso y conectividad</p>
                    <div className="space-y-2">
                      {cleaning.property.wifiSsid && (
                        <div>
                          <p className="text-xs text-neutral-500">Red Wi-Fi</p>
                          <p className="text-base text-neutral-900">{cleaning.property.wifiSsid}</p>
                        </div>
                      )}
                      {cleaning.property.wifiPassword && (
                        <div>
                          <p className="text-xs text-neutral-500">Contraseña Wi-Fi</p>
                          <p className="text-base text-neutral-900 break-all">
                            {cleaning.property.wifiPassword}
                          </p>
                        </div>
                      )}
                      {cleaning.property.accessCode && (
                        <div>
                          <p className="text-xs text-neutral-500">Clave de acceso</p>
                          <p className="text-base text-neutral-900 break-all">
                            {cleaning.property.accessCode}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="pt-3 border-t border-neutral-200">
                  <p className="text-xs text-neutral-500 mb-2">Acceso y conectividad</p>
                  <p className="text-sm text-neutral-500">
                    Disponible cuando aceptes la limpieza.
                  </p>
                </div>
              )}
            </div>
          </CollapsibleSection>
        </section>

        {/* Checklist */}
        {cleaningChecklistItems && cleaningChecklistItems.length > 0 && (
          <CollapsibleChecklist
            title="Checklist"
            itemsCount={cleaningChecklistItems.length}
            completedCount={cleaningChecklistItems.filter((item: any) => item.isCompleted).length}
          >
            <CleaningChecklist
              cleaningId={cleaning.id}
              items={cleaningChecklistItems.map((item: any) => ({
                id: item.id,
                area: item.area,
                title: item.title,
                sortOrder: item.sortOrder,
                isCompleted: item.isCompleted,
                requiresValue: item.requiresValue || false,
                valueLabel: item.valueLabel,
                valueNumber: item.valueNumber,
                notCompletedReasonCode: item.notCompletedReasonCode,
                notCompletedReasonNote: item.notCompletedReasonNote,
              }))}
              canEdit={canOperate}
              checklistThumbsMap={checklistThumbsMap}
            />
          </CollapsibleChecklist>
        )}

        {/* Tareas Pro — bloque colapsable justo arriba del inventario */}
        {isAssignedToMe && (
          <TareasProBlock jobs={tareasProJobs} periodicCount={assignedRecurringDues.length} />
        )}

        {/* Inventario (solo referencia) en PENDING */}
        {cleaning.status === "PENDING" && inventoryLines.length > 0 && (
          <>
            <InventoryProblemsCard cleaningId={cleaning.id} returnTo={returnTo} />
            <InventoryPreviewCard itemsCount={linesWithHistory.length}>
              <InventoryPreviewList
                lines={linesWithHistory as any}
                lineThumbs={lineThumbs}
                tenantId={tenantId}
              />
            </InventoryPreviewCard>
          </>
        )}

        {/* Acciones para PENDING */}
        {canAccept && (
          <section className="p-4">
            <form action={acceptCleaning}>
              <input type="hidden" name="cleaningId" value={cleaning.id} />
              {memberIdParam && (
                <input type="hidden" name="memberId" value={memberIdParam} />
              )}
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
              >
                Aceptar limpieza
              </button>
            </form>
          </section>
        )}

        {isAssignedToMe && canOperate && cleaning.status === "PENDING" && (
          <section className="p-4">
            <div className="space-y-3">
              <form action={startCleaning}>
                <input type="hidden" name="cleaningId" value={cleaning.id} />
                {memberIdParam && (
                  <input type="hidden" name="memberId" value={memberIdParam} />
                )}
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
                >
                  Iniciar limpieza
                </button>
              </form>
              {canDecline && (
                <form action={declineCleaning}>
                  <input type="hidden" name="cleaningId" value={cleaning.id} />
                  {memberIdParam && (
                    <input type="hidden" name="memberId" value={memberIdParam} />
                  )}
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition"
                  >
                    Declinar limpieza
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

        {/* Inventario y acciones para IN_PROGRESS */}
        {cleaning.status === "IN_PROGRESS" && (
          <CleaningDetailClient
            cleaningId={cleaning.id}
            propertyId={cleaning.property.id}
            review={inventoryReview}
            inventoryLines={linesWithHistory as any}
            tenantId={tenantId}
            checklistItems={
              cleaningChecklistItems?.map((item: any) => ({
                id: item.id,
                title: item.title,
                isCompleted: item.isCompleted,
              })) || []
            }
            returnTo={returnTo}
            memberId={memberIdParam}
            cleaningStatus={cleaning.status}
          />
        )}

        {/* Inventario enviado para limpiezas históricas (COMPLETED, CANCELLED, etc.) */}
        {cleaning.status !== "IN_PROGRESS" && cleaning.status !== "PENDING" && (
          <>
            <InventoryProblemsCard cleaningId={cleaning.id} returnTo={returnTo} />
            <SubmittedInventoryCard
              cleaningId={cleaning.id}
              propertyId={cleaning.property.id}
              review={inventoryReview}
              inventoryLines={inventoryLines}
            />
          </>
        )}

        {/* Estado completado o no disponible */}
        {isAssignedToMe && cleaning.status === "COMPLETED" && (
          <section className="p-4">
            <p className="text-base text-neutral-600 text-center">Limpieza completada</p>
          </section>
        )}

        {!isAssignedToMe && cleaning.status !== "PENDING" && (
          <section className="p-4">
            <p className="text-base text-neutral-600 text-center">
              {cleaning.assignedMember
                ? `Asignada a ${cleaning.assignedMember.name}`
                : "No disponible para operar"}
            </p>
          </section>
        )}
      </div>
    </Page>
  );
}
