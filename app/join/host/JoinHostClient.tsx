// app/join/host/JoinHostClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface HostWorkGroupInviteInfo {
  id: string;
  workGroupId: string;
  workGroupName: string;
  status: string;
  expiresAt: string;
  prefillName: string | null;
  message: string | null;
  createdAt: string;
  createdByUser: {
    name: string | null;
  };
}

interface JoinHostClientProps {
  inviteInfo: HostWorkGroupInviteInfo;
  token: string;
  autoClaim: boolean;
  isAuthenticated: boolean;
}

const MONTHS_ES_MX = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function formatMexicoCityDateTime(dateString: string): string {
  const date = new Date(dateString);
  const cdmxDate = new Date(date.getTime() - 6 * 60 * 60 * 1000);
  const day = String(cdmxDate.getUTCDate()).padStart(2, "0");
  const month = MONTHS_ES_MX[cdmxDate.getUTCMonth()];
  const year = cdmxDate.getUTCFullYear();
  const hour24 = cdmxDate.getUTCHours();
  const hour12 = String(hour24 % 12 || 12).padStart(2, "0");
  const minute = String(cdmxDate.getUTCMinutes()).padStart(2, "0");
  const period = hour24 >= 12 ? "p.m." : "a.m.";

  return `${day} ${month} ${year}, ${hour12}:${minute} ${period}`;
}

export default function JoinHostClient({
  inviteInfo,
  token,
  autoClaim,
}: JoinHostClientProps) {
  const router = useRouter();
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoClaimTriggered, setAutoClaimTriggered] = useState(false);

  const joinRedirect = `/join/host?token=${token}`;

  const handleClaim = useCallback(async () => {
    setIsClaiming(true);
    setError(null);

    try {
      const res = await fetch(`/api/host-workgroup-invites/${token}/claim`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // No autenticado, redirigir a login con redirect
          router.push(`/login?redirect=${encodeURIComponent(joinRedirect)}`);
          return;
        } else if (res.status === 409) {
          setError(data.error || "Este link ya fue usado por otro usuario");
        } else if (res.status === 410) {
          setError(data.error || "Esta invitación ha expirado o ha sido revocada");
        } else if (res.status === 403) {
          setError(data.error || "No tienes permiso para aceptar esta invitación. Solo usuarios Cleaner pueden aceptar.");
        } else {
          setError(data.error || "Error al aceptar la invitación");
        }
        setIsClaiming(false);
        return;
      }

      const redirectTo = data.redirectTo || "/cleaner/teams";
      const separator = redirectTo.includes("?") ? "&" : "?";
      router.replace(`${redirectTo}${separator}joined=1`);
    } catch {
      setError("Error de conexión");
      setIsClaiming(false);
    }
  }, [joinRedirect, router, token]);

  // Auto-claim si autoClaim es true (viene de signup/login)
  useEffect(() => {
    if (!autoClaim || autoClaimTriggered || isClaiming) return;
    if (inviteInfo.status !== "PENDING") return;
    
    // Si viene con auto=1, intentar claim después de un breve delay
    // Esto permite que la sesión se establezca después de signup/login
    const timer = setTimeout(() => {
      if (!autoClaimTriggered && !isClaiming) {
        setAutoClaimTriggered(true);
        void handleClaim();
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [autoClaim, autoClaimTriggered, handleClaim, isClaiming, inviteInfo.status]);

  const formatStatus = (status: string): { label: string; className: string } => {
    switch (status) {
      case "PENDING":
        return { label: "Pendiente", className: "bg-amber-100 text-amber-800" };
      case "CLAIMED":
        return { label: "Aceptada", className: "bg-emerald-100 text-emerald-800" };
      case "EXPIRED":
        return { label: "Expirada", className: "bg-neutral-100 text-neutral-600" };
      case "REVOKED":
        return { label: "Revocada", className: "bg-red-100 text-red-800" };
      default:
        return { label: status, className: "bg-neutral-100 text-neutral-600" };
    }
  };

  const statusInfo = formatStatus(inviteInfo.status);
  const isPending = inviteInfo.status === "PENDING";
  const isExpired = inviteInfo.status === "EXPIRED";
  const isRevoked = inviteInfo.status === "REVOKED";

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="flex flex-col items-center text-center gap-3">
          <div className="flex items-center gap-2 text-neutral-900">
            <div className="h-8 w-8 rounded-xl bg-black text-white flex items-center justify-center text-sm font-semibold">
              H
            </div>
            <span className="text-lg font-semibold">Hausdame</span>
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Tienes una invitación para conectar tu equipo a un grupo de trabajo
          </h1>
        </header>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-neutral-500">Grupo de trabajo</p>
              <p className="text-lg font-semibold text-neutral-900">{inviteInfo.workGroupName}</p>
            </div>
            <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-neutral-700">
            <div>
              <p className="text-xs text-neutral-500">Vigencia</p>
              <p className="font-medium text-neutral-900">
                {formatMexicoCityDateTime(inviteInfo.expiresAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Rol</p>
              <p className="font-medium text-neutral-900">Team Leader (Cleaner)</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-900 mb-2">Qué incluye</p>
            <ul className="text-sm text-neutral-600 space-y-1 list-disc list-inside">
              <li>Acceso a limpiezas disponibles de las propiedades asignadas</li>
              <li>Conectar tu equipo (Mi equipo) al grupo de trabajo</li>
              <li>Gestión de limpiezas desde tu panel de Cleaner</li>
            </ul>
          </div>

          {inviteInfo.message && (
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
              <p className="text-xs font-medium text-neutral-500 mb-1">Mensaje de invitación</p>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{inviteInfo.message}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
          {isPending ? (
            <button
              onClick={handleClaim}
              disabled={isClaiming}
              className="w-full py-2.5 px-4 bg-black text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isClaiming ? "Aceptando..." : "Aceptar invitación"}
            </button>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
              {isExpired
                ? "Esta invitación expiró. Solicita un nuevo enlace."
                : isRevoked
                ? "Esta invitación fue revocada. Solicita un nuevo enlace."
                : "Esta invitación ya fue aceptada."}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Link
              href={`/login?redirect=${encodeURIComponent(joinRedirect)}`}
              className="flex-1 py-2 px-4 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 text-center font-medium"
            >
              Iniciar sesión
            </Link>
            <Link
              href={`/signup?redirect=${encodeURIComponent(joinRedirect)}`}
              className="flex-1 py-2 px-4 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 text-center font-medium"
            >
              Crear cuenta
            </Link>
          </div>

          <div className="text-xs text-neutral-500">
            Este enlace expira automáticamente. Si tienes dudas, contacta a la persona que te invitó.
          </div>

          <div className="text-center text-sm text-neutral-500">
            <Link href="/login" className="text-blue-600 hover:text-blue-700">
              Ir al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

