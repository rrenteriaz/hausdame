"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PropertySetupItem,
  PropertySetupItemKey,
  PropertySetupProgress,
} from "@/lib/onboarding/property";

type PropertySetupProgressCardProps = {
  progress: PropertySetupProgress;
  propertyId: string;
  storageKey: string;
  returnTo: string;
};

const editKeys = new Set<PropertySetupItemKey>([
  "identity",
  "location",
  "operation",
  "calendar",
  "group",
  "notifications",
  "access",
  "wifi",
  "ical-health",
]);

function getItemHref(item: PropertySetupItem, propertyId: string, returnTo: string) {
  if (item.key === "workgroup" || item.key === "executor") {
    return "#property-workgroups";
  }

  if (item.key === "checklist") {
    return `/host/properties/${propertyId}/checklist?returnTo=${encodeURIComponent(returnTo)}`;
  }

  if (editKeys.has(item.key)) {
    return "#property-info";
  }

  return "#property-info";
}

function StatusDot({ item }: { item: PropertySetupItem }) {
  const className = item.completed
    ? "bg-emerald-500"
    : item.status === "warning"
      ? "bg-amber-500"
      : "bg-neutral-300";

  return (
    <span
      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      aria-hidden="true"
    />
  );
}

function SetupItemRow({ item }: { item: PropertySetupItem }) {
  return (
    <li className="flex gap-2">
      <StatusDot item={item} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-900">{item.title}</p>
        {!item.completed && (
          <p className="mt-0.5 text-xs leading-4 text-neutral-500">
            {item.description}
          </p>
        )}
      </div>
    </li>
  );
}

export default function PropertySetupProgressCard({
  progress,
  propertyId,
  storageKey: _storageKey,
  returnTo,
}: PropertySetupProgressCardProps) {
  // Dismissed solo durante la vida de esta vista — no persiste en DB, localStorage ni cookies.
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (dismissed || (progress.isOperational && !progress.hasWarnings)) {
    return null;
  }

  const currentItem = progress.currentItem;
  const percentage =
    progress.totalItems > 0
      ? Math.round((progress.completedItems / progress.totalItems) * 100)
      : 0;
  const requiredItems = progress.items.filter((item) => item.category === "required");
  const recommendedItems = progress.items.filter(
    (item) => item.category === "recommended"
  );

  return (
    <section
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
      aria-label="Configuración contextual de esta propiedad"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-neutral-950">
              Configuración de esta propiedad
            </p>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
              {progress.completedItems}/{progress.totalItems}
            </span>
            {!progress.isOperational && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                Falta operar
              </span>
            )}
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-neutral-900 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {currentItem && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Siguiente pendiente
              </p>
              <h3 className="mt-1 text-sm font-semibold text-neutral-900">
                {currentItem.title}
              </h3>
              <p className="mt-1 text-sm leading-5 text-neutral-600">
                {currentItem.description}
              </p>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0">
          {currentItem && (
            editKeys.has(currentItem.key) ? (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("hausdame:open-property-edit", { detail: { propertyId } }))}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:w-auto"
              >
                Continuar configuración
              </button>
            ) : (
              <Link
                href={getItemHref(currentItem, propertyId, returnTo)}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:w-auto"
              >
                Continuar configuración
              </Link>
            )
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-[44px] rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
            aria-label="Ocultar ayuda de configuración de esta propiedad"
          >
            Ocultar por ahora
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 grid gap-4 border-t border-neutral-100 pt-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-neutral-700">
              Necesario para operar
            </p>
            <ul className="mt-3 space-y-3">
              {requiredItems.map((item) => (
                <SetupItemRow key={item.key} item={item} />
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-700">Recomendado</p>
            <ul className="mt-3 space-y-3">
              {recommendedItems.map((item) => (
                <SetupItemRow key={item.key} item={item} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
