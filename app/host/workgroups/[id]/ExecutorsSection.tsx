// app/host/workgroups/[id]/ExecutorsSection.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { WorkGroupExecutorRef } from "@/lib/workgroups/resolveWorkGroupsForProperty";
import AddExecutorModal from "./AddExecutorModal";
import RemoveExecutorButton from "./RemoveExecutorButton";
import { getTeamDisplayNameForHost } from "@/lib/host/teamDisplayName";

interface ExecutorsSectionProps {
  workGroupId: string;
  executors: WorkGroupExecutorRef[];
  executorTeamsById: Record<string, { id: string; name: string; tenantId: string }>;
  executorLeaderByTeamId: Record<string, { name: string | null; email: string | null; role: string | null }>;
  executorMembersByTeamId: Record<string, Array<{ name: string | null; email: string | null; role: string | null }>>;
  executorMembersCountByTeamId: Record<string, number>;
  assignedPropertiesCount: number;
  canEdit: boolean;
  returnTo: string;
}

export default function ExecutorsSection({
  workGroupId,
  executors,
  executorTeamsById,
  executorLeaderByTeamId,
  executorMembersByTeamId,
  executorMembersCountByTeamId,
  assignedPropertiesCount,
  canEdit,
  returnTo,
}: ExecutorsSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Solo mostrar ejecutores ACTIVE en la sección principal
  const activeExecutors = executors.filter((e) => e.status === "ACTIVE");
  // El modal solo excluye ACTIVE (los INACTIVE pueden volver a agregarse)
  const activeExecutorTeamIds = activeExecutors.map((e) => e.teamId);
  const activeMembersCount = activeExecutors.reduce(
    (sum, executor) => sum + (executorMembersCountByTeamId[executor.teamId] ?? 0),
    0
  );
  const autoAssignmentEnabled = activeExecutors.length === 1 && activeMembersCount === 1;

  return (
    <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="min-w-0 flex-1 text-left"
            aria-expanded={isExpanded}
          >
            <h2 className="text-base font-semibold text-neutral-800">
              Equipo operativo
            </h2>
            <p className="text-sm text-neutral-500">
              Cleaners conectados a las propiedades de este grupo.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100"
            aria-label={isExpanded ? "Ocultar equipo operativo" : "Mostrar equipo operativo"}
            aria-expanded={isExpanded}
          >
            <svg
              className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 border-y border-neutral-100 py-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-neutral-500">Cleaners activos</p>
            <p className="font-semibold text-neutral-900">{activeMembersCount}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Propiedades conectadas</p>
            <p className="font-semibold text-neutral-900">{assignedPropertiesCount}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Auto-asignación</p>
            <p className={`font-semibold ${autoAssignmentEnabled ? "text-emerald-700" : "text-neutral-700"}`}>
              {autoAssignmentEnabled ? "Habilitada" : "Requiere revisión"}
            </p>
          </div>
        </div>

        {isExpanded && canEdit && (
          <div>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:w-auto"
            >
              {activeExecutors.length > 0 ? "Editar equipo" : "Agregar Cleaner"}
            </button>
          </div>
        )}

        {isExpanded && activeExecutors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center">
            <p className="text-xs text-neutral-500 mb-2">
              Este grupo aún no tiene Cleaners asignados.
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs text-neutral-900 underline underline-offset-2 mt-2"
              >
                Agregar Cleaner
              </button>
            )}
            {!canEdit && (
              <p className="text-xs text-neutral-400">
                Los Cleaners se asignan a través de invitaciones al grupo.
              </p>
            )}
          </div>
        ) : isExpanded ? (
          <ul className="space-y-2">
            {activeExecutors.map((executor) => {
              const team = executorTeamsById[executor.teamId];
              const leader = executorLeaderByTeamId[executor.teamId];
              const members = executorMembersByTeamId[executor.teamId] ?? [];
              const membersCount = executorMembersCountByTeamId[executor.teamId] ?? 0;
              const displayName = getTeamDisplayNameForHost({
                teamName: team?.name ?? `Equipo ${executor.teamId.slice(0, 8)}`,
                leaderUser: leader ?? null,
              });

              const workGroupDetailUrl = `/host/workgroups/${workGroupId}`;
              const teamDetailHref = `/host/workgroups/${workGroupId}/teams/${executor.teamId}?returnTo=${encodeURIComponent(workGroupDetailUrl)}`;

              return (
                <li
                  key={`${executor.workGroupId}-${executor.teamId}`}
                  className="rounded-xl border border-neutral-200 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <Link
                          href={teamDetailHref}
                          className="inline-flex max-w-full items-center gap-2 text-base font-medium text-neutral-900 hover:opacity-75"
                        >
                          <span className="truncate">{displayName}</span>
                        </Link>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {membersCount} {membersCount === 1 ? "cleaner activo" : "cleaners activos"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        {(members.length > 0 ? members : [leader]).map((member, index) => {
                          const roleLabel = member?.role === "TEAM_LEADER" ? "Líder del equipo" : "Cleaner";
                          const memberName = member?.name ?? member?.email ?? `Cleaner ${index + 1}`;

                          return (
                            <div
                              key={`${executor.teamId}-${member?.email ?? index}`}
                              className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
                                {memberName}
                              </span>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                {roleLabel}
                              </span>
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                                Activo
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {canEdit && (
                      <RemoveExecutorButton workGroupId={workGroupId} teamId={executor.teamId} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {canEdit && (
        <AddExecutorModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          workGroupId={workGroupId}
          existingExecutorTeamIds={activeExecutorTeamIds}
          returnTo={returnTo}
        />
      )}
    </>
  );
}
