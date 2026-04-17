"use client";

import { useState, useTransition } from "react";
import type { CleaningAssignmentLevel } from "@/lib/cleanings/getCleaningAssignmentLevel";
import { changeCleaningTeam } from "@/app/host/cleanings/actions";

function getAssignmentCardVariant(
  assignmentLevel: CleaningAssignmentLevel
): "attention" | "default" {
  return assignmentLevel <= 2 ? "attention" : "default";
}

interface Assignee {
  id: string;
  member: {
    id: string;
    name: string;
    team: {
      id: string;
      name: string;
    };
  };
  assignedAt: Date;
}

interface AssignmentSectionProps {
  cleaningId: string;
  assignees: Assignee[];
  teamMembers: Array<{
    id: string;
    name: string;
    team: { id: string; name: string };
    assigneeType?: "MEMBERSHIP" | "TEAM_MEMBER";
  }>;
  propertyTeams: Array<{ teamId: string; team: { id: string; name: string } }>;
  hasError?: boolean;
  /** assignedMembershipId del cleaning con prefijo "m:" */
  primaryAssigneeId?: string | null;
  cleaningStatus?: string;
  assignmentLevel: CleaningAssignmentLevel;
  teamId: string | null;
  teamName: string | null;
  /** Nombre del TL del team actual (para mostrar en nivel 2 como referencia) */
  tlName?: string | null;
}

export default function AssignmentSection({
  cleaningId,
  assignees,
  teamMembers,
  propertyTeams,
  hasError = false,
  primaryAssigneeId = null,
  cleaningStatus = "PENDING",
  assignmentLevel,
  teamId,
  teamName,
  tlName,
}: AssignmentSectionProps) {
  const [isTeamsOpen, setIsTeamsOpen] = useState(false);
  const [isChangeTeamOpen, setIsChangeTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(teamId ?? "");
  const [isPending, startTransition] = useTransition();

  const isInProgress = cleaningStatus === "IN_PROGRESS";
  const isCompleted = cleaningStatus === "COMPLETED";
  const isCancelled = cleaningStatus === "CANCELLED";
  const canModify = cleaningStatus === "PENDING";

  const primaryAssignee =
    assignees.find((a) => a.member.id === primaryAssigneeId) || assignees[0];
  const variant = getAssignmentCardVariant(assignmentLevel);
  const isAttention = variant === "attention";

  // Nombre visible del ejecutor: preferir TeamMembership virtual (prefijo "m:")
  function getExecutorName(): string {
    if (primaryAssignee) return primaryAssignee.member.name;
    return "Miembro asignado";
  }

  function getExecutorTeamName(): string {
    if (primaryAssignee) return primaryAssignee.member.team.name;
    return teamName ?? "Equipo";
  }

  return (
    <>
      {/* ── Tarjeta principal de asignación ── */}
      <section
        className={`rounded-2xl border p-4 space-y-3 ${
          isAttention
            ? "border-amber-200 bg-amber-50"
            : "border-neutral-200 bg-white"
        }`}
      >
        <div className="flex items-center justify-between">
          <p
            className={`text-base font-semibold ${
              isAttention ? "text-amber-900" : "text-neutral-900"
            }`}
          >
            {isAttention && <span className="mr-1.5">⚠️</span>}
            Asignación
          </p>

          <div className="flex items-center gap-3">
            {/* Info de equipos */}
            {propertyTeams.length > 0 && assignmentLevel !== 0 && (
              <button
                type="button"
                onClick={() => setIsTeamsOpen(true)}
                className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-700"
              >
                Ver equipos
              </button>
            )}

            {/* Cambiar team — solo si PENDING y hay >1 team disponible */}
            {canModify && propertyTeams.length > 1 && (
              <button
                type="button"
                onClick={() => setIsChangeTeamOpen(true)}
                className="text-sm text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
              >
                Cambiar equipo
              </button>
            )}
          </div>
        </div>

        {hasError ? (
          <p className="text-sm text-neutral-500">
            No se pudo cargar la asignación.
          </p>
        ) : assignmentLevel === 0 ? (
          /* Nivel 0 — Sin equipo */
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-900">
              Sin equipo disponible
            </p>
            <p className="text-xs text-amber-700">
              Esta propiedad no tiene equipos configurados.
            </p>
            {canModify && propertyTeams.length > 0 && (
              <button
                type="button"
                onClick={() => setIsChangeTeamOpen(true)}
                className="mt-1 text-xs text-amber-800 underline underline-offset-2"
              >
                Asignar equipo
              </button>
            )}
          </div>
        ) : assignmentLevel === 1 ? (
          /* Nivel 1 — Equipo disponible, sin ejecutor asignado */
          <div className="space-y-1">
            <p className="text-sm text-neutral-700">Sin ejecutor asignado</p>
            <p className="text-xs text-neutral-500">
              La limpieza está abierta para que algún miembro del equipo la
              acepte.
            </p>
          </div>
        ) : assignmentLevel === 2 ? (
          /* Nivel 2 — Team asignado, sin ejecutor (sin membershipId) */
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Equipo
              </span>
              <span className="text-sm font-medium text-neutral-900">
                {teamName ?? "—"}
              </span>
            </div>
            {tlName && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  TL
                </span>
                <span className="text-sm text-neutral-600">{tlName}</span>
                <span className="text-xs text-neutral-400">(referencia)</span>
              </div>
            )}
            <p className="text-xs text-neutral-500 pt-0.5">
              Sin ejecutor específico — responsabilidad del equipo.
            </p>
          </div>
        ) : assignmentLevel === 3 ? (
          /* Nivel 3 — Ejecutor asignado */
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-neutral-900">
                {getExecutorName()}
              </span>
              <span className="text-xs text-neutral-400 bg-neutral-100 rounded px-1.5 py-0.5">
                Asignado
              </span>
            </div>
            <p className="text-xs text-neutral-500">{getExecutorTeamName()}</p>
          </div>
        ) : assignmentLevel === 4 ? (
          /* Nivel 4 — En ejecución */
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-neutral-900">
                {getExecutorName()}
              </span>
              <span className="text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5 font-medium">
                En progreso
              </span>
            </div>
            <p className="text-xs text-neutral-500">{getExecutorTeamName()}</p>
            {isInProgress && (
              <p className="text-xs text-neutral-400 mt-1">
                La limpieza ya inició — no se puede reasignar.
              </p>
            )}
          </div>
        ) : assignmentLevel === 5 ? (
          /* Nivel 5 — Completada */
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-900">
                {getExecutorName()}
              </span>
              <span className="text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5 font-medium">
                Completada
              </span>
            </div>
            <p className="text-xs text-neutral-500">{getExecutorTeamName()}</p>
          </div>
        ) : null}

        {/* Bloque de freeze — IN_PROGRESS o COMPLETED */}
        {(isInProgress || isCompleted || isCancelled) && !isCompleted && !isCancelled && (
          <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 mt-1">
            <p className="text-xs text-neutral-500">
              {isInProgress
                ? "La limpieza está en progreso. No se puede cambiar el equipo ni el ejecutor."
                : "La limpieza está cancelada."}
            </p>
          </div>
        )}
      </section>

      {/* ── Modal: Info de equipos ── */}
      {isTeamsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsTeamsOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-900">
              Equipos asignados a la propiedad
            </h2>
            <div className="space-y-4">
              {propertyTeams.map((pt) => {
                const members = teamMembers.filter(
                  (m) => m.team.id === pt.teamId
                );
                const isCurrent = pt.teamId === teamId;
                return (
                  <div
                    key={pt.teamId}
                    className={`rounded-lg border p-3 space-y-1 ${
                      isCurrent
                        ? "border-blue-200 bg-blue-50"
                        : "border-neutral-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-neutral-800">
                        {pt.team?.name ?? "Equipo"}
                      </p>
                      {isCurrent && (
                        <span className="text-xs text-blue-600 bg-blue-100 rounded px-1.5 py-0.5">
                          Actual
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">
                      {members.length > 0
                        ? members.map((m) => m.name).join(" · ")
                        : "Sin miembros"}
                    </p>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setIsTeamsOpen(false)}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Cambiar equipo (solo PENDING) ── */}
      {isChangeTeamOpen && canModify && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending)
              setIsChangeTeamOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">
                Cambiar equipo responsable
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                Al cambiar el equipo, el ejecutor se recalculará automáticamente
                según la configuración del nuevo equipo.
              </p>
            </div>

            <form
              action={async (formData) => {
                startTransition(async () => {
                  await changeCleaningTeam(formData);
                  setIsChangeTeamOpen(false);
                });
              }}
              className="space-y-4"
            >
              <input type="hidden" name="cleaningId" value={cleaningId} />

              <div className="space-y-1">
                <label
                  htmlFor="teamId-select"
                  className="text-sm font-medium text-neutral-700"
                >
                  Equipo
                </label>
                <select
                  id="teamId-select"
                  name="teamId"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 bg-white disabled:opacity-50"
                >
                  <option value="">— Seleccionar equipo —</option>
                  {propertyTeams.map((pt) => (
                    <option key={pt.teamId} value={pt.teamId}>
                      {pt.team?.name ?? pt.teamId}
                      {pt.teamId === teamId ? " (actual)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsChangeTeamOpen(false)}
                  disabled={isPending}
                  className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending || !selectedTeamId || selectedTeamId === teamId}
                  className="flex-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {isPending ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
