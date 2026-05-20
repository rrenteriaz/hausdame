import Link from "next/link";
import type { ReactNode } from "react";
import type { HostOnboardingStep } from "@/lib/onboarding/host";

type OnboardingStepCardProps = {
  step: HostOnboardingStep;
  index: number;
  active?: boolean;
  action?: ReactNode;
};

export default function OnboardingStepCard({
  step,
  index,
  active = false,
  action,
}: OnboardingStepCardProps) {
  const markerClass = step.completed
    ? "border-neutral-900 bg-neutral-900 text-white"
    : active
    ? "border-pink-500 bg-pink-500 text-white"
    : "border-neutral-200 bg-white text-neutral-500";

  return (
    <article
      className={[
        "rounded-xl border bg-white p-4 transition",
        active ? "border-pink-200 shadow-sm" : "border-neutral-200",
      ].join(" ")}
      aria-current={active ? "step" : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${markerClass}`}
          aria-hidden="true"
        >
          {step.completed ? "✓" : index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-950">{step.title}</h3>
            {active && !step.completed && (
              <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700">
                Siguiente
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-5 text-neutral-600">{step.description}</p>
        </div>
      </div>

      {!step.completed && (
        <div className="mt-4">
          {action ? (
            <div className="w-full sm:inline-flex sm:w-auto">{action}</div>
          ) : step.href ? (
            <Link
              href={step.href}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 sm:w-auto"
            >
              {step.ctaLabel}
            </Link>
          ) : (
            <p className="text-xs font-medium text-neutral-500">{step.ctaLabel}</p>
          )}
        </div>
      )}
    </article>
  );
}
