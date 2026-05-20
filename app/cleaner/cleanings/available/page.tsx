// app/cleaner/cleanings/available/page.tsx
import prisma from "@/lib/prisma";
import { getAccessibleTeamsForUser } from "@/lib/cleaner/getAccessibleTeamsForUser";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { getCleanerCleaningsList, getCleanerScope } from "@/lib/cleaner/cleanings/query";
import { redirect } from "next/navigation";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import { formatCleaningStatus } from "@/lib/cleaning-ui";
import AcceptButton from "./AcceptButton";
import { getAvailabilityWindow } from "@/lib/cleaner/availabilityWindow";
import NoMembershipPage from "../../NoMembershipPage";
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";

function safeBackHref(input?: string, memberId?: string) {
  if (input && input.startsWith("/cleaner")) return input;
  return memberId ? `/cleaner?memberId=${encodeURIComponent(memberId)}` : "/cleaner";
}

export default async function AvailableCleaningsPage({
  searchParams,
}: {
  searchParams?: Promise<{ memberId?: string; returnTo?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const memberIdParam = params?.memberId;
  const backHref = safeBackHref(params?.returnTo, memberIdParam);

  // Resolver contexto del cleaner (membership o legacy)
  let context;
  let user;
  let hasContextError = false;
  try {
    user = await getCurrentUser();
    if (!user || user.role !== "CLEANER") {
      redirect("/login");
      return;
    }
    context = await resolveCleanerContext();
  } catch {
    hasContextError = true;
  }

  if (hasContextError || !context || !user) {
    return <NoMembershipPage />;
  }

  const cleanerScope = await getCleanerScope(context);

  const now = new Date();
  const { start, end } = getAvailabilityWindow(now, { includePastOpen: true });

  // Usar query layer canónico para obtener limpiezas disponibles
  const { cleanings: available } = await getCleanerCleaningsList(
    {
      scope: "available",
      scheduledDateFrom: start,
      scheduledDateTo: end,
    },
    context
  );

  // El query layer maneja tanto membership como legacy mode
  // Obtener thumbnails
  const thumbUrls =
    available.length > 0
      ? await getCoverThumbUrlsBatch(
          available.map((c: any) => ({
            id: c.property.id,
            coverAssetGroupId: c.property.coverAssetGroupId || null,
          }))
        )
      : new Map<string, string | null>();

  // LEGACY RETIRADO: Ya no existe modo legacy
  // Obtener memberId para compatibilidad (siempre null ahora)
  const currentMemberId: string = "";

  // Precomputar strings para evitar llamadas impuras durante render (toLocaleString, formatCleaningStatus)
  const displayItems = available.map((c: { id: string; property: any; scheduledDate: Date; status: string; notes?: string }) => ({
    ...c,
    formattedDateTime: formatDateOnly(new Date(c.scheduledDate)),
    statusText: formatCleaningStatus(c.status),
    isOverdue: isPastDateOnly(new Date(c.scheduledDate)),
  }));

  return (
    <Page title="Limpiezas disponibles" subtitle="Sin asignar" containerClassName="pt-6" showBack backHref={backHref}>
      {displayItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-base text-neutral-600">
            {cleanerScope.propertyIds.length === 0
              ? "Aún no tienes propiedades conectadas. Cuando el Host asigne propiedades a tu equipo, las limpiezas disponibles aparecerán aquí."
              : "No hay limpiezas disponibles por ahora. Cuando el Host publique limpiezas abiertas para tus propiedades, aparecerán aquí."}
          </p>
        </div>
      ) : (
        <ListContainer>
          {displayItems.map((cleaning: any, index: number) => {
            const isLast = index === displayItems.length - 1;
            const propertyName = cleaning.property.shortName || cleaning.property.name;
            const detailsHref = `/cleaner/cleanings/${cleaning.id}?memberId=${encodeURIComponent(
              memberIdParam || currentMemberId
            )}&returnTo=${encodeURIComponent(backHref)}`;

            return (
              <div key={cleaning.id} className={`relative ${!isLast ? "border-b border-neutral-200" : ""}`}>
                <ListRow href={detailsHref} isLast={isLast} ariaLabel={`Ver detalles de limpieza ${propertyName}`}>
                  <ListThumb src={thumbUrls.get(cleaning.property.id) || null} alt={propertyName} />
                  <div className="min-w-0 flex-1 pr-24">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-medium text-neutral-900 truncate">
                        {propertyName}
                      </h3>
                      {cleaning.isOverdue && (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 whitespace-nowrap">
                          Atrasada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {cleaning.formattedDateTime}
                      {" · "}
                      {cleaning.statusText}
                    </p>
                    {cleaning.notes && <p className="text-xs text-neutral-500 line-clamp-2 mt-1">{cleaning.notes}</p>}
                  </div>
                </ListRow>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 z-50">
                  <AcceptButton cleaningId={cleaning.id} returnTo={backHref} />
                </div>
              </div>
            );
          })}
        </ListContainer>
      )}
    </Page>
  );
}


