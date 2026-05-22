"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createProperty } from "./actions";
import AddressModal, { type AddressModalValue } from "@/lib/ui/AddressModal";
import HourPicker from "./[id]/HourPicker";

const COMMON_TIMEZONES = [
  { value: "America/Mexico_City", label: "México (Ciudad de México)" },
  { value: "America/Cancun", label: "México (Cancún)" },
  { value: "America/Mazatlan", label: "México (Mazatlán)" },
  { value: "America/Merida", label: "México (Mérida)" },
  { value: "America/Monterrey", label: "México (Monterrey)" },
  { value: "America/Tijuana", label: "México (Tijuana)" },
  { value: "America/New_York", label: "Estados Unidos (Nueva York)" },
  { value: "America/Chicago", label: "Estados Unidos (Chicago)" },
  { value: "America/Denver", label: "Estados Unidos (Denver)" },
  { value: "America/Los_Angeles", label: "Estados Unidos (Los Ángeles)" },
  { value: "Europe/Madrid", label: "España (Madrid)" },
];

const GROUP_EXAMPLES = ["Centro", "Playa", "Torre A", "Condesa"];

type StepKey = "identity" | "operation" | "organization" | "cleaning";

type Step = {
  key: StepKey;
  title: string;
  eyebrow: string;
};

const STEPS: Step[] = [
  { key: "identity", title: "Identidad", eyebrow: "Alojamiento" },
  { key: "operation", title: "Operación", eyebrow: "Reservas" },
  { key: "organization", title: "Organización", eyebrow: "Grupo" },
  { key: "cleaning", title: "Limpieza", eyebrow: "Siguiente" },
];

function getInitialTimeZone() {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && COMMON_TIMEZONES.some((tz) => tz.value === detected)) {
      return detected;
    }
  } catch {
    // Browser timezone detection is best-effort.
  }

  return "America/Mexico_City";
}

function StepIcon({ step, active }: { step: number; active: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
        active
          ? "bg-neutral-950 text-white"
          : "bg-neutral-100 text-neutral-500"
      }`}
      aria-hidden="true"
    >
      {step}
    </span>
  );
}

function FieldIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600"
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export default function CreatePropertyForm({ existingGroups = [] }: { existingGroups?: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [address, setAddress] = useState("");
  const [timeZone, setTimeZone] = useState(getInitialTimeZone);
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [groupName, setGroupName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const currentStep = STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;
  const hasIdentity = name.trim().length > 0 && shortName.trim().length > 0;
  const hasOperation =
    checkInTime.trim().length > 0 &&
    checkOutTime.trim().length > 0 &&
    timeZone.trim().length > 0;
  const hasOrganization = groupName.trim().length > 0;
  const canSubmit = hasIdentity && hasOperation && hasOrganization;
  const canContinue =
    (currentStep.key === "identity" && hasIdentity) ||
    (currentStep.key === "operation" && hasOperation) ||
    (currentStep.key === "organization" && hasOrganization) ||
    currentStep.key === "cleaning";

  const resetForm = useCallback(() => {
    setStepIndex(0);
    setName("");
    setShortName("");
    setAddress("");
    setTimeZone(getInitialTimeZone());
    setCheckInTime("");
    setCheckOutTime("");
    setIcalUrl("");
    setGroupName("");
  }, []);

  const handleOpen = () => setIsOpen(true);
  const handleClose = useCallback(() => {
    setIsOpen(false);
    resetForm();
  }, [resetForm]);
  const handleOpenAddressModal = () => setIsAddressModalOpen(true);

  const goNext = () => {
    if (!canContinue) return;
    setStepIndex((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = formRef.current;
    if (!form || !canSubmit) return;

    const formData = new FormData(form);
    formData.set("name", name.trim());
    formData.set("shortName", shortName.trim());
    formData.set("address", address.trim());
    formData.set("timeZone", timeZone.trim());
    formData.set("checkInTime", checkInTime.trim());
    formData.set("checkOutTime", checkOutTime.trim());
    formData.set("icalUrl", icalUrl.trim());
    formData.set("groupName", groupName.trim());

    startTransition(async () => {
      try {
        await createProperty(formData);
        handleClose();
        router.refresh();
      } catch (error) {
        console.error("Error al crear propiedad:", error);
      }
    });
  };

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

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] sm:w-auto sm:min-w-[140px] sm:max-w-xs"
      >
        Agregar propiedad
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <div
            className="relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-neutral-200 bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-property-title"
          >
            <div className="border-b border-neutral-100 p-5 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Nueva propiedad
                  </p>
                  <h3
                    id="create-property-title"
                    className="mt-1 text-lg font-semibold text-neutral-950"
                  >
                    Configura tu operación
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
                  aria-label="Cerrar modal de nueva propiedad"
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
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {STEPS.map((step, index) => {
                  const active = index <= stepIndex;
                  return (
                    <div key={step.key} className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StepIcon step={index + 1} active={active} />
                        <div className="hidden min-w-0 sm:block">
                          <p className="truncate text-xs font-semibold text-neutral-900">
                            {step.title}
                          </p>
                          <p className="truncate text-[11px] text-neutral-500">
                            {step.eyebrow}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            active ? "bg-neutral-900" : "bg-transparent"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {currentStep.key === "identity" && (
                  <div className="space-y-5">
                    <div className="flex gap-3">
                      <FieldIcon>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 10.5 12 3l9 7.5M5 10v10h14V10"
                          />
                        </svg>
                      </FieldIcon>
                      <div>
                        <h4 className="text-base font-semibold text-neutral-950">
                          Identidad
                        </h4>
                        <p className="mt-1 text-sm leading-5 text-neutral-600">
                          Identifica el alojamiento que vas a operar.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-xs font-medium text-neutral-800">
                          Nombre propiedad *
                        </label>
                        <input
                          name="name"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                          placeholder="Ej. Casa de playa en Cancún"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-neutral-800">
                          Alias corto *
                        </label>
                        <input
                          name="shortName"
                          required
                          value={shortName}
                          onChange={(e) => setShortName(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                          placeholder="Ej. CasaPlaya"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-neutral-800">
                          Zona horaria
                          <span className="text-neutral-500"> *</span>
                        </label>
                        <select
                          name="timeZone"
                          value={timeZone}
                          onChange={(e) => setTimeZone(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                        >
                          {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz.value} value={tz.value}>
                              {tz.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-xs font-medium text-neutral-800">
                          Dirección
                        </label>
                        <button
                          type="button"
                          onClick={handleOpenAddressModal}
                          className={`w-full rounded-xl border border-neutral-300 px-3 py-2 text-left text-base transition hover:bg-neutral-50 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-black/5 ${
                            !address ? "text-neutral-400" : "text-neutral-900"
                          }`}
                        >
                          {address || "Ej. Av. del Mar 123, Cancún"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep.key === "operation" && (
                  <div className="space-y-5">
                    <div className="flex gap-3">
                      <FieldIcon>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"
                          />
                        </svg>
                      </FieldIcon>
                      <div>
                        <h4 className="text-base font-semibold text-neutral-950">
                          Operación
                        </h4>
                        <p className="mt-1 text-sm leading-5 text-neutral-600">
                          El calendario permite crear limpiezas automáticamente.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-neutral-800">
                          Hora check-in
                          <span className="text-neutral-500"> *</span>
                        </label>
                        <HourPicker
                          value={checkInTime}
                          onChange={(value) => setCheckInTime(value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-neutral-800">
                          Hora check-out
                          <span className="text-neutral-500"> *</span>
                        </label>
                        <HourPicker
                          value={checkOutTime}
                          onChange={(value) => setCheckOutTime(value)}
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-xs font-medium text-neutral-800">
                          URL iCal
                        </label>
                        <input
                          name="icalUrl"
                          value={icalUrl}
                          onChange={(e) => setIcalUrl(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                          placeholder="https://www.airbnb.mx/calendar/ical/..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep.key === "organization" && (
                  <div className="space-y-5">
                    <div className="flex gap-3">
                      <FieldIcon>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 7h16M4 12h16M4 17h16"
                          />
                        </svg>
                      </FieldIcon>
                      <div>
                        <h4 className="text-base font-semibold text-neutral-950">
                          Organización
                        </h4>
                        <p className="mt-1 text-sm leading-5 text-neutral-600">
                          Los grupos ayudan a organizar zonas, edificios o
                          portafolios.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-800">
                        Grupo
                        <span className="text-neutral-500"> *</span>
                      </label>
                      <input
                        name="groupName"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                        placeholder="Ej. Centro"
                      />
                    </div>

                    <div className="space-y-2">
                      {existingGroups.length > 0 && (
                        <p className="text-xs text-neutral-500">Tus grupos</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {(existingGroups.length > 0 ? existingGroups : GROUP_EXAMPLES).map((chip) => {
                          const isActive = groupName.trim().toLowerCase() === chip.trim().toLowerCase();
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setGroupName(chip)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 ${
                                isActive
                                  ? "border-neutral-950 bg-neutral-950 text-white"
                                  : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                              }`}
                            >
                              {chip}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {currentStep.key === "cleaning" && (
                  <div className="space-y-5">
                    <div className="flex gap-3">
                      <FieldIcon>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12.75 11.25 15 15 9.75M4 5h16v14H4z"
                          />
                        </svg>
                      </FieldIcon>
                      <div>
                        <h4 className="text-base font-semibold text-neutral-950">
                          Operación de limpieza
                        </h4>
                        <p className="mt-1 text-sm leading-5 text-neutral-600">
                          Después podrás conectar equipos de limpieza para
                          automatizar asignaciones.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-sm font-medium text-neutral-900">
                        Tu propiedad quedará lista para el siguiente paso.
                      </p>
                      <p className="mt-1 text-sm leading-5 text-neutral-600">
                        Al guardar podrás revisar el detalle, ajustar datos y
                        asignar WorkGroups desde la propiedad.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 flex items-center gap-3 border-t border-neutral-100 bg-white p-4">
                {!isFirstStep && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.99]"
                  >
                    Atrás
                  </button>
                )}
                {isLastStep ? (
                  <button
                    type="submit"
                    disabled={isPending || !canSubmit}
                    className="min-h-[44px] flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? "Guardando..." : "Guardar propiedad"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canContinue}
                    className="min-h-[44px] flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continuar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      <AddressModal
        open={isAddressModalOpen}
        onOpenChange={setIsAddressModalOpen}
        title="Dirección de la propiedad"
        initialCombinedAddress={address}
        onSave={(value: AddressModalValue) => {
          setAddress(value.combinedAddress);
        }}
      />
    </>
  );
}
