// app/host/workgroups/[id]/AddExecutorModal.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addExecutorToWorkGroup } from "../actions-executors";

interface ExecutorOption {
  teamId: string;
  teamName: string;
  servicesTenantId: string;
}

interface AddExecutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  workGroupId: string;
  existingExecutorTeamIds: string[];
  returnTo: string;
}

export default function AddExecutorModal({
  isOpen,
  onClose,
  workGroupId,
  existingExecutorTeamIds,
  returnTo,
}: AddExecutorModalProps) {
  const router = useRouter();
  const [executors, setExecutors] = useState<ExecutorOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchExecutors() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/host-workgroups/${workGroupId}/available-executors`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Error al cargar ejecutores disponibles");
        }
        setExecutors(data.executors || []);
      } catch (err: any) {
        setError(err?.message || "Error al cargar ejecutores");
      } finally {
        setIsLoading(false);
      }
    }

    fetchExecutors();
  }, [isOpen, workGroupId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTeamId) return;

    setIsSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("workGroupId", workGroupId);
      formData.set("teamId", selectedTeamId);
      formData.set("returnTo", returnTo);
      formData.set("skipRedirect", "true");
      await addExecutorToWorkGroup(formData);
      setIsSaving(false);
      setSelectedTeamId("");
      onClose();
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Error al agregar ejecutor");
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const availableExecutors = executors.filter(
    (e) => !existingExecutorTeamIds.includes(e.teamId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
        <h3 className="text-lg font-semibold text-neutral-900">Agregar Cleaner</h3>
        <p className="text-sm text-neutral-600">
          Selecciona el Cleaner que quieres agregar a este grupo.
        </p>

        {isLoading ? (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <p className="text-sm text-neutral-500 mt-2">Cargando ejecutores...</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : availableExecutors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center">
            <p className="text-xs text-neutral-500">
              No hay Cleaners disponibles para agregar. Todos los equipos ya están conectados a este grupo de trabajo.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="teamId" className="block text-xs font-medium text-neutral-700 mb-1">
                Cleaner
              </label>
              <select
                id="teamId"
                name="teamId"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                required
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
              >
                <option value="">Seleccionar Cleaner...</option>
                {availableExecutors.map((executor) => (
                  <option key={executor.teamId} value={executor.teamId}>
                    {executor.teamName}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setSelectedTeamId("");
                  setError(null);
                }}
                disabled={isSaving}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving || !selectedTeamId}
                className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Conectando..." : "Conectar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

