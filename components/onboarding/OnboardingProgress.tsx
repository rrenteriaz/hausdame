import type { HostOnboardingProgress } from "@/lib/onboarding/host";

type OnboardingProgressProps = {
  progress: Pick<HostOnboardingProgress, "completedSteps" | "totalSteps">;
};

export default function OnboardingProgress({ progress }: OnboardingProgressProps) {
  const percentage =
    progress.totalSteps > 0
      ? Math.round((progress.completedSteps / progress.totalSteps) * 100)
      : 0;

  return (
    <div
      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
      aria-label={`Progreso de onboarding: ${progress.completedSteps} de ${progress.totalSteps} pasos completados`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-neutral-900">Tu progreso</p>
        <p className="text-xs text-neutral-500">
          {progress.completedSteps}/{progress.totalSteps}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-neutral-900 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {progress.completedSteps} de {progress.totalSteps} pasos completados
      </p>
    </div>
  );
}
