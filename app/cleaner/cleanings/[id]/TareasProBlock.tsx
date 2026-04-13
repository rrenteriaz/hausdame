"use client";

// app/cleaner/cleanings/[id]/TareasProBlock.tsx
import { useState } from "react";
import CleanerJobExecutor from "@/app/cleaner/tareas-pro/[jobId]/CleanerJobExecutor";

type EvidencePhoto = {
  id: string;
  thumbUrl: string;
};

type StepResponse = {
  confirmed: boolean | null;
  boolValue: boolean | null;
  numberValue: number | null;
  textValue: string | null;
  notes: string | null;
};

type JobStep = {
  id: string;
  nameSnapshot: string;
  descriptionSnapshot: string | null;
  capturesYesNoSnapshot: boolean;
  yesNoRequiredSnapshot: boolean;
  capturesNumberSnapshot: boolean;
  numberRequiredSnapshot: boolean;
  capturesPhotoSnapshot: boolean;
  photoRequiredSnapshot: boolean;
  capturesTextSnapshot: boolean;
  textRequiredSnapshot: boolean;
  isRequiredSnapshot: boolean;
  blocksCompletionSnapshot: boolean;
  snapshotVersion: string;
  order: number;
  status: string;
  response: StepResponse | null;
  evidencePhotos: EvidencePhoto[];
};

type JobSection = {
  id: string;
  nameSnapshot: string;
  sectionTypeSnapshot: string;
  requiresGlobalConfirmSnapshot: boolean;
  order: number;
  status: string;
  isCarryForwardInjected: boolean;
  steps: JobStep[];
};

type TareasProJobData = {
  job: {
    id: string;
    templateNameSnapshot: string;
    status: string;
    property: { name: string; shortName: string | null };
  };
  initialSections: JobSection[];
};

interface Props {
  jobs: TareasProJobData[];
  periodicCount?: number;
}

export default function TareasProBlock({ jobs, periodicCount = 0 }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Progreso agregado entre todos los jobs
  const totalSections = jobs.reduce((acc, j) => acc + j.initialSections.length, 0);
  const doneSections = jobs.reduce(
    (acc, j) =>
      acc +
      j.initialSections.filter(
        (s) => s.status === "CONFIRMED" || s.status === "DEFERRED"
      ).length,
    0
  );

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between hover:bg-neutral-50 transition"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-neutral-800">Tareas Pro</h3>
          <span className="text-xs text-neutral-500">
            ({doneSections}/{totalSections})
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-neutral-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-neutral-100">
          {periodicCount > 0 && (
            <p className="px-4 py-2 text-xs text-blue-600 bg-blue-50 border-b border-blue-100">
              Incluye {periodicCount} actividad{periodicCount > 1 ? "es" : ""} periódica{periodicCount > 1 ? "s" : ""} programada{periodicCount > 1 ? "s" : ""}.
            </p>
          )}
          {jobs.length === 0 ? (
            <p className="px-4 py-4 text-sm text-neutral-400">
              No hay tareas pro vinculadas a esta limpieza.
            </p>
          ) : jobs.length === 1 ? (
            <CleanerJobExecutor
              job={jobs[0].job}
              initialSections={jobs[0].initialSections}
              embedded
            />
          ) : (
            <div className="divide-y divide-neutral-100">
              {jobs.map(({ job, initialSections }) => {
                const jobDone = initialSections.filter(
                  (s) => s.status === "CONFIRMED" || s.status === "DEFERRED"
                ).length;
                return (
                  <div key={job.id}>
                    <div className="px-4 py-2 bg-neutral-50 flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-700">
                        {job.templateNameSnapshot}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {jobDone}/{initialSections.length}
                      </span>
                    </div>
                    <CleanerJobExecutor
                      job={job}
                      initialSections={initialSections}
                      embedded
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
