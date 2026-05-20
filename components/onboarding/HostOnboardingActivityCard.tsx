import Link from "next/link";
import type { ReactNode } from "react";
import type {
  HostOnboardingProgress,
  HostOnboardingStepKey,
} from "@/lib/onboarding/host";

type HostOnboardingActivityCardProps = {
  progress: HostOnboardingProgress;
  firstPropertyAction?: ReactNode;
};

function getCtaLabel(stepKey: HostOnboardingStepKey) {
  if (stepKey === "first-property") return "Agregar propiedad";
  if (stepKey === "first-workgroup") return "Crear WorkGroup";
  if (stepKey === "first-cleaner") return "Invitar cleaner";
  return "Continuar";
}

function getCtaHref(stepKey: HostOnboardingStepKey) {
  if (stepKey === "first-property" || stepKey === "organize-properties") {
    return "/host/properties";
  }

  if (stepKey === "first-workgroup") {
    return "/host/workgroups?create=1";
  }

  return "/host/workgroups";
}

export default function HostOnboardingActivityCard({
  progress,
  firstPropertyAction,
}: HostOnboardingActivityCardProps) {
  const currentStep = progress.currentStep;

  if (!currentStep || progress.completedSteps >= progress.totalSteps) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
      aria-label="Configuración pendiente del host"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-950">
              Configuración pendiente
            </h2>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
              {progress.completedSteps}/{progress.totalSteps}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-neutral-900">
            {currentStep.title}
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-neutral-600">
            {currentStep.description}
          </p>
        </div>

        <div className="w-full sm:w-auto sm:shrink-0">
          {currentStep.key === "first-property" && firstPropertyAction ? (
            firstPropertyAction
          ) : (
            <Link
              href={getCtaHref(currentStep.key)}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 sm:w-auto"
            >
              {getCtaLabel(currentStep.key)}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
