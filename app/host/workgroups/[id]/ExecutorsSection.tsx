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
  executorLeaderByTeamId: Record<string, { name: string | null; email: string | null }>;
  executorMembersCountByTeamId: Record<string, number>;
  canEdit: boolean;
  returnTo: string;
}

export default function ExecutorsSection({
  workGroupId,
  executors,
  executorTeamsById,
  executorLeaderByTeamId,
  executorMembersCountByTeamId,
  canEdit,
  returnTo,
}: ExecutorsSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Solo mostrar ejecutores ACTIVE en la sección principal
  const activeExecutors = executors.filter((e) => e.status === "ACTIVE");
  // El modal solo excluye ACTIVE (los INACTIVE pueden volver a agregarse)
  const activeExecutorTeamIds = activeExecutors.map((e) => e.teamId);

  return (
    <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-800">
            Cleaners del grupo ({activeExecutors.length})
          </h2>
          {canEdit && activeExecutors.length > 0 && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="text-sm text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
            >
              Editar Cleaners
            </button>
          )}
        </div>

        {activeExecutors.length === 0 ? (
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
        ) : (
          <ul className="space-y-2">
            {activeExecutors.map((executor) => {
              const team = executorTeamsById[executor.teamId];
              const leader = executorLeaderByTeamId[executor.teamId];
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
                  className="rounded-xl border border-neutral-200 p-3 flex items-center justify-between gap-3"
                >
                  <Link
                    href={teamDetailHref}
                    className="flex-1 min-w-0 hover:opacity-75 transition-opacity"
                  >
                    <p className="text-base font-medium text-neutral-900 truncate">
                      {leader?.name ?? displayName} (Cleaner)
                    </p>
                    {membersCount > 0 && (
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {membersCount} {membersCount === 1 ? "miembro" : "miembros"}
                      </p>
                    )}
                  </Link>
                  {canEdit && (
                    <RemoveExecutorButton workGroupId={workGroupId} teamId={executor.teamId} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
