import type { ReactNode } from "react";

type HostGettingStartedCardProps = {
  action: ReactNode;
};

export default function HostGettingStartedCard({
  action,
}: HostGettingStartedCardProps) {
  return (
    <section
      className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      aria-label="Inicio operacional para host"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white"
            aria-hidden="true"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10.5 12 3l9 7.5M5 10v10h14V10M9 20v-6h6v6"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">
              Empieza a operar en Hausdame
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">
              Configura tu primera propiedad para sincronizar reservas,
              organizar equipos y comenzar a operar limpiezas.
            </p>
          </div>
        </div>

        <div className="w-full sm:w-auto sm:shrink-0">{action}</div>
      </div>
    </section>
  );
}
