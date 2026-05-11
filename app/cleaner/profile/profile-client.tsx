"use client";

import { useMemo, useState, useTransition } from "react";
import EditCleanerProfileModal from "./profile-edit-modal";
import { changePassword } from "./actions";
import CleanerAddressMapPreview from "./CleanerAddressMapPreview";
import PropertyLocationPreview from "@/app/host/properties/[id]/PropertyLocationPreview";
import PWAInstallSection from "@/components/pwa/PWAInstallSection";

type CleanerProfileData =
  | {
      fullName: string | null;
      phone: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
      latitude: number | null;
      longitude: number | null;
    }
  | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDisplayPhone(raw: string | null): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return raw;
  return `🇲🇽 (+52) ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

// ── Modal de cambio de contraseña ─────────────────────────────────────────────

function ChangePasswordModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    startTransition(async () => {
      try {
        await changePassword({ newPassword });
        setSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "No se pudo cambiar la contraseña.");
      }
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={handleClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Cambiar contraseña</h2>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 text-neutral-400 hover:text-neutral-700 transition rounded-full hover:bg-neutral-100"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 text-center">
                Contraseña actualizada correctamente.
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-neutral-700">Nueva contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  autoFocus
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 transition"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-neutral-700">Confirmar contraseña</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 transition"
                />
              </div>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isPending || !newPassword || !confirmPassword}
                  className="flex-1 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPending ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CleanerProfileClient({
  user,
  cleanerProfile,
}: {
  user: { id: string; email: string; nickname: string | null };
  cleanerProfile: CleanerProfileData;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);

  const addressText = useMemo(() => {
    if (!cleanerProfile) return null;
    const parts = [
      cleanerProfile.addressLine1,
      cleanerProfile.addressLine2 ? `Int. ${cleanerProfile.addressLine2}` : null,
      cleanerProfile.neighborhood,
      cleanerProfile.city,
      cleanerProfile.state,
      cleanerProfile.postalCode,
    ]
      .filter((p) => p && String(p).trim())
      .map((p) => String(p).trim());
    return parts.length ? parts.join(", ") : null;
  }, [cleanerProfile]);


  return (
    <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-neutral-900">Mi perfil</p>
            <p className="text-xs text-neutral-500 mt-1">
              Esta información se usa para mostrarte en tu equipo y en el marketplace.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPasswordOpen(true)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Cambiar contraseña
            </button>
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Editar
            </button>
          </div>
        </div>

        {/* Campos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-neutral-500">Nickname</p>
            <p className="text-base font-medium text-neutral-900 mt-0.5">
              {user.nickname || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500">Nombre completo</p>
            <p className="text-base font-medium text-neutral-900 mt-0.5">
              {cleanerProfile?.fullName || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500">Email</p>
            <p className="text-base font-medium text-neutral-900 mt-0.5">
              {user.email}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500">Teléfono</p>
            <p className="text-base font-medium text-neutral-900 mt-0.5">
              {formatDisplayPhone(cleanerProfile?.phone ?? null)}
            </p>
          </div>

          {/* Domicilio + mapa (dos columnas en desktop cuando hay dirección) */}
          {addressText ? (
            <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-neutral-500">Domicilio</p>
                <p className="text-base font-medium text-neutral-900 mt-0.5 break-words">
                  {addressText}
                </p>
              </div>
              <div className="w-full sm:w-64 shrink-0">
                {cleanerProfile?.latitude != null && cleanerProfile?.longitude != null ? (
                  <PropertyLocationPreview
                    latitude={cleanerProfile.latitude}
                    longitude={cleanerProfile.longitude}
                    propertyName="Mi domicilio"
                  />
                ) : (
                  <CleanerAddressMapPreview address={addressText} />
                )}
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <p className="text-xs text-neutral-500">Domicilio</p>
              <p className="text-base font-medium text-neutral-900 mt-0.5">—</p>
            </div>
          )}
        </div>
      </section>

      <PWAInstallSection />

      <ChangePasswordModal
        isOpen={isPasswordOpen}
        onClose={() => setIsPasswordOpen(false)}
      />

      <EditCleanerProfileModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        initial={{
          nickname: user.nickname || "",
          fullName: cleanerProfile?.fullName || "",
          phone: cleanerProfile?.phone || "",
          addressLine1: cleanerProfile?.addressLine1 || "",
          addressLine2: cleanerProfile?.addressLine2 || "",
          neighborhood: cleanerProfile?.neighborhood || "",
          city: cleanerProfile?.city || "",
          state: cleanerProfile?.state || "",
          postalCode: cleanerProfile?.postalCode || "",
          country: cleanerProfile?.country || "MX",
          latitude: cleanerProfile?.latitude ?? null,
          longitude: cleanerProfile?.longitude ?? null,
        }}
      />
    </>
  );
}
