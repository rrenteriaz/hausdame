"use client";

/**
 * Modal reutilizable para crear un nuevo grupo de trabajo.
 *
 * Usado en:
 * - app/host/workgroups/page.tsx (flujo guiado)
 * - app/host/properties/[id]/AssignWorkGroupModal.tsx (creación simple inline)
 */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { FormEvent, ReactNode } from "react";
import BottomSheet from "@/lib/ui/BottomSheet";
import { copyToClipboard } from "@/lib/browser/copyToClipboard";
import { createWorkGroup, updateWorkGroupProperties } from "./actions";

type WorkGroupPropertyOption = {
  id: string;
  name: string;
  shortName: string | null;
  address?: string | null;
};

type CreatedWorkGroup = {
  id: string;
  name: string;
};

type WizardStep = "name" | "properties" | "invite" | "done";

interface NewWorkGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workGroupId: string, workGroupName: string) => void;
  isMobile?: boolean;
  availableProperties?: WorkGroupPropertyOption[];
  guided?: boolean;
}

const STEPS: { key: WizardStep; title: string }[] = [
  { key: "name", title: "Grupo" },
  { key: "properties", title: "Propiedades" },
  { key: "invite", title: "Cleaner" },
  { key: "done", title: "Listo" },
];

export default function NewWorkGroupModal({
  isOpen,
  onClose,
  onSuccess,
  isMobile: externalIsMobile,
  availableProperties = [],
  guided = false,
}: NewWorkGroupModalProps) {
  const [isPending, startTransition] = useTransition();
  const [isMobile, setIsMobile] = useState(externalIsMobile ?? true);
  const [step, setStep] = useState<WizardStep>("name");
  const [name, setName] = useState("");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [createdWorkGroup, setCreatedWorkGroup] =
    useState<CreatedWorkGroup | null>(null);
  const [assignedPropertiesCount, setAssignedPropertiesCount] = useState(0);
  const [inviteName, setInviteName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const canCreate = name.trim().length > 0 && !isPending;
  const currentStepIndex = Math.max(
    0,
    STEPS.findIndex((item) => item.key === step)
  );

  useEffect(() => {
    if (externalIsMobile === undefined) {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 640);
      };
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, [externalIsMobile]);

  const resetState = useCallback(() => {
    setStep("name");
    setName("");
    setSelectedPropertyIds([]);
    setCreatedWorkGroup(null);
    setAssignedPropertiesCount(0);
    setInviteName("");
    setExpiresInDays(7);
    setInviteLink(null);
    setCopyStatus("idle");
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleClose, isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = formRef.current;
    if (!form) return;

    const cleanName = name.trim();
    if (!cleanName) {
      setError("Escribe un nombre para crear el grupo de trabajo.");
      return;
    }

    const formData = new FormData(form);
    formData.set("name", cleanName);

    startTransition(async () => {
      try {
        setError(null);
        const result = await createWorkGroup(formData);
        if (!result?.id) {
          throw new Error("No se pudo crear el grupo de trabajo.");
        }

        const created = { id: result.id, name: result.name };
        setCreatedWorkGroup(created);

        if (!guided) {
          onSuccess?.(created.id, created.name);
          handleClose();
          return;
        }

        setStep("properties");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error al crear el grupo de trabajo. Por favor, intenta de nuevo.";
        setError(message);
      }
    });
  };

  const handleAssignProperties = () => {
    if (!createdWorkGroup) return;

    startTransition(async () => {
      try {
        setError(null);
        const formData = new FormData();
        formData.set("workGroupId", createdWorkGroup.id);
        formData.set("propertyIds", JSON.stringify(selectedPropertyIds));
        formData.set("skipRevalidate", "true");

        await updateWorkGroupProperties(formData);
        setAssignedPropertiesCount(selectedPropertyIds.length);
        setStep("invite");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudieron asignar las propiedades.";
        setError(message);
      }
    });
  };

  const handleCreateInvite = () => {
    if (!createdWorkGroup) return;

    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/host-workgroups/${createdWorkGroup.id}/invites`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prefillName: inviteName.trim() || null,
              expiresInDays,
            }),
          }
        );

        const rawResponse = await response.text();
        let data: { error?: string; inviteLink?: string } = {};
        if (rawResponse) {
          try {
            data = JSON.parse(rawResponse) as {
              error?: string;
              inviteLink?: string;
            };
          } catch {
            data = {};
          }
        }

        if (!response.ok) {
          throw new Error(data.error || "No se pudo crear la invitación.");
        }

        if (!data.inviteLink) {
          throw new Error("La invitación se creó sin link de respuesta.");
        }

        setInviteLink(data.inviteLink);
        setCopyStatus("idle");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo crear la invitación.";
        setError(message);
      }
    });
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    const copied = await copyToClipboard(inviteLink);
    setCopyStatus(copied ? "copied" : "error");
    window.setTimeout(() => setCopyStatus("idle"), 1400);
  };

  const toggleProperty = (propertyId: string) => {
    setSelectedPropertyIds((current) =>
      current.includes(propertyId)
        ? current.filter((id) => id !== propertyId)
        : [...current, propertyId]
    );
  };

  const finish = () => {
    if (createdWorkGroup) {
      onSuccess?.(createdWorkGroup.id, createdWorkGroup.name);
    }
    handleClose();
  };

  const content = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-neutral-100 px-5 pb-4 pt-1 sm:px-6">
        <div className="grid grid-cols-4 gap-2">
          {STEPS.map((item, index) => {
            const active = index <= currentStepIndex;
            return (
              <div key={item.key} className="min-w-0">
                <div
                  className={`h-1 rounded-full transition ${
                    active ? "bg-neutral-950" : "bg-neutral-100"
                  }`}
                />
                <p
                  className={`mt-2 truncate text-[11px] font-medium ${
                    active ? "text-neutral-900" : "text-neutral-400"
                  }`}
                >
                  {item.title}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="px-5 pt-4 sm:px-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm leading-5 text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {step === "name" && (
          <form ref={formRef} onSubmit={handleCreate} className="space-y-5">
            <StepIntro icon={<PeopleIcon />} title="Crear grupo de trabajo">
              Conecta propiedades con equipos de limpieza para organizar
              asignaciones y futuras invitaciones.
            </StepIntro>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-800">
                Nombre del grupo de trabajo
                <span className="text-neutral-500"> *</span>
              </label>
              <input
                name="name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                placeholder="Ej. Equipo Centro, Zona Playa, Torre A"
                autoFocus
                aria-invalid={error ? "true" : "false"}
              />
            </div>
          </form>
        )}

        {step === "properties" && (
          <div className="space-y-5">
            <StepIntro icon={<HomeIcon />} title="Propiedades a incluir">
              Selecciona las propiedades que este WorkGroup podrá operar. Este
              paso es opcional.
            </StepIntro>

            {availableProperties.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-medium text-neutral-900">
                  Primero crea una propiedad
                </p>
                <p className="mt-1 text-sm leading-5 text-neutral-600">
                  Puedes omitir este paso y asignar propiedades más adelante
                  desde el detalle del WorkGroup.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableProperties.map((property) => {
                  const checked = selectedPropertyIds.includes(property.id);
                  return (
                    <label
                      key={property.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-neutral-900 bg-neutral-50"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProperty(property.id)}
                        className="mt-1 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-neutral-950">
                          {property.shortName || property.name}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
                          {property.name}
                          {property.address ? ` · ${property.address}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === "invite" && (
          <div className="space-y-5">
            <StepIntro icon={<InviteIcon />} title="Invitar cleaner">
              Genera un link para que un cleaner o líder de equipo se conecte a
              este WorkGroup. Puedes compartirlo después.
            </StepIntro>

            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-neutral-800">
                  Nombre del cleaner o equipo
                  <span className="text-neutral-500"> opcional</span>
                </label>
                <input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                  placeholder="Ej. Ana, Equipo Centro"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-neutral-800">
                  Expira en
                </label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                >
                  <option value={3}>3 días</option>
                  <option value={7}>7 días</option>
                  <option value={14}>14 días</option>
                  <option value={30}>30 días</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm leading-5 text-neutral-600">
                Hausdame genera un link de invitación. El envío por email no
                está conectado en este flujo todavía.
              </p>
            </div>

            {inviteLink && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-950">
                  Link de invitación generado
                </p>
                <p className="mt-1 text-sm leading-5 text-emerald-800">
                  Copia este enlace y envíaselo al cleaner para que se conecte
                  a este WorkGroup.
                </p>
                {copyStatus === "error" && (
                  <p className="mt-2 text-sm text-red-700">
                    No se pudo copiar automáticamente. Mantén presionado el link
                    para copiarlo manualmente.
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={inviteLink}
                    className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-neutral-700"
                    aria-label="Link de invitación generado"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step === "done" && createdWorkGroup && (
          <div className="space-y-5">
            <StepIntro icon={<CheckIcon />} title="Tu grupo de trabajo está listo">
              Ya puedes usarlo para organizar propiedades, invitaciones y
              asignaciones operativas.
            </StepIntro>

            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <dl className="space-y-3 text-sm">
                <SummaryRow label="WorkGroup" value={createdWorkGroup.name} />
                <SummaryRow
                  label="Propiedades"
                  value={
                    assignedPropertiesCount > 0
                      ? `${assignedPropertiesCount} asignada${
                          assignedPropertiesCount === 1 ? "" : "s"
                        }`
                      : "Pendiente"
                  }
                />
                <SummaryRow
                  label="Invitación"
                  value={inviteLink ? "Link generado" : "Pendiente"}
                />
              </dl>
            </div>

            {inviteLink && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-xs font-medium text-neutral-700">
                  Link de invitación
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={inviteLink}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600"
                  />
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="min-h-[40px] rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-neutral-100 bg-white p-4 sm:flex-row">
        {step === "name" && (
          <>
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={!canCreate}
              className="min-h-[44px] flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Creando..." : guided ? "Crear y continuar" : "Crear WorkGroup"}
            </button>
          </>
        )}

        {step === "properties" && (
          <>
            <button
              type="button"
              onClick={() => {
                setAssignedPropertiesCount(0);
                setStep("invite");
              }}
              disabled={isPending}
              className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Omitir por ahora
            </button>
            <button
              type="button"
              onClick={handleAssignProperties}
              disabled={isPending || selectedPropertyIds.length === 0}
              className="min-h-[44px] flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Asignando..." : "Asignar propiedades"}
            </button>
          </>
        )}

        {step === "invite" && (
          <>
            {inviteLink ? (
              <>
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.99]"
                >
                  {copyStatus === "copied" ? "Link copiado" : "Copiar link"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("done")}
                  className="min-h-[44px] flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
                >
                  Continuar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep("done")}
                  disabled={isPending}
                  className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Omitir por ahora
                </button>
                <button
                  type="button"
                  onClick={handleCreateInvite}
                  disabled={isPending}
                  className="min-h-[44px] flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? "Generando..." : "Generar invitación"}
                </button>
              </>
            )}
          </>
        )}

        {step === "done" && createdWorkGroup && (
          <>
            <Link
              href="/host/hoy"
              onClick={finish}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.99]"
            >
              Volver a Hoy
            </Link>
            <Link
              href={`/host/workgroups/${createdWorkGroup.id}`}
              onClick={finish}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
            >
              Ver grupo de trabajo
            </Link>
          </>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={handleClose}
        title="Crear grupo de trabajo"
        maxHeight="90vh"
      >
        <div className="flex max-h-[90vh] min-h-0 flex-col pt-2">
          {content}
        </div>
      </BottomSheet>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
      onClick={handleClose}
    >
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workgroup-title"
      >
        <div className="border-b border-neutral-100 p-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                WorkGroup
              </p>
              <h3
                id="create-workgroup-title"
                className="mt-1 text-lg font-semibold text-neutral-950"
              >
                Crear grupo de trabajo
              </h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
              aria-label="Cerrar modal de crear grupo de trabajo"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        {content}
      </div>
    </div>
  );
}

function StepIntro({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <h4 className="text-base font-semibold text-neutral-950">{title}</h4>
        <p className="mt-1 text-sm leading-5 text-neutral-600">{children}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-neutral-950">{value}</dd>
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a4 4 0 0 0-4-4h-1M9 20H4v-2a4 4 0 0 1 4-4h1m7-5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10.5 12 3l9 7.5M5 10v10h14V10"
      />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-2v6m3-3h-6"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12.75 11.25 15 15 9.75M4 5h16v14H4z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}
