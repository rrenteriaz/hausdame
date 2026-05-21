// app/host/workgroups/[id]/WorkGroupInvitesSection.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { revokeInvite } from "../invites/actions";
import StopPropagationDiv from "@/lib/ui/StopPropagationDiv";
import { copyToClipboard } from "@/lib/browser/copyToClipboard";

type InviteStatus = "PENDING" | "CLAIMED" | "EXPIRED" | "REVOKED";

interface Invite {
  id: string;
  token: string;
  status: InviteStatus;
  prefillName: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  claimedAt: Date | string | null;
  createdByUser: {
    name: string | null;
  };
  claimedByUser?: {
    name: string | null;
    email: string;
  } | null;
  inviteLink: string;
}

interface WorkGroupInvitesSectionProps {
  workGroupId: string;
  workGroupName: string;
  invites: Invite[];
  returnTo: string;
}

function formatStatus(status: InviteStatus): { label: string; className: string } {
  switch (status) {
    case "PENDING":
      return { label: "Pendiente", className: "bg-amber-100 text-amber-800" };
    case "CLAIMED":
      return { label: "Aceptada", className: "bg-emerald-100 text-emerald-800" };
    case "EXPIRED":
      return { label: "Expirada", className: "bg-neutral-100 text-neutral-600" };
    case "REVOKED":
      return { label: "Revocada", className: "bg-red-100 text-red-800" };
  }
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][
    date.getUTCMonth()
  ];
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

function isExpired(invite: Invite): boolean {
  return new Date(invite.expiresAt).getTime() < Date.now();
}

function getEffectiveStatus(invite: Invite): InviteStatus {
  if (invite.status === "PENDING" && isExpired(invite)) return "EXPIRED";
  return invite.status;
}

function getInviteLabel(invite: Invite): string {
  return invite.prefillName?.trim() || invite.claimedByUser?.name || "Invitación sin nombre";
}

export default function WorkGroupInvitesSection({
  workGroupId,
  workGroupName,
  invites,
  returnTo,
}: WorkGroupInvitesSectionProps) {
  const router = useRouter();
  const pendingInvites = invites.filter((invite) => getEffectiveStatus(invite) === "PENDING");
  const historicalInvites = invites.filter((invite) => getEffectiveStatus(invite) !== "PENDING");
  const [isExpanded, setIsExpanded] = useState(pendingInvites.length > 0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [prefillName, setPrefillName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const showCopied = (inviteId: string) => {
    setCopiedInviteId(inviteId);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopiedInviteId(null), 1200);
  };

  const handleCopyInviteLink = async (invite: Invite) => {
    if (await copyToClipboard(invite.inviteLink)) {
      showCopied(invite.id);
    }
  };

  const handleCopyGeneratedLink = async () => {
    if (!generatedLink) return;
    if (await copyToClipboard(generatedLink)) {
      showCopied("generated");
    }
  };

  const handleCreateInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setGeneratedLink(null);

    try {
      const response = await fetch(`/api/host-workgroups/${workGroupId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefillName: prefillName.trim() || null,
          expiresInDays,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Error al generar el link de invitación");
      }

      const data: { inviteLink: string } = await response.json();
      setGeneratedLink(data.inviteLink);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al generar el link de invitación");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setGeneratedLink(null);
    setPrefillName("");
    setExpiresInDays(7);
    setError(null);
    setIsCreateOpen(false);
  };

  const handleRevoke = async (inviteId: string) => {
    if (!confirm("¿Revocar este enlace? La persona ya no podrá usarlo.")) return;

    try {
      const formData = new FormData();
      formData.set("inviteId", inviteId);
      formData.set("workGroupId", workGroupId);
      formData.set("returnTo", returnTo);
      await revokeInvite(formData);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "No se pudo revocar la invitación");
    }
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={isExpanded}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-800">Invita a un Cleaner</h2>
            {pendingInvites.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {pendingInvites.length} pendiente{pendingInvites.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            Mantén activos solo los enlaces pendientes para conectar nuevos equipos.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100"
          aria-label={isExpanded ? "Ocultar invitaciones" : "Mostrar invitaciones"}
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

      {isExpanded && (
        <>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="w-full rounded-lg border border-black bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98] sm:w-auto"
          >
            Crear invitación
          </button>

          <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-neutral-800">Pendientes</p>
          {pendingInvites.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {pendingInvites.length} pendiente{pendingInvites.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {pendingInvites.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
            No hay invitaciones pendientes.
          </div>
        ) : (
          <div className="space-y-2">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="rounded-xl border border-neutral-200 p-3 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{getInviteLabel(invite)}</p>
                    <p className="text-xs text-neutral-500">Expira: {formatDate(invite.expiresAt)}</p>
                  </div>
                  <StopPropagationDiv>
                    <button
                      type="button"
                      onClick={() => handleRevoke(invite.id)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:w-auto"
                    >
                      Revocar enlace
                    </button>
                  </StopPropagationDiv>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    readOnly
                    value={invite.inviteLink}
                    className="min-w-0 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 outline-none"
                    aria-label={`Link de invitación para ${getInviteLabel(invite)}`}
                  />
                  <StopPropagationDiv>
                    <button
                      type="button"
                      onClick={() => handleCopyInviteLink(invite)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition active:scale-[0.97] ${
                        copiedInviteId === invite.id
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      {copiedInviteId === invite.id ? "Copiado" : "Copiar link"}
                    </button>
                  </StopPropagationDiv>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>

          {historicalInvites.length > 0 && (
        <div className="border-t border-neutral-100 pt-3">
          <button
            type="button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm text-neutral-700 hover:text-neutral-900"
            aria-expanded={isHistoryOpen}
          >
            <span className="font-medium">Ver historial de invitaciones</span>
            <span className="flex items-center gap-2 text-xs text-neutral-500">
              {historicalInvites.length}
              <svg
                className={`h-4 w-4 transition-transform ${isHistoryOpen ? "rotate-180" : ""}`}
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
            </span>
          </button>

          {isHistoryOpen && (
            <div className="mt-2 space-y-2">
              {historicalInvites.map((invite) => {
                const statusInfo = formatStatus(getEffectiveStatus(invite));
                return (
                  <div key={invite.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{getInviteLabel(invite)}</p>
                        <p className="text-xs text-neutral-500">
                          Creada: {formatDate(invite.createdAt)}
                          {invite.claimedAt ? ` · Aceptada: ${formatDate(invite.claimedAt)}` : ""}
                        </p>
                        {invite.claimedByUser && (
                          <p className="text-xs text-neutral-500 truncate">
                            Por: {invite.claimedByUser.name ?? invite.claimedByUser.email}
                          </p>
                        )}
                      </div>
                      <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
          )}
        </>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Generar invitación</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Crea un enlace para conectar un Cleaner a {workGroupName}.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {generatedLink ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-emerald-950">Link de invitación generado</p>
                  <input
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCopyGeneratedLink}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  {copiedInviteId === "generated" ? "Copiado" : "Copiar link"}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800"
                >
                  Listo
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="prefillName" className="block text-sm font-medium text-neutral-800">
                    Nombre del cleaner o equipo opcional
                  </label>
                  <input
                    type="text"
                    id="prefillName"
                    name="prefillName"
                    value={prefillName}
                    onChange={(event) => setPrefillName(event.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                    placeholder="Ej. Equipo Centro"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="expiresInDays" className="block text-sm font-medium text-neutral-800">
                    Expira en
                  </label>
                  <select
                    id="expiresInDays"
                    name="expiresInDays"
                    value={expiresInDays}
                    onChange={(event) => setExpiresInDays(Number.parseInt(event.target.value, 10))}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                  >
                    <option value={1}>1 día</option>
                    <option value={7}>7 días</option>
                    <option value={14}>14 días</option>
                    <option value={30}>30 días</option>
                  </select>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreating ? "Generando..." : "Generar link"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
