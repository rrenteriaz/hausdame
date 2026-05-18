"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type {
  HostOnboardingProgress,
  HostOnboardingStepKey,
} from "@/lib/onboarding/host";

type HostSetupProgressCardProps = {
  progress: HostOnboardingProgress;
  storageKey: string;
  context: "properties" | "workgroups";
  actions?: Partial<Record<HostOnboardingStepKey, ReactNode>>;
};

function getSnapshot(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function getCtaLabel(stepKey: HostOnboardingStepKey) {
  if (stepKey === "first-cleaner") return "Invitar cleaner";
  if (stepKey === "first-workgroup") return "Crear WorkGroup";
  if (stepKey === "first-property") return "Agregar propiedad";
  return "Continuar";
}

function getCtaHref(stepKey: HostOnboardingStepKey) {
  if (stepKey === "first-property" || stepKey === "organize-properties") {
    return "/host/properties";
  }
  return "/host/workgroups";
}

export default function HostSetupProgressCard({
  progress,
  storageKey,
  context,
  actions = {},
}: HostSetupProgressCardProps) {
  const dismissed = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("hausdame:onboarding-storage", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("hausdame:onboarding-storage", onStoreChange);
      };
    },
    () => getSnapshot(storageKey),
    () => false
  );

  const currentStep = progress.currentStep;
  const isComplete = progress.completedSteps >= progress.totalSteps;

  if (dismissed || isComplete || !currentStep) {
    return null;
  }

  function dismissCard() {
    try {
      window.localStorage.setItem(storageKey, "1");
      window.dispatchEvent(new Event("hausdame:onboarding-storage"));
    } catch {
      // localStorage can be unavailable in private or restricted contexts.
    }
  }

  const percentage =
    progress.totalSteps > 0
      ? Math.round((progress.completedSteps / progress.totalSteps) * 100)
      : 0;
  const contextualAction = actions[currentStep.key];
  const shouldUseAction =
    (context === "properties" && currentStep.key === "first-property") ||
    (context === "workgroups" && currentStep.key === "first-workgroup");

  return (
    <section
      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
      aria-label="Progreso de configuración inicial"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-neutral-950">
              Configuración pendiente
            </p>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
              {progress.completedSteps}/{progress.totalSteps}
            </span>
          </div>
          <div className="mt-2 flex items-start gap-3">
            <div
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pink-500 text-xs font-semibold text-white"
              aria-hidden="true"
            >
              {progress.completedSteps + 1}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-neutral-900">
                {currentStep.title}
              </h3>
              <p className="mt-1 text-sm leading-5 text-neutral-600">
                {currentStep.description}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-neutral-900 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0">
          {shouldUseAction && contextualAction ? (
            contextualAction
          ) : (
            <Link
              href={getCtaHref(currentStep.key)}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:w-auto"
            >
              {getCtaLabel(currentStep.key)}
            </Link>
          )}
          <button
            type="button"
            onClick={dismissCard}
            className="min-h-[44px] rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
            aria-label="Omitir tarjeta de configuración inicial"
          >
            Omitir
          </button>
        </div>
      </div>
    </section>
  );
}
