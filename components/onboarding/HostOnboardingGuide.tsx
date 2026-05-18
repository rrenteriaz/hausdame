import type { ReactNode } from "react";
import type { HostOnboardingProgress, HostOnboardingStepKey } from "@/lib/onboarding/host";
import OnboardingProgress from "./OnboardingProgress";
import OnboardingStepCard from "./OnboardingStepCard";

type HostOnboardingGuideProps = {
  progress: HostOnboardingProgress;
  actions?: Partial<Record<HostOnboardingStepKey, ReactNode>>;
  context?: "properties" | "workgroups";
};

export default function HostOnboardingGuide({
  progress,
  actions = {},
  context = "properties",
}: HostOnboardingGuideProps) {
  const eyebrow = context === "workgroups" ? "Grupos de trabajo" : "Propiedades";
  const currentKey = progress.currentStep?.key;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_240px] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal text-neutral-950 sm:text-2xl">
            Empieza a operar en Hausdame
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Configura lo esencial en pocos pasos. Puedes avanzar a tu ritmo y seguir usando la app normalmente.
          </p>
        </div>
        <OnboardingProgress progress={progress} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {progress.steps.map((step, index) => (
          <OnboardingStepCard
            key={step.key}
            step={step}
            index={index}
            active={step.key === currentKey}
            action={actions[step.key]}
          />
        ))}
      </div>
    </div>
  );
}
