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
import CleaningAccessCard from "./CleaningAccessCard";
import PropertyLocationPreview from "@/app/host/properties/[id]/PropertyLocationPreview";

function safeReturnTo(input?: string, memberId?: string): string {
  const baseUrl = memberId ? `/cleaner?memberId=${encodeURIComponent(memberId)}` : "/cleaner";
  if (!input) return baseUrl;
  // Evitar open-redirect: solo permitimos volver a /cleaner...
  if (input.startsWith("/cleaner")) return input;
  return baseUrl;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formatea la fecha programada de la limpieza de forma correcta:
 * - Si hay scheduledAtPlanned (timestamp real con hora), lo usa con timezone CDMX.
 * - Si solo hay scheduledDate (@db.Date, sin hora), lo muestra como fecha sin hora
 *   usando UTC para evitar el desplazamiento de zona horaria.
 */
function formatCleaningDate(cleaning: { scheduledDate: Date; scheduledAtPlanned?: Date | null }): string {
  const ts = cleaning.scheduledAtPlanned;
  if (ts) {
    return ts.toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return cleaning.scheduledDate.toLocaleDateString("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
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
              notCompletedReasonCode: step.response.notCompletedReasonCode,
              notCompletedNote: step.response.notCompletedNote,
            }
          : null,
        evidencePhotos: step.evidenceAssets.flatMap((ea) =>
          ea.asset?.publicUrl ? [{ id: ea.id, thumbUrl: ea.asset.publicUrl }] : []
        ),
      })),
    })),
  }));

  // Nota: No calculamos attentionReasons en cleaner - es exclusivo de Host

  // Computar mapsUrl una vez para reutilizar en header y en detalles
  let mapsUrl: string | null = null;
  if (cleaning.property.latitude && cleaning.property.longitude) {
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${cleaning.property.latitude},${cleaning.property.longitude}`;
  } else if (cleaning.property.address) {
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleaning.property.address)}`;
  }

  // Badge de estado
  const statusBadgeClass = {
    PENDING: "bg-amber-100 text-amber-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-neutral-100 text-neutral-500",
  }[cleaning.status as string] ?? "bg-neutral-100 text-neutral-500";

  return (
    <Page
      showBack
      backHref={backUrl}
      title={cleaning.property.shortName || cleaning.property.name}
      subtitle={formatCleaningDate(cleaning)}
      variant="compact"
    >
      <div className="space-y-3">

        {/* ── 1. ESTADO + UBICACIÓN (primera fila visible) ─────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusBadgeClass}`}>
            {formatStatus(cleaning.status)}
          </span>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Abrir ubicación
            </a>
          )}
        </div>

        {/* ── 2. ACCIÓN PRINCIPAL ───────────────────────────────────────── */}
        {canAccept && (
          <form action={acceptCleaning}>
            <input type="hidden" name="cleaningId" value={cleaning.id} />
            {memberIdParam && <input type="hidden" name="memberId" value={memberIdParam} />}
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-semibold text-white hover:bg-neutral-800 active:scale-[0.99] transition"
            >
              Aceptar limpieza
            </button>
          </form>
        )}

        {isAssignedToMe && canOperate && cleaning.status === "PENDING" && (
          <form action={startCleaning}>
            <input type="hidden" name="cleaningId" value={cleaning.id} />
            {memberIdParam && <input type="hidden" name="memberId" value={memberIdParam} />}
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-semibold text-white hover:bg-neutral-800 active:scale-[0.99] transition"
            >
              Iniciar limpieza
            </button>
          </form>
        )}

        {/* ── 3. ACCESO RÁPIDO (WiFi / clave) ──────────────────────────── */}
        {canSeeSecrets && (
          <CleaningAccessCard
            wifiSsid={cleaning.property.wifiSsid}
            wifiPassword={cleaning.property.wifiPassword}
            accessCode={cleaning.property.accessCode}
          />
        )}
        {!canSeeSecrets && !isPreviewMode && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1">Acceso</p>
            <p className="text-sm text-neutral-500">🔒 Disponible al aceptar la limpieza.</p>
          </div>
        )}

        {/* ── 4. TAREAS DE LA PROPIEDAD ─────────────────────────────────── */}
        {isAssignedToMe && (
          <TareasProBlock jobs={tareasProJobs} periodicCount={assignedRecurringDues.length} />
        )}

        {/* ── 5. CHECKLIST LEGACY — oculto en cleaner (datos cargados para CleaningDetailClient) ── */}

        {/* ── 6. INVENTARIO — referencia en PENDING ─────────────────────── */}
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

        {/* ── 7. INVENTARIO + COMPLETAR — IN_PROGRESS ───────────────────── */}
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

        {/* ── 8. INVENTARIO ENVIADO — historial ─────────────────────────── */}
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

        {/* ── 9. MENSAJES DE ESTADO ─────────────────────────────────────── */}
        {isAssignedToMe && cleaning.status === "COMPLETED" && (
          <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">
            <p className="text-base font-medium text-green-700">✓ Limpieza completada</p>
          </div>
        )}

        {!isAssignedToMe && cleaning.status !== "PENDING" && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
            <p className="text-sm text-neutral-500">
              {(cleaning as any).assignedMember
                ? `Asignada a ${(cleaning as any).assignedMember.name}`
                : "No disponible para operar"}
            </p>
          </div>
        )}

        {/* ── 10. DETALLES ADICIONALES (colapsable al fondo) ───────────── */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <CollapsibleSection title="Más información" defaultOpen={false}>
            {/* Móvil: stack · Web (sm+) con mapa: grid 2 columnas */}
            {cleaning.property.latitude != null && cleaning.property.longitude != null ? (
              <div className="pt-1 flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-6 sm:items-start">

                {/* Columna izquierda: texto */}
                <div className="space-y-3">
                  {cleaning.notes?.trim() && (
                    <div>
                      <p className="text-xs text-neutral-400">Notas</p>
                      <p className="text-sm text-neutral-900 mt-0.5">{cleaning.notes}</p>
                    </div>
                  )}

                  {cleaning.property.address && (
                    <div>
                      <p className="text-xs text-neutral-400">Domicilio</p>
                      <p className="text-sm text-neutral-900 mt-0.5">{cleaning.property.address}</p>
                    </div>
                  )}

                  {(cleaning.property.checkInTime || cleaning.property.checkOutTime) && (
                    <div className="grid grid-cols-2 gap-3">
                      {cleaning.property.checkInTime && (
                        <div>
                          <p className="text-xs text-neutral-400">Check-in</p>
                          <p className="text-sm text-neutral-900 mt-0.5">{cleaning.property.checkInTime}</p>
                        </div>
                      )}
                      {cleaning.property.checkOutTime && (
                        <div>
                          <p className="text-xs text-neutral-400">Check-out</p>
                          <p className="text-sm text-neutral-900 mt-0.5">{cleaning.property.checkOutTime}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-neutral-400">Asignación</p>
                    <p className="text-sm text-neutral-900 mt-0.5">
                      {formatAssignmentStatus(cleaning.assignmentStatus)}
                      {(cleaning as any).assignedMember && (
                        <> · {(cleaning as any).assignedMember.name}</>
                      )}
                    </p>
                  </div>

                  {cleaning.startedAt && (
                    <div>
                      <p className="text-xs text-neutral-400">Iniciada</p>
                      <p className="text-sm text-neutral-900 mt-0.5">{formatDateTime(cleaning.startedAt)}</p>
                    </div>
                  )}

                  {cleaning.completedAt && (
                    <div>
                      <p className="text-xs text-neutral-400">Completada</p>
                      <p className="text-sm text-neutral-900 mt-0.5">{formatDateTime(cleaning.completedAt)}</p>
                    </div>
                  )}
                </div>

                {/* Columna derecha: mapa + botón ruta */}
                <div className="space-y-2">
                  <PropertyLocationPreview
                    latitude={Number(cleaning.property.latitude)}
                    longitude={Number(cleaning.property.longitude)}
                    propertyName={cleaning.property.shortName ?? cleaning.property.name}
                  />
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${Number(cleaning.property.latitude)},${Number(cleaning.property.longitude)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 transition"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Abrir ruta
                  </a>
                </div>
              </div>

            ) : (
              /* Sin coordenadas: columna única */
              <div className="space-y-3 pt-1">
                {cleaning.notes?.trim() && (
                  <div>
                    <p className="text-xs text-neutral-400">Notas</p>
                    <p className="text-sm text-neutral-900 mt-0.5">{cleaning.notes}</p>
                  </div>
                )}

                {cleaning.property.address && (
                  <div>
                    <p className="text-xs text-neutral-400">Domicilio</p>
                    <p className="text-sm text-neutral-900 mt-0.5">{cleaning.property.address}</p>
                  </div>
                )}

                {cleaning.property.address && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleaning.property.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Abrir ruta en Google Maps
                  </a>
                )}

                {(cleaning.property.checkInTime || cleaning.property.checkOutTime) && (
                  <div className="grid grid-cols-2 gap-3">
                    {cleaning.property.checkInTime && (
                      <div>
                        <p className="text-xs text-neutral-400">Check-in</p>
                        <p className="text-sm text-neutral-900 mt-0.5">{cleaning.property.checkInTime}</p>
                      </div>
                    )}
                    {cleaning.property.checkOutTime && (
                      <div>
                        <p className="text-xs text-neutral-400">Check-out</p>
                        <p className="text-sm text-neutral-900 mt-0.5">{cleaning.property.checkOutTime}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs text-neutral-400">Asignación</p>
                  <p className="text-sm text-neutral-900 mt-0.5">
                    {formatAssignmentStatus(cleaning.assignmentStatus)}
                    {(cleaning as any).assignedMember && (
                      <> · {(cleaning as any).assignedMember.name}</>
                    )}
                  </p>
                </div>

                {cleaning.startedAt && (
                  <div>
                    <p className="text-xs text-neutral-400">Iniciada</p>
                    <p className="text-sm text-neutral-900 mt-0.5">{formatDateTime(cleaning.startedAt)}</p>
                  </div>
                )}

                {cleaning.completedAt && (
                  <div>
                    <p className="text-xs text-neutral-400">Completada</p>
                    <p className="text-sm text-neutral-900 mt-0.5">{formatDateTime(cleaning.completedAt)}</p>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
        </section>

        {/* ── 11. DECLINAR (acción negativa secundaria, al fondo) ──────── */}
        {canDecline && (
          <form action={declineCleaning}>
            <input type="hidden" name="cleaningId" value={cleaning.id} />
            {memberIdParam && <input type="hidden" name="memberId" value={memberIdParam} />}
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="w-full py-2 text-sm text-blue-500 hover:text-blue-700 transition text-center"
            >
              Declinar limpieza
            </button>
          </form>
        )}
      </div>
    </Page>
  );
}
