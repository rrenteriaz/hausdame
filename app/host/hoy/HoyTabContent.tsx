"use client";

import Link from "next/link";
import { BlockItem, HoyData } from "./types";
import EmptyState from "./EmptyState";
import HostOnboardingActivityCard from "@/components/onboarding/HostOnboardingActivityCard";
import type { HostOnboardingProgress } from "@/lib/onboarding/host";

interface HoyTabContentProps {
  selectedPropertyId: string;
  data: HoyData;
  onboardingProgress: HostOnboardingProgress;
}

export default function HoyTabContent({
  selectedPropertyId,
  data,
  onboardingProgress,
}: HoyTabContentProps) {
  // Construir URL de retorno preservando tab y propertyId
  const buildReturnUrl = () => {
    const params = new URLSearchParams();
    params.set("tab", "hoy");
    if (selectedPropertyId) {
      params.set("propertyId", selectedPropertyId);
    }
    return `/host/hoy?${params.toString()}`;
  };

  // Construir URLs de navegación a vistas dedicadas
  const buildViewUrl = (path: string, includeTab: boolean = false) => {
    const params = new URLSearchParams();
    if (selectedPropertyId) {
      params.set("propertyId", selectedPropertyId);
    }
    if (includeTab) {
      params.set("tab", "hoy");
    }
    params.set("from", buildReturnUrl());
    return `${path}?${params.toString()}`;
  };

  // Filtrar bloques: solo mostrar si count > 0
  // Mantenimiento pendiente NO se muestra nunca
  const visibleBlocks = [
    data.unconfirmedCleanings.count > 0 && {
      title: "Limpiezas sin confirmar",
      count: data.unconfirmedCleanings.count,
      items: data.unconfirmedCleanings.items,
      href: buildViewUrl("/host/actividad/limpiezas/sin-confirmar", true),
    },
    data.openIncidents.count > 0 && {
      title: "Incidencias abiertas",
      count: data.openIncidents.count,
      items: data.openIncidents.items,
      href: buildViewUrl("/host/actividad/incidencias/abiertas"),
    },
    data.todayCleanings.count > 0 && {
      title: "Limpiezas de hoy",
      count: data.todayCleanings.count,
      items: data.todayCleanings.items,
      href: buildViewUrl("/host/actividad/limpiezas/hoy"),
    },
    data.todayReservations.count > 0 && {
      title: "Reservas para hoy",
      count: data.todayReservations.count,
      items: data.todayReservations.items,
      href: buildViewUrl("/host/actividad/reservas/hoy"),
    },
  ].filter(Boolean) as Array<{
    title: string;
    count: number;
    items: BlockItem[];
    href: string;
  }>;

  // Verificar condición de empty state para tab "Hoy"
  // Empty state solo si TODOS los bloques relevantes están en 0
  const isEmpty = visibleBlocks.length === 0;
  const hasOnboardingPending =
    onboardingProgress.completedSteps < onboardingProgress.totalSteps;

  if (isEmpty && hasOnboardingPending) {
    return <HostOnboardingActivityCard progress={onboardingProgress} />;
  }

  if (isEmpty) {
    return (
      <EmptyState message={`Todo está en orden hoy.\nNo hay tareas pendientes ni incidencias que atender.`} />
    );
  }

  return (
    <div className="space-y-6">
      {hasOnboardingPending && (
        <HostOnboardingActivityCard progress={onboardingProgress} />
      )}

      {visibleBlocks.map((block) => (
        <BlockCard
          key={block.title}
          title={block.title}
          count={block.count}
          items={block.items}
          href={block.href}
        />
      ))}
    </div>
  );
}

interface BlockCardProps {
  title: string;
  count: number;
  items: Array<{
    id: string;
    title: string;
    propertyName: string;
    date: string | null;
    status?: string;
    href: string;
  }>;
  href: string;
  disabled?: boolean;
}

function BlockCard({ title, count, items, href, disabled = false }: BlockCardProps) {
  if (disabled || href === "#") {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-neutral-900">
            {title} <span className="font-normal">({count})</span>
          </h3>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50 transition cursor-pointer"
    >
      <div className="mb-3">
        <h3 className="text-base font-semibold text-neutral-900">
          {title} <span className="font-normal">({count})</span>
        </h3>
      </div>
      
      {/* Lista de items (máx 3-5) - preview */}
      {items.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-neutral-100">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between text-sm text-neutral-700"
            >
              <span className="truncate flex-1">{item.propertyName}</span>
              {item.date && (() => {
                const dateObj = new Date(item.date);
                // Usar UTC para detectar si hay hora real.
                // Campos @db.Date (ej. scheduledDate) siempre llegan como UTC midnight
                // (00:00:00Z). getHours() en CDMX daría 18 ≠ 0 → falso positivo.
                // getUTCHours() es 0 para date-only y distinto de 0 para timestamps reales.
                const hasTime = dateObj.getUTCHours() !== 0 || dateObj.getUTCMinutes() !== 0;
                return (
                  <span className="text-xs text-neutral-500 ml-2 shrink-0">
                    {hasTime
                      ? dateObj.toLocaleDateString("es-MX", {
                          timeZone: "America/Mexico_City",
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : dateObj.toLocaleDateString("es-MX", {
                          timeZone: "UTC",
                          day: "2-digit",
                          month: "short",
                        })}
                  </span>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

