"use client";

// app/cleaner/tareas-pro/[jobId]/CleanerJobExecutor.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  startTaskJob,
  respondTaskStep,
  completeTaskJob,
  uploadStepEvidenceAction,
  deleteStepEvidenceAction,
  clearTaskStepResponse,
} from "../actions";

// ---- Types ----

type EvidencePhoto = {
  id: string;
  thumbUrl: string;
  uploading?: boolean;
};

type StepResponse = {
  confirmed: boolean | null;
  boolValue: boolean | null;
  numberValue: number | null;
  textValue: string | null;
  notes: string | null;
  notCompletedReasonCode: string | null;
  notCompletedNote: string | null;
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

type JobInfo = {
  id: string;
  templateNameSnapshot: string;
  status: string;
  property: { name: string; shortName: string | null };
};

type SheetState = {
  stepId: string;
  sectionId: string;
  stepName: string;
  isLegacy: boolean;
  capturesYesNo: boolean;
  yesNoRequired: boolean;
  capturesNumber: boolean;
  numberRequired: boolean;
  capturesPhoto: boolean;
  photoRequired: boolean;
  capturesText: boolean;
  textRequired: boolean;
  isRequired: boolean;
  yesNoValue: boolean | null;
  numberValue: string;
  textValue: string;
  notes: string;
  evidencePhotos: EvidencePhoto[];
  reasonCode: string | null;
  reasonNote: string;
};

// ---- Helpers ----

function isLegacyNoCapture(step: JobStep): boolean {
  return (
    step.snapshotVersion === "LEGACY_V1" &&
    !step.capturesYesNoSnapshot &&
    !step.capturesNumberSnapshot &&
    !step.capturesPhotoSnapshot &&
    !step.capturesTextSnapshot
  );
}

function isSimpleStep(step: JobStep): boolean {
  return (
    !step.capturesYesNoSnapshot &&
    !step.capturesNumberSnapshot &&
    !step.capturesPhotoSnapshot &&
    !step.capturesTextSnapshot
  );
}

const REASON_CODE_LABELS: Record<string, string> = {
  NO_HABIA_INSUMOS: "Sin insumos",
  NO_TUVE_ACCESO: "Sin acceso",
  SE_ROMPIO_O_FALLO: "Falla / rotura",
  NO_HUBO_TIEMPO: "Sin tiempo",
  OTRO: "Otro motivo",
};

function getResponsePreview(step: JobStep): string | null {
  if (step.status !== "RESPONDED" || !step.response) return null;
  const r = step.response;
  if (r.notCompletedReasonCode) {
    const label = REASON_CODE_LABELS[r.notCompletedReasonCode] ?? "No completado";
    return r.notCompletedNote ? `${label} — ${r.notCompletedNote}` : label;
  }
  const parts: string[] = [];
  if (step.capturesYesNoSnapshot && r.boolValue !== null)
    parts.push(r.boolValue ? "Sí" : "No");
  if (step.capturesNumberSnapshot && r.numberValue !== null)
    parts.push(String(r.numberValue));
  if (step.capturesTextSnapshot && r.textValue)
    parts.push(r.textValue.length > 20 ? r.textValue.slice(0, 20) + "…" : r.textValue);
  if (step.capturesPhotoSnapshot) {
    const count = step.evidencePhotos.length;
    if (count > 0) parts.push(`${count} foto${count === 1 ? "" : "s"}`);
  }
  if (isSimpleStep(step) && parts.length === 0) return "Completado";
  return parts.length > 0 ? parts.join(" · ") : null;
}

function isSaveEnabled(sheet: SheetState): boolean {
  if (sheet.evidencePhotos.some((p) => p.uploading)) return false;
  // Modo reason code: solo validar nota si OTRO
  if (sheet.reasonCode) {
    if (sheet.reasonCode === "OTRO" && !sheet.reasonNote.trim()) return false;
    return true;
  }
  // Modo normal: validar captures requeridos
  if (sheet.capturesYesNo && sheet.yesNoRequired && sheet.yesNoValue === null) return false;
  if (sheet.capturesNumber && sheet.numberRequired && sheet.numberValue.trim() === "") return false;
  if (sheet.capturesText && sheet.textRequired && sheet.textValue.trim() === "") return false;
  if (
    sheet.capturesPhoto &&
    sheet.photoRequired &&
    sheet.evidencePhotos.filter((p) => !p.uploading).length === 0
  )
    return false;
  return true;
}

// ---- Component ----

export default function CleanerJobExecutor({
  job,
  initialSections,
  embedded = false,
}: {
  job: JobInfo;
  initialSections: JobSection[];
  embedded?: boolean;
}) {
  const [sections, setSections] = useState(initialSections);
  const [jobStatus, setJobStatus] = useState(job.status);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoNodeRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);

  // ---- Progress ----
  const allSteps = sections.flatMap((s) => s.steps);
  const respondedCount = allSteps.filter((s) => s.status === "RESPONDED").length;
  const totalCount = allSteps.length;
  const progressPct = totalCount > 0 ? Math.round((respondedCount / totalCount) * 100) : 0;

  const isCompleted = jobStatus === "COMPLETED" || jobStatus === "CANCELLED";

  // Client-side guard: all required/blocking steps must be RESPONDED
  const canComplete =
    !isCompleted &&
    jobStatus === "IN_PROGRESS" &&
    allSteps.every(
      (step) =>
        step.status === "RESPONDED" ||
        step.status === "DEFERRED" ||
        step.status === "SKIPPED" ||
        (!step.isRequiredSnapshot && !step.blocksCompletionSnapshot)
    );

  // ---- Start job ----
  const handleStart = async () => {
    setStarting(true);
    try {
      const formData = new FormData();
      formData.append("jobId", job.id);
      await startTaskJob(formData);
      setJobStatus("IN_PROGRESS");
    } catch (err: any) {
      alert(err?.message || "Error al iniciar la limpieza");
    } finally {
      setStarting(false);
    }
  };

  // ---- Quick confirm (simple steps — no captures) ----
  const handleQuickConfirm = async (step: JobStep, sectionId: string) => {
    if (isCompleted || jobStatus !== "IN_PROGRESS") return;
    // Optimistic update
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          steps: sec.steps.map((st) => {
            if (st.id !== step.id) return st;
            return {
              ...st,
              status: "RESPONDED",
              response: {
                confirmed: true,
                boolValue: null,
                numberValue: null,
                textValue: null,
                notes: null,
                notCompletedReasonCode: null,
                notCompletedNote: null,
              },
            };
          }),
        };
      })
    );
    try {
      const formData = new FormData();
      formData.append("stepId", step.id);
      formData.append("jobId", job.id);
      formData.append("confirmed", "true");
      await respondTaskStep(formData);
    } catch (err: any) {
      // Rollback
      setSections((prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            steps: sec.steps.map((st) => {
              if (st.id !== step.id) return st;
              return { ...st, status: step.status, response: step.response };
            }),
          };
        })
      );
      alert(err?.message || "Error al guardar");
    }
  };

  // ---- Clear step (unmark simple steps) ----
  const handleClearStep = async (step: JobStep, sectionId: string) => {
    if (isCompleted || jobStatus !== "IN_PROGRESS") return;
    // Optimistic update
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          steps: sec.steps.map((st) => {
            if (st.id !== step.id) return st;
            return { ...st, status: "PENDING", response: null };
          }),
        };
      })
    );
    try {
      const formData = new FormData();
      formData.append("stepId", step.id);
      formData.append("jobId", job.id);
      await clearTaskStepResponse(formData);
    } catch (err: any) {
      // Rollback
      setSections((prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            steps: sec.steps.map((st) => {
              if (st.id !== step.id) return st;
              return { ...st, status: step.status, response: step.response };
            }),
          };
        })
      );
      alert(err?.message || "Error al desmarcar");
    }
  };

  // ---- Open sheet ----
  const openSheet = (step: JobStep, sectionId: string, forceReasonMode = false) => {
    if (isCompleted || jobStatus !== "IN_PROGRESS") return;
    setSheet({
      stepId: step.id,
      sectionId,
      stepName: step.nameSnapshot,
      isLegacy: isLegacyNoCapture(step),
      capturesYesNo: step.capturesYesNoSnapshot,
      yesNoRequired: step.yesNoRequiredSnapshot,
      capturesNumber: step.capturesNumberSnapshot,
      numberRequired: step.numberRequiredSnapshot,
      capturesPhoto: step.capturesPhotoSnapshot,
      photoRequired: step.photoRequiredSnapshot,
      capturesText: step.capturesTextSnapshot,
      textRequired: step.textRequiredSnapshot,
      isRequired: step.isRequiredSnapshot || step.blocksCompletionSnapshot,
      yesNoValue: step.response?.boolValue ?? null,
      numberValue:
        step.response?.numberValue !== null && step.response?.numberValue !== undefined
          ? String(step.response.numberValue)
          : "",
      textValue: step.response?.textValue ?? "",
      notes: step.response?.notes ?? "",
      evidencePhotos: [...step.evidencePhotos],
      reasonCode: forceReasonMode ? "OTRO" : (step.response?.notCompletedReasonCode ?? null),
      reasonNote: forceReasonMode ? "" : (step.response?.notCompletedNote ?? ""),
    });
  };

  // ---- Save step response ----
  const handleSave = async () => {
    if (!sheet || submitting) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("stepId", sheet.stepId);
      formData.append("jobId", job.id);

      if (sheet.reasonCode) {
        // Modo "No pude" — enviar reason code, ignorar captures
        formData.append("notCompletedReasonCode", sheet.reasonCode);
        if (sheet.reasonNote.trim()) formData.append("notCompletedNote", sheet.reasonNote.trim());
      } else {
        // Modo normal — enviar captures
        formData.append("confirmed", "true");
        if (sheet.capturesYesNo && sheet.yesNoValue !== null)
          formData.append("boolValue", String(sheet.yesNoValue));
        if (sheet.capturesNumber && sheet.numberValue.trim())
          formData.append("numberValue", sheet.numberValue.trim());
        if (sheet.capturesText && sheet.textValue.trim())
          formData.append("textValue", sheet.textValue.trim());
      }
      if (sheet.notes.trim()) formData.append("notes", sheet.notes.trim());
      await respondTaskStep(formData);

      const { stepId, sectionId } = sheet;
      setSections((prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            steps: sec.steps.map((st) => {
              if (st.id !== stepId) return st;
              return {
                ...st,
                status: "RESPONDED",
                response: sheet.reasonCode
                  ? {
                      confirmed: null,
                      boolValue: null,
                      numberValue: null,
                      textValue: null,
                      notes: sheet.notes.trim() || null,
                      notCompletedReasonCode: sheet.reasonCode,
                      notCompletedNote: sheet.reasonNote.trim() || null,
                    }
                  : {
                      confirmed: true,
                      boolValue: sheet.capturesYesNo ? sheet.yesNoValue : null,
                      numberValue:
                        sheet.capturesNumber && sheet.numberValue
                          ? parseFloat(sheet.numberValue)
                          : null,
                      textValue: sheet.capturesText && sheet.textValue ? sheet.textValue : null,
                      notes: sheet.notes.trim() || null,
                      notCompletedReasonCode: null,
                      notCompletedNote: null,
                    },
                evidencePhotos: sheet.evidencePhotos,
              };
            }),
          };
        })
      );

      setSheet(null);
    } catch (err: any) {
      alert(err?.message || "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Evidence upload ----
  const handleFileSelect = async (file: File) => {
    if (!sheet) return;
    const tempId = `uploading-${Date.now()}`;
    const blobUrl = URL.createObjectURL(file);

    setSheet((prev) =>
      prev
        ? {
            ...prev,
            evidencePhotos: [
              ...prev.evidencePhotos,
              { id: tempId, thumbUrl: blobUrl, uploading: true },
            ],
          }
        : null
    );

    try {
      const formData = new FormData();
      formData.append("stepId", sheet.stepId);
      formData.append("file", file);
      const result = await uploadStepEvidenceAction(formData);

      setSheet((prev) =>
        prev
          ? {
              ...prev,
              evidencePhotos: prev.evidencePhotos.map((p) =>
                p.id === tempId
                  ? { id: result.evidenceAssetId, thumbUrl: result.thumbUrl, uploading: false }
                  : p
              ),
            }
          : null
      );
    } catch (err: any) {
      setSheet((prev) =>
        prev
          ? { ...prev, evidencePhotos: prev.evidencePhotos.filter((p) => p.id !== tempId) }
          : null
      );
      alert(err?.message || "Error al subir la foto");
    }
  };

  const handleDeleteEvidence = async (evidenceAssetId: string) => {
    if (!sheet) return;
    const updatedPhotos = sheet.evidencePhotos.filter((p) => p.id !== evidenceAssetId);
    setSheet((prev) =>
      prev ? { ...prev, evidencePhotos: updatedPhotos } : null
    );
    const formData = new FormData();
    formData.append("evidenceAssetId", evidenceAssetId);
    await deleteStepEvidenceAction(formData).catch(() => {});

    // Si era la última foto requerida y no hay reasonCode, desmarcar el step
    if (
      sheet.capturesPhoto &&
      sheet.photoRequired &&
      !sheet.reasonCode &&
      updatedPhotos.filter((p) => !p.uploading).length === 0
    ) {
      setSections((prev) =>
        prev.map((sec) => {
          if (sec.id !== sheet.sectionId) return sec;
          return {
            ...sec,
            steps: sec.steps.map((st) => {
              if (st.id !== sheet.stepId) return st;
              return { ...st, status: "PENDING", response: null, evidencePhotos: [] };
            }),
          };
        })
      );
      const clearFd = new FormData();
      clearFd.append("stepId", sheet.stepId);
      clearFd.append("jobId", job.id);
      clearTaskStepResponse(clearFd).catch(() => {});
    }
  };

  // ---- Camera ----
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const openCamera = async () => {
    setShowPhotoOptions(false);
    try {
      // Paso 1: obtener permisos con constraint genérico para desbloquear labels reales
      const permStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      permStream.getTracks().forEach((t) => t.stop());

      // Paso 2: enumerar con labels reales y preferir cámara no-virtual
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");

      const VIRTUAL_RE = /virtual|phone|android|poco|link|remote/i;
      const preferred =
        videoInputs.find((d) => !VIRTUAL_RE.test(d.label)) ?? videoInputs[0];

      // Paso 3: abrir stream con el deviceId exacto de la cámara preferida
      const videoConstraint: MediaTrackConstraints = preferred
        ? { deviceId: { exact: preferred.deviceId } }
        : {};

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });

      streamRef.current = stream;
      setShowCamera(true);
    } catch (err) {
      console.error("[Camera] Error:", err);
      alert("No se pudo acceder a la cámara. Verifica los permisos del navegador.");
    }
  };

  const capturePhoto = () => {
    const video = videoNodeRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopStream();
      setShowCamera(false);
      handleFileSelect(file);
    }, "image/jpeg", 0.92);
  };

  const closeCamera = () => {
    stopStream();
    setShowCamera(false);
  };

  // ---- Complete job ----
  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      const formData = new FormData();
      formData.append("jobId", job.id);
      await completeTaskJob(formData);
      setJobStatus("COMPLETED");
    } catch (err: any) {
      setCompleteError(err?.message || "No se puede finalizar");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className={embedded ? "px-4 py-4 space-y-4" : "max-w-lg mx-auto px-4 py-6 pb-32 space-y-4"}>

      {/* Header — solo en modo standalone (no embedded) */}
      {!embedded && (
        <div className="flex items-start gap-3">
          <Link
            href="/cleaner/tareas-pro"
            className="text-gray-400 hover:text-gray-700 mt-0.5 shrink-0 text-lg leading-none"
          >
            ←
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{job.templateNameSnapshot}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {job.property.shortName ?? job.property.name}
            </p>
          </div>
          <span
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
              isCompleted
                ? "bg-green-100 text-green-700"
                : jobStatus === "IN_PROGRESS"
                ? "bg-blue-100 text-blue-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {isCompleted
              ? "Completada"
              : jobStatus === "IN_PROGRESS"
              ? "En progreso"
              : "Pendiente"}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            {respondedCount} de {totalCount} tareas completadas
          </span>
          <span className="font-medium">{progressPct}%</span>
        </div>
        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-neutral-900 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Iniciar limpieza — solo en modo standalone; en embedded lo gestiona la página de limpieza */}
      {jobStatus === "PENDING" && !embedded && (
        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {starting ? "Iniciando…" : "Iniciar limpieza"}
        </button>
      )}

      {/* Sections */}
      {sections.map((section) => {
        const isCollapsed = collapsedSections[section.id] ?? false;
        const sectionDoneCount = section.steps.filter((s) => s.status === "RESPONDED").length;
        const sectionAllDone =
          sectionDoneCount === section.steps.length && section.steps.length > 0;

        return (
          <div key={section.id} className="border rounded-xl overflow-hidden">
            {/* Section header — colapsable */}
            <button
              type="button"
              onClick={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  [section.id]: !isCollapsed,
                }))
              }
              className="w-full bg-neutral-50 px-4 py-3 flex items-center justify-between hover:bg-neutral-100 transition text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                {section.isCarryForwardInjected && (
                  <span className="text-xs text-orange-500 shrink-0 font-medium">
                    Pendiente anterior
                  </span>
                )}
                <span
                  className={`text-sm font-medium truncate ${
                    sectionAllDone ? "text-green-700" : "text-neutral-800"
                  }`}
                >
                  {section.nameSnapshot}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span
                  className={`text-xs font-medium ${
                    sectionAllDone ? "text-green-600" : "text-neutral-400"
                  }`}
                >
                  {sectionDoneCount}/{section.steps.length}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${
                    isCollapsed ? "-rotate-90" : ""
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
              </div>
            </button>

            {/* Steps */}
            {!isCollapsed && (
              <div className="divide-y divide-neutral-100">
                {section.steps.map((step) => {
                  const isResponded = step.status === "RESPONDED";
                  const preview = getResponsePreview(step);
                  const stepIsLegacy = isLegacyNoCapture(step);

                  return (
                    <div key={step.id} className="divide-y divide-neutral-50">
                      <div
                        onClick={() => {
                          if (isCompleted || jobStatus !== "IN_PROGRESS") return;
                          if (isResponded) {
                            handleClearStep(step, section.id);
                          } else if (isSimpleStep(step)) {
                            handleQuickConfirm(step, section.id);
                          } else {
                            openSheet(step, section.id);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-4 transition text-left ${
                          !isCompleted && jobStatus === "IN_PROGRESS"
                            ? "hover:bg-neutral-50 active:bg-neutral-100 cursor-pointer"
                            : "cursor-default"
                        }`}
                      >
                        {/* Checkbox circle — verde si completado, ámbar si justificado */}
                        {(() => {
                          const hasReasonCode = isResponded && !!step.response?.notCompletedReasonCode;
                          return (
                            <div
                              className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                                hasReasonCode
                                  ? "bg-amber-400 border-amber-400"
                                  : isResponded
                                  ? "bg-green-500 border-green-500"
                                  : "border-neutral-300"
                              }`}
                            >
                              {hasReasonCode && (
                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                              {isResponded && !hasReasonCode && (
                                <svg
                                  className="w-4 h-4 text-white"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                          );
                        })()}

                        {/* Name + preview */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm leading-snug ${
                              isResponded
                                ? "text-neutral-400 line-through"
                                : "text-neutral-800"
                            }`}
                          >
                            {step.nameSnapshot}
                            {(step.isRequiredSnapshot || step.blocksCompletionSnapshot) &&
                              !isResponded && (
                                <span className="ml-1 text-red-400">*</span>
                              )}
                          </p>
                          {step.descriptionSnapshot && !isResponded && (
                            <p className="text-xs text-neutral-400 mt-0.5 truncate">
                              {step.descriptionSnapshot}
                            </p>
                          )}
                          {preview && (
                            <p className="text-xs text-neutral-400 mt-0.5 truncate">{preview}</p>
                          )}
                        </div>

                        {/* Capture badges / legacy badge / secondary action */}
                        {stepIsLegacy ? (
                          <span
                            className="shrink-0 text-xs text-amber-500 font-medium px-1.5 py-0.5 bg-amber-50 rounded"
                            title="Tarea de versión anterior"
                          >
                            ⚠
                          </span>
                        ) : step.capturesYesNoSnapshot ||
                          step.capturesNumberSnapshot ||
                          step.capturesTextSnapshot ||
                          step.capturesPhotoSnapshot ? (
                          <div className="shrink-0 flex items-center gap-0.5">
                            {step.capturesYesNoSnapshot && (
                              <span className="text-xs text-neutral-300 font-mono">S/N</span>
                            )}
                            {step.capturesNumberSnapshot && (
                              <span className="text-xs text-neutral-300 font-mono">123</span>
                            )}
                            {step.capturesTextSnapshot && (
                              <span className="text-xs text-neutral-300">Aa</span>
                            )}
                            {step.capturesPhotoSnapshot && (
                              <span className="text-xs text-neutral-300">📷</span>
                            )}
                          </div>
                        ) : !isResponded && !isCompleted && jobStatus === "IN_PROGRESS" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSheet(step, section.id, true);
                            }}
                            aria-label="No pude completar esta tarea"
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="9" strokeWidth="2" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Complete error */}
      {completeError && (
        <div className="border border-red-200 bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700">
          {completeError}
        </div>
      )}

      {/* Fixed bottom bar — solo en modo standalone */}
      {!embedded && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-neutral-100 px-4 pt-3 pb-6">
          <div className="max-w-lg mx-auto space-y-1.5">
            {isCompleted ? (
              <div className="flex items-center justify-center gap-2 py-3 text-green-600">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm font-medium">Limpieza finalizada</span>
              </div>
            ) : jobStatus === "IN_PROGRESS" ? (
              <>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={completing || !canComplete}
                  className="w-full bg-neutral-900 text-white py-3.5 rounded-xl font-medium text-sm hover:bg-neutral-800 active:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {completing ? "Finalizando…" : "Finalizar limpieza"}
                </button>
                {!canComplete && (
                  <p className="text-center text-xs text-neutral-400">
                    Completa todas las tareas obligatorias (*) para finalizar
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Input cámara (con capture) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
        }}
      />
      {/* Input galería (sin capture — abre explorador de archivos) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
        }}
      />

      {/* Modal cámara */}
      {showCamera && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col">
          {/* Video preview */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoCallbackRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>

          {/* Controles */}
          <div className="shrink-0 bg-black px-6 py-8 flex items-center justify-between">
            {/* Cerrar */}
            <button
              type="button"
              onClick={closeCamera}
              className="w-14 h-14 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Capturar */}
            <button
              type="button"
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 transition flex items-center justify-center"
            >
              <div className="w-14 h-14 rounded-full bg-white" />
            </button>

            {/* Espacio simétrico */}
            <div className="w-14" />
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      {sheet && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => !submitting && setSheet(null)}
          />

          {/* Sheet panel — centrado y acotado al ancho estándar de la página */}
          <div className="fixed bottom-0 inset-x-0 z-[70] flex justify-center">
          <div
            className="w-full sm:max-w-6xl bg-white rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-bottom) - 4rem)' }}
          >
            <div className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-4 space-y-5">
              {/* Handle */}
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto" />

              {/* Step name */}
              <div>
                <p className="text-base font-semibold text-neutral-900 leading-snug">
                  {sheet.stepName}
                </p>
                {sheet.isRequired && (
                  <p className="text-xs text-red-400 mt-0.5 font-medium">Obligatorio</p>
                )}
                {sheet.isLegacy && (
                  <p className="text-xs text-amber-500 mt-0.5">Tarea de versión anterior</p>
                )}
              </div>

              {/* No captures — simple or legacy completion (hidden when in reason-only mode) */}
              {!sheet.capturesYesNo &&
                !sheet.capturesNumber &&
                !sheet.capturesText &&
                !sheet.capturesPhoto &&
                !sheet.reasonCode && (
                  <div className="bg-neutral-50 rounded-xl px-4 py-4">
                    <p className="text-sm text-neutral-600">
                      Marca esta tarea como completada.
                    </p>
                  </div>
                )}

              {/* YES/NO */}
              {sheet.capturesYesNo && (
                <div className={`space-y-2 transition ${sheet.reasonCode ? "opacity-40 pointer-events-none" : ""}`}>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Sí / No{sheet.yesNoRequired ? " *" : ""}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSheet((prev) =>
                          prev ? { ...prev, yesNoValue: true } : null
                        )
                      }
                      className={`flex-1 py-3.5 rounded-xl font-semibold text-sm transition border-2 ${
                        sheet.yesNoValue === true
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-neutral-200 text-neutral-700 hover:border-green-300"
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSheet((prev) =>
                          prev ? { ...prev, yesNoValue: false } : null
                        )
                      }
                      className={`flex-1 py-3.5 rounded-xl font-semibold text-sm transition border-2 ${
                        sheet.yesNoValue === false
                          ? "bg-red-500 border-red-500 text-white"
                          : "border-neutral-200 text-neutral-700 hover:border-red-300"
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {/* NUMBER */}
              {sheet.capturesNumber && (
                <div className={`space-y-2 transition ${sheet.reasonCode ? "opacity-40 pointer-events-none" : ""}`}>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Número{sheet.numberRequired ? " *" : ""}
                  </p>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={sheet.numberValue}
                    onChange={(e) =>
                      setSheet((prev) =>
                        prev ? { ...prev, numberValue: e.target.value } : null
                      )
                    }
                    placeholder="0"
                    className="w-full border-2 border-neutral-200 rounded-xl px-4 py-3 text-2xl font-mono text-center focus:outline-none focus:border-neutral-900 transition"
                  />
                </div>
              )}

              {/* TEXT */}
              {sheet.capturesText && (
                <div className={`space-y-2 transition ${sheet.reasonCode ? "opacity-40 pointer-events-none" : ""}`}>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Texto{sheet.textRequired ? " *" : ""}
                  </p>
                  <textarea
                    value={sheet.textValue}
                    onChange={(e) =>
                      setSheet((prev) =>
                        prev ? { ...prev, textValue: e.target.value } : null
                      )
                    }
                    placeholder="Escribe aquí…"
                    rows={3}
                    className="w-full border-2 border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-neutral-900 transition"
                  />
                </div>
              )}

              {/* PHOTO */}
              {sheet.capturesPhoto && (
                <div className={`space-y-2 transition ${sheet.reasonCode ? "opacity-40 pointer-events-none" : ""}`}>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Fotos{sheet.photoRequired ? " *" : ""}
                  </p>
                  {sheet.evidencePhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {sheet.evidencePhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative aspect-square rounded-xl overflow-hidden bg-neutral-100"
                        >
                          <img
                            src={photo.thumbUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          {photo.uploading ? (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteEvidence(photo.id)}
                              className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-sm hover:bg-black/80 transition"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPhotoOptions((v) => !v)}
                      className="w-full border-2 border-dashed border-neutral-300 rounded-xl py-4 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition flex items-center justify-center gap-2"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {sheet.evidencePhotos.length === 0 ? "Tomar / elegir foto" : "Agregar otra"}
                    </button>

                    {/* Mini-modal de opciones */}
                    {showPhotoOptions && (
                      <>
                        <div
                          className="fixed inset-0 z-[60]"
                          onClick={() => setShowPhotoOptions(false)}
                        />
                        <div className="absolute bottom-full mb-2 left-0 right-0 z-[61] bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={openCamera}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-neutral-800 hover:bg-neutral-50 transition"
                          >
                            <svg className="w-5 h-5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Tomar foto
                          </button>
                          <div className="border-t border-neutral-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setShowPhotoOptions(false);
                              galleryInputRef.current?.click();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-neutral-800 hover:bg-neutral-50 transition"
                          >
                            <svg className="w-5 h-5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Elegir de galería
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Notes — ocultar en reason-only mode (step simple con reasonCode) */}
              {!(sheet.reasonCode && !sheet.capturesYesNo && !sheet.capturesNumber && !sheet.capturesText && !sheet.capturesPhoto) && (
                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block uppercase tracking-wide">
                    Nota opcional
                  </label>
                  <input
                    type="text"
                    value={sheet.notes}
                    onChange={(e) =>
                      setSheet((prev) =>
                        prev ? { ...prev, notes: e.target.value } : null
                      )
                    }
                    disabled={!!sheet.reasonCode}
                    placeholder="Añade una observación…"
                    className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-neutral-400 transition disabled:opacity-40 disabled:bg-neutral-50"
                  />
                </div>
              )}

              {/* No pude completar esta tarea — visible en steps requeridos o cuando hay reasonCode activo */}
              {(sheet.isRequired || !!sheet.reasonCode) && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setSheet((prev) => {
                        if (!prev) return null;
                        return prev.reasonCode
                          ? { ...prev, reasonCode: null, reasonNote: "" }
                          : { ...prev, reasonCode: "OTRO", reasonNote: "" };
                      })
                    }
                    className={`w-full text-left px-4 py-3.5 transition ${
                      sheet.reasonCode
                        ? "bg-amber-50"
                        : "bg-white hover:bg-neutral-50"
                    }`}
                  >
                    {sheet.reasonCode ? (
                      <>
                        <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-0.5">
                          ¿Por qué no se hizo esta tarea?
                        </p>
                        <p className="text-sm font-semibold text-amber-700 leading-snug">
                          {sheet.stepName}
                        </p>
                        <p className="text-xs text-amber-500 mt-0.5">Toca para cancelar la justificación</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-neutral-800 leading-snug">
                          No pude completar esta tarea
                        </p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          Registra el motivo si no tuviste acceso, insumos, tiempo o hubo una falla.
                        </p>
                      </>
                    )}
                  </button>

                  {sheet.reasonCode && (
                    <div className="px-4 pb-4 pt-2 space-y-3 bg-amber-50">
                      {/* Botones de reason code */}
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { code: "NO_HABIA_INSUMOS", label: "Sin insumos" },
                            { code: "NO_TUVE_ACCESO", label: "Sin acceso" },
                            { code: "SE_ROMPIO_O_FALLO", label: "Falla / rotura" },
                            { code: "NO_HUBO_TIEMPO", label: "Sin tiempo" },
                            { code: "OTRO", label: "Otro" },
                          ] as const
                        ).map(({ code, label }) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() =>
                              setSheet((prev) =>
                                prev ? { ...prev, reasonCode: code, reasonNote: code !== "OTRO" ? prev.reasonNote : "" } : null
                              )
                            }
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                              sheet.reasonCode === code
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "bg-white border-neutral-300 text-neutral-700 hover:border-amber-400"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Nota — obligatoria si OTRO, opcional para el resto */}
                      <div>
                        <label className="text-xs font-medium text-amber-700 mb-1 block">
                          {sheet.reasonCode === "OTRO" ? "Describe el motivo *" : "Nota (opcional)"}
                        </label>
                        <textarea
                          value={sheet.reasonNote}
                          onChange={(e) =>
                            setSheet((prev) =>
                              prev ? { ...prev, reasonNote: e.target.value } : null
                            )
                          }
                          placeholder={
                            sheet.reasonCode === "OTRO"
                              ? "Explica qué pasó…"
                              : "Añade contexto si lo necesitas…"
                          }
                          rows={2}
                          className="w-full border border-amber-200 bg-white rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-amber-400 transition"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
            {/* Footer de acciones — siempre visible, nunca scrolleable */}
            <div
              className="shrink-0 px-5 pt-3 bg-white border-t border-neutral-100"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
            >
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSheet(null)}
                  disabled={submitting}
                  className="flex-1 border border-neutral-200 bg-white text-neutral-700 py-4 rounded-xl font-semibold text-sm hover:bg-neutral-50 active:bg-neutral-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={submitting || !isSaveEnabled(sheet)}
                  className="flex-1 bg-neutral-900 text-white py-4 rounded-xl font-semibold text-sm hover:bg-neutral-800 active:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Guardando…" : "Guardar y continuar"}
                </button>
              </div>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
