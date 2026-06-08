"use client";

import { useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createTaskStep,
  deleteTaskStep,
  updateTaskStepName,
  createTaskSection,
  deleteTaskSection,
  updateTaskSection,
  updateTaskTemplateStatus,
  updateTaskTemplateSchedule,
  updateTaskTemplate,
  deleteTaskTemplate,
  archiveTaskTemplate,
} from "../actions";
import StepCaptureModal from "./StepCaptureModal";
import StepFrequencyModal from "./StepFrequencyModal";
import TaskStepPhotosModal from "./TaskStepPhotosModal";
import CopyToPropertyModal from "./CopyToPropertyModal";
import ConfirmModal from "@/components/ConfirmModal";
import { scheduleHumanDescription, isScheduleComplete } from "@/lib/tareas-pro/domain/schedule-anchor";

// ---- Types ----

type Step = {
  id: string;
  name: string;
  capturesYesNo: boolean;
  yesNoRequired: boolean;
  capturesNumber: boolean;
  numberRequired: boolean;
  capturesPhoto: boolean;
  photoRequired: boolean;
  capturesText: boolean;
  textRequired: boolean;
  captureVersion: string;
  stepFrequency: string | null;
  stepAnchorDayOfWeek: number | null;
  stepAnchorDayOfMonth: number | null;
  intervalDays: number | null;
  startDate: string | null;
  order: number;
  _temp?: boolean;
};

type Section = {
  id: string;
  name: string;
  sectionType: string;
  order: number;
  steps: Step[];
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  propertyId: string;
  property: { name: string; shortName: string | null };
  schedule: {
    frequency: string;
    carryForwardPolicy: string;
    maxCarryForwardAttempts: number;
    anchorDayOfWeek: number | null;
    anchorDayOfMonth: number | null;
    timezone: string | null;
  } | null;
  _count: { jobs: number };
};

// ---- Constants ----

const FREQ_LABELS: Record<string, string> = {
  PER_CHECKOUT: "Cada limpieza",
  DAILY:        "Diario",
  WEEKLY:       "Semanal",
  MONTHLY:      "Mensual",
  MANUAL:       "Manual",
  INTERVAL:     "Cada N días",
};

const FREQ_FILTER_OPTIONS = [
  { value: null,           label: "Todas" },
  { value: "PER_CHECKOUT", label: "Cada limpieza" },
  { value: "WEEKLY",       label: "Semanal" },
  { value: "MONTHLY",      label: "Mensual" },
  { value: "INTERVAL",     label: "Cada N días" },
];

const TEMPLATE_FREQ_OPTIONS = [
  { value: "PER_CHECKOUT", label: "Cada limpieza" },
  { value: "MANUAL",       label: "Manual" },
] as const;

const LEGACY_PERIODIC_FREQS = ["DAILY", "WEEKLY", "MONTHLY"] as const;

type TenantProperty = {
  id: string;
  name: string;
  shortName: string | null;
};

// ---- Component ----

export default function ChecklistEditor({
  template,
  initialSections,
  initialThumbsEntries,
  tenantProperties = [],
}: {
  template: Template;
  initialSections: Section[];
  initialThumbsEntries: [string, Array<string | null>][];
  tenantProperties?: TenantProperty[];
}) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [thumbsMap, setThumbsMap] = useState<Map<string, Array<string | null>>>(
    () => new Map(initialThumbsEntries)
  );
  const [frequencyFilter, setFrequencyFilter] = useState<string | null>(null);
  const [addStepTexts, setAddStepTexts] = useState<Record<string, string>>({});
  const [addingStep, setAddingStep] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [captureModal, setCaptureModal] = useState<{ stepId: string; name: string; sectionId: string; captures: { capturesYesNo: boolean; yesNoRequired: boolean; capturesNumber: boolean; numberRequired: boolean; capturesPhoto: boolean; photoRequired: boolean; capturesText: boolean; textRequired: boolean } } | null>(null);
  const [freqModal, setFreqModal] = useState<{ stepId: string; name: string; stepFrequency: string | null; stepAnchorDayOfWeek: number | null; stepAnchorDayOfMonth: number | null; intervalDays: number | null; startDate: string | null; sectionId: string } | null>(null);
  const [photosModal, setPhotosModal] = useState<{ stepId: string; name: string } | null>(null);
  const [editStepModal, setEditStepModal] = useState<{ stepId: string; sectionId: string; name: string } | null>(null);
  const [editStepNameValue, setEditStepNameValue] = useState("");
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<Section | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  // Inline rename
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(template.name);
  const [renamePending, startRenameTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Add section
  const [addSectionName, setAddSectionName] = useState("");
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addingSectionLoading, setAddingSectionLoading] = useState(false);

  // Edit section inline
  const [editSectionId, setEditSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");

  // Schedule config form (local state — se persiste solo al hacer clic en Guardar)
  const [schedFreq, setSchedFreq] = useState(template.schedule?.frequency ?? "MANUAL");
  const [schedDayOfWeek, setSchedDayOfWeek] = useState<number | null>(
    template.schedule?.anchorDayOfWeek ?? null,
  );
  const [schedDayOfMonth, setSchedDayOfMonth] = useState<number | null>(
    template.schedule?.anchorDayOfMonth ?? null,
  );
  const [schedTimezone, setSchedTimezone] = useState(template.schedule?.timezone ?? "");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const fd = new FormData();
      fd.append("templateId", template.id);
      fd.append("frequency", schedFreq);
      fd.append("carryForwardPolicy", template.schedule?.carryForwardPolicy ?? "LIMITED");
      fd.append("maxCarryForwardAttempts", String(template.schedule?.maxCarryForwardAttempts ?? 2));
      if (schedDayOfWeek !== null) fd.append("anchorDayOfWeek", String(schedDayOfWeek));
      if (schedDayOfMonth !== null) fd.append("anchorDayOfMonth", String(schedDayOfMonth));
      if (schedTimezone) fd.append("timezone", schedTimezone);
      await updateTaskTemplateSchedule(fd);
    } catch (err: any) {
      showError(err?.message || "Error al guardar la configuración de schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  // UI actions
  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  // ---- Step frequency filter ----
  const getFilteredSteps = (steps: Step[]) => {
    if (!frequencyFilter) return steps;
    return steps.filter((s) => s.stepFrequency === frequencyFilter);
  };

  // ---- Add step (optimistic) ----
  const handleAddStep = async (sectionId: string) => {
    const name = (addStepTexts[sectionId] || "").trim();
    if (!name) return;

    setAddingStep((prev) => ({ ...prev, [sectionId]: true }));
    const tempId = `temp-${Date.now()}`;
    const section = sections.find((s) => s.id === sectionId);
    const maxOrder = section ? Math.max(-1, ...section.steps.map((s) => s.order)) : -1;
    const tempStep: Step = { id: tempId, name, capturesYesNo: false, yesNoRequired: false, capturesNumber: false, numberRequired: false, capturesPhoto: false, photoRequired: false, capturesText: false, textRequired: false, captureVersion: "MULTI_CAPTURE_V2", stepFrequency: null, stepAnchorDayOfWeek: null, stepAnchorDayOfMonth: null, intervalDays: null, startDate: null, order: maxOrder + 1, _temp: true };

    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, steps: [...s.steps, tempStep] } : s));
    setAddStepTexts((prev) => ({ ...prev, [sectionId]: "" }));

    try {
      const formData = new FormData();
      formData.append("sectionId", sectionId);
      formData.append("name", name);
      const created = await createTaskStep(formData);
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, steps: s.steps.map((st) => st.id === tempId ? {
                ...created,
                captureVersion: created.captureVersion ?? "MULTI_CAPTURE_V2",
                stepFrequency: created.stepFrequency ?? null,
                stepAnchorDayOfWeek: created.stepAnchorDayOfWeek ?? null,
                stepAnchorDayOfMonth: created.stepAnchorDayOfMonth ?? null,
                intervalDays: created.intervalDays ?? null,
                startDate: created.startDate ? (created.startDate as Date).toISOString() : null,
                _temp: false,
              } : st) }
            : s
        )
      );
    } catch (err: any) {
      setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, steps: s.steps.filter((st) => st.id !== tempId) } : s));
      showError(err?.message || "Error al agregar la tarea");
    } finally {
      setAddingStep((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  // ---- Delete step (optimistic) ----
  const handleDeleteStep = async (stepId: string, sectionId: string) => {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, steps: s.steps.filter((st) => st.id !== stepId) } : s));
    try {
      const formData = new FormData();
      formData.append("stepId", stepId);
      await deleteTaskStep(formData);
    } catch (err: any) {
      showError(err?.message || "Error al eliminar la tarea");
    }
  };

  // ---- Capture update callback ----
  const handleCaptureUpdate = (stepId: string, sectionId: string, captures: Step) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, steps: s.steps.map((st) => st.id === stepId ? { ...st, ...captures } : st) }
          : s
      )
    );
  };

  // ---- Frequency update callback ----
  const handleFreqUpdate = (stepId: string, sectionId: string, newFreq: string | null, anchorDayOfWeek: number | null, anchorDayOfMonth: number | null, intervalDays: number | null, startDate: string | null) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, steps: s.steps.map((st) => st.id === stepId ? { ...st, stepFrequency: newFreq, stepAnchorDayOfWeek: anchorDayOfWeek, stepAnchorDayOfMonth: anchorDayOfMonth, intervalDays, startDate } : st) } : s
      )
    );
  };

  // ---- Edit step name (optimistic) ----
  const handleEditStepName = async (stepId: string, sectionId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const original = sections.flatMap((s) => s.steps).find((st) => st.id === stepId)?.name ?? "";
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, steps: s.steps.map((st) => st.id === stepId ? { ...st, name: trimmed } : st) } : s
      )
    );
    setEditStepModal(null);
    try {
      const fd = new FormData();
      fd.append("stepId", stepId);
      fd.append("name", trimmed);
      await updateTaskStepName(fd);
    } catch (err: any) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, steps: s.steps.map((st) => st.id === stepId ? { ...st, name: original } : st) } : s
        )
      );
      showError(err?.message || "Error al renombrar la tarea");
    }
  };

  // ---- Add section (optimistic) ----
  const handleAddSection = async () => {
    const name = addSectionName.trim();
    if (!name) return;
    setAddingSectionLoading(true);
    const tempId = `temp-section-${Date.now()}`;
    const tempSection: Section = { id: tempId, name, sectionType: "STANDARD", order: sections.length, steps: [] };
    setSections((prev) => [...prev, tempSection]);
    setAddSectionName("");
    setAddSectionOpen(false);
    try {
      const formData = new FormData();
      formData.append("templateId", template.id);
      formData.append("name", name);
      const created = await createTaskSection(formData);
      setSections((prev) => prev.map((s) => s.id === tempId ? { ...created, steps: [] } : s));
    } catch (err: any) {
      setSections((prev) => prev.filter((s) => s.id !== tempId));
      showError(err?.message || "Error al agregar el área");
    } finally {
      setAddingSectionLoading(false);
    }
  };

  // ---- Delete section ----
  const handleDeleteSection = async (section: Section) => {
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    setDeleteSectionConfirm(null);
    try {
      const formData = new FormData();
      formData.append("sectionId", section.id);
      await deleteTaskSection(formData);
    } catch (err: any) {
      showError(err?.message || "Error al eliminar el área");
    }
  };

  // ---- Rename section ----
  const handleRenameSection = async (sectionId: string) => {
    const name = editSectionName.trim();
    if (!name) { setEditSectionId(null); return; }
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, name } : s));
    setEditSectionId(null);
    try {
      const section = sections.find((s) => s.id === sectionId);
      const formData = new FormData();
      formData.append("sectionId", sectionId);
      formData.append("name", name);
      formData.append("sectionType", section?.sectionType ?? "STANDARD");
      formData.append("requiresGlobalConfirm", "false");
      await updateTaskSection(formData);
    } catch (err: any) {
      showError(err?.message || "Error al renombrar el área");
    }
  };

  // ---- Thumbs update ----
  const handleThumbsChange = (stepId: string, thumbs: Array<string | null>) => {
    setThumbsMap((prev) => new Map(prev).set(stepId, thumbs));
  };

  const commitRename = () => {
    const trimmed = editNameValue.trim();
    if (!trimmed || trimmed === template.name) {
      setEditNameValue(template.name);
      setEditingName(false);
      return;
    }
    startRenameTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("templateId", template.id);
        fd.append("name", trimmed);
        fd.append("status", template.status);
        fd.append("description", template.description ?? "");
        await updateTaskTemplate(fd);
      } catch (err: any) {
        showError(err?.message || "Error al renombrar el checklist");
        setEditNameValue(template.name);
      } finally {
        setEditingName(false);
      }
    });
  };

  const currentStatus = template.status;
  const currentFrequency = template.schedule?.frequency ?? "MANUAL";

  return (
    <>
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 mt-1 shrink-0 text-lg leading-none">←</button>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameInputRef}
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                if (e.key === "Escape") { setEditNameValue(template.name); setEditingName(false); }
              }}
              disabled={renamePending}
              maxLength={120}
              className="w-full text-lg font-semibold border-b-2 border-neutral-400 focus:border-neutral-900 outline-none bg-transparent py-0.5 leading-tight disabled:opacity-50"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => { setEditNameValue(template.name); setEditingName(true); }}
              className="text-left text-lg font-semibold truncate w-full hover:underline decoration-dotted underline-offset-2 cursor-text"
              title="Clic para renombrar"
            >
              {renamePending ? editNameValue : template.name}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{template.property.shortName ?? template.property.name}</p>
        </div>
        {/* Status pills */}
        <div className="flex gap-1.5 shrink-0">
          {(["DRAFT", "ACTIVE"] as const).map((s) => (
            <form key={s} action={updateTaskTemplateStatus}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                  currentStatus === s
                    ? s === "ACTIVE" ? "bg-green-500 text-white" : "bg-yellow-400 text-yellow-900"
                    : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                }`}
              >
                {s === "DRAFT" ? "Borrador" : "Activo"}
              </button>
            </form>
          ))}
        </div>
      </div>

      {/* Filtro de frecuencia (view only — filtra steps en el editor) */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Filtrar por cuando se genera</p>
        <div className="flex flex-wrap gap-2">
          {FREQ_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setFrequencyFilter(frequencyFilter === value ? null : value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                frequencyFilter === value
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Áreas y tareas ---- */}
      <div className="space-y-3">
        {sections.map((section) => {
          const filteredSteps = getFilteredSteps(section.steps);
          const isEditingName = editSectionId === section.id;

          return (
            <div key={section.id} className="border rounded-xl overflow-hidden">
              {/* Header área */}
              <div className="bg-neutral-50 px-4 py-2.5 flex items-center gap-2">
                {isEditingName ? (
                  <input
                    autoFocus
                    value={editSectionName}
                    onChange={(e) => setEditSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSection(section.id);
                      if (e.key === "Escape") setEditSectionId(null);
                    }}
                    onBlur={() => handleRenameSection(section.id)}
                    className="flex-1 text-sm font-medium bg-white border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditSectionId(section.id); setEditSectionName(section.name); }}
                    className="flex-1 text-left text-sm font-medium text-neutral-800 hover:text-neutral-600 transition truncate"
                    title="Clic para renombrar"
                  >
                    {section.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteSectionConfirm(section)}
                  className="text-neutral-300 hover:text-red-500 transition p-1 shrink-0"
                  title="Eliminar área"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Tareas */}
              <div className="divide-y divide-neutral-100">
                {filteredSteps.length === 0 && frequencyFilter && (
                  <p className="px-4 py-3 text-xs text-neutral-400 italic">
                    Sin tareas con este filtro en esta área.
                  </p>
                )}
                {filteredSteps.map((step) => {
                  const stepThumbs = thumbsMap.get(step.id) ?? [null, null, null];
                  const photoCount = stepThumbs.filter(Boolean).length;
                  const hasFreq = step.stepFrequency !== null;

                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-2 px-4 py-2.5 ${step._temp ? "opacity-50" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (step._temp) return;
                          setEditStepModal({ stepId: step.id, sectionId: section.id, name: step.name });
                          setEditStepNameValue(step.name);
                        }}
                        className="flex-1 text-sm text-neutral-800 min-w-0 truncate text-left hover:text-neutral-500 transition-colors cursor-pointer"
                        title="Editar nombre de tarea"
                      >
                        {step.name}
                      </button>

                      {/* Capturas */}
                      <button
                        type="button"
                        onClick={() => !step._temp && setCaptureModal({
                          stepId: step.id,
                          name: step.name,
                          sectionId: section.id,
                          captures: {
                            capturesYesNo: step.capturesYesNo,
                            yesNoRequired: step.yesNoRequired,
                            capturesNumber: step.capturesNumber,
                            numberRequired: step.numberRequired,
                            capturesPhoto: step.capturesPhoto,
                            photoRequired: step.photoRequired,
                            capturesText: step.capturesText,
                            textRequired: step.textRequired,
                          },
                        })}
                        className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-neutral-100 hover:bg-neutral-200 transition"
                        title={step.captureVersion === "LEGACY_V1" && !step.capturesYesNo && !step.capturesNumber && !step.capturesPhoto && !step.capturesText ? "Tarea legacy — configura las capturas para actualizarla" : "Configurar capturas"}
                      >
                        {step.captureVersion === "LEGACY_V1" && !step.capturesYesNo && !step.capturesNumber && !step.capturesPhoto && !step.capturesText ? (
                          <span className="text-xs text-amber-500 font-medium">v1 ⚠</span>
                        ) : !step.capturesYesNo && !step.capturesNumber && !step.capturesPhoto && !step.capturesText ? (
                          <span className="text-xs text-neutral-400 font-mono">–</span>
                        ) : (
                          <>
                            {step.capturesYesNo && <span className="text-xs text-neutral-500 font-mono">S/N</span>}
                            {step.capturesNumber && <span className="text-xs text-neutral-500 font-mono">123</span>}
                            {step.capturesText && <span className="text-xs text-neutral-500">Aa</span>}
                            {step.capturesPhoto && <span className="text-xs text-neutral-500">📷</span>}
                          </>
                        )}
                      </button>

                      {/* Fotos */}
                      <button
                        type="button"
                        onClick={() => !step._temp && setPhotosModal({ stepId: step.id, name: step.name })}
                        className={`relative shrink-0 transition hover:opacity-80 ${photoCount > 0 ? "text-blue-500" : "text-neutral-300"}`}
                        title="Fotos de referencia"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {photoCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-[9px] bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                            {photoCount}
                          </span>
                        )}
                      </button>

                      {/* Frecuencia */}
                      <button
                        type="button"
                        onClick={() => !step._temp && setFreqModal({ stepId: step.id, name: step.name, stepFrequency: step.stepFrequency, stepAnchorDayOfWeek: step.stepAnchorDayOfWeek, stepAnchorDayOfMonth: step.stepAnchorDayOfMonth, intervalDays: step.intervalDays, startDate: step.startDate, sectionId: section.id })}
                        className={`shrink-0 transition hover:opacity-80 ${hasFreq ? "text-amber-500" : "text-neutral-300"}`}
                        title={(() => {
                          if (!hasFreq) return "Sin frecuencia configurada";
                          const f = step.stepFrequency!;
                          const DOW_NAMES = ["domingos","lunes","martes","miércoles","jueves","viernes","sábados"];
                          if (f === "PER_CHECKOUT") return "Aparece en cada limpieza";
                          if (f === "WEEKLY") return step.stepAnchorDayOfWeek !== null ? `Se repite cada ${DOW_NAMES[step.stepAnchorDayOfWeek]}` : "Semanal ⚠ falta configuración";
                          if (f === "MONTHLY") return step.stepAnchorDayOfMonth !== null ? `Se repite el día ${step.stepAnchorDayOfMonth} de cada mes` : "Mensual ⚠ falta configuración";
                          if (f === "INTERVAL") return step.intervalDays && step.startDate ? `Se repite cada ${step.intervalDays} días` : "Cada N días ⚠ falta configuración";
                          return FREQ_LABELS[f] ?? f;
                        })()}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>

                      {/* Eliminar */}
                      <button
                        type="button"
                        onClick={() => !step._temp && handleDeleteStep(step.id, section.id)}
                        className="text-neutral-300 hover:text-red-500 transition p-0.5 shrink-0"
                        title="Eliminar tarea"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })}

                {/* Agregar tarea inline */}
                {!frequencyFilter && (
                  <div className="flex gap-2 px-4 py-2.5 bg-neutral-50">
                    <input
                      value={addStepTexts[section.id] ?? ""}
                      onChange={(e) => setAddStepTexts((prev) => ({ ...prev, [section.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddStep(section.id); } }}
                      placeholder="Nueva tarea…"
                      disabled={addingStep[section.id]}
                      className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddStep(section.id)}
                      disabled={addingStep[section.id] || !(addStepTexts[section.id] || "").trim()}
                      className="text-sm bg-neutral-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-neutral-800 transition whitespace-nowrap disabled:opacity-50"
                    >
                      {addingStep[section.id] ? "…" : "Agregar"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Agregar área */}
        {addSectionOpen ? (
          <div className="border rounded-xl overflow-hidden">
            <div className="flex gap-2 px-4 py-3">
              <input
                autoFocus
                value={addSectionName}
                onChange={(e) => setAddSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSection();
                  if (e.key === "Escape") { setAddSectionOpen(false); setAddSectionName(""); }
                }}
                placeholder="Nombre del área (ej: Cocina, Baño…)"
                className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-300"
              />
              <button
                type="button"
                onClick={handleAddSection}
                disabled={addingSectionLoading || !addSectionName.trim()}
                className="bg-neutral-900 text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-neutral-800 transition disabled:opacity-50 whitespace-nowrap"
              >
                {addingSectionLoading ? "…" : "Agregar"}
              </button>
              <button
                type="button"
                onClick={() => { setAddSectionOpen(false); setAddSectionName(""); }}
                className="text-neutral-400 hover:text-neutral-600 transition text-sm px-2"
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddSectionOpen(true)}
            className="w-full border border-dashed border-neutral-300 rounded-xl px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition text-left"
          >
            + Agregar área
          </button>
        )}
      </div>

      {/* Configuración del checklist (colapsable) */}
      <details className="border rounded-xl overflow-hidden">
        <summary className="px-4 py-3 text-sm font-medium text-neutral-700 cursor-pointer select-none hover:bg-neutral-50 transition list-none flex items-center justify-between">
          <span>Configuración del template</span>
          <span className="text-neutral-400 text-xs">▼</span>
        </summary>
        <div className="px-4 pb-4 pt-3 space-y-4 bg-neutral-50">
          {/* Nombre y descripción */}
          <form action={updateTaskTemplate} className="space-y-3">
            <input type="hidden" name="templateId" value={template.id} />
            <input type="hidden" name="status" value={template.status} />
            <div>
              <label className="block text-xs font-medium mb-1 text-neutral-500">Nombre</label>
              <input name="name" defaultValue={template.name} required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-neutral-500">
                Descripción <span className="font-normal text-neutral-400">(opcional)</span>
              </label>
              <textarea name="description" defaultValue={template.description ?? ""} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
            <button type="submit" className="bg-neutral-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 transition">
              Guardar
            </button>
          </form>

          {/* Frecuencia del template */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-neutral-500">Frecuencia del template completo</p>
            <p className="text-xs text-neutral-400">
              Define cómo se activa el template al ejecutarse en limpiezas.
              La periodicidad operativa (semanal, mensual) debe configurarse directamente en cada tarea.
            </p>

            {/* Advertencia legacy */}
            {LEGACY_PERIODIC_FREQS.includes(schedFreq as typeof LEGACY_PERIODIC_FREQS[number]) && (
              <div className="border border-amber-200 bg-amber-50 rounded-xl px-3 py-3 text-xs text-amber-800 space-y-1">
                <p className="font-medium">⚠ Configuración legacy detectada</p>
                <p>
                  Este template usa periodicidad a nivel de template ({FREQ_LABELS[schedFreq] ?? schedFreq}).
                  El modelo recomendado es configurar la frecuencia directamente en cada tarea.
                  Para migrar, selecciona <strong>Manual</strong> o <strong>Cada limpieza</strong> y guarda.
                </p>
              </div>
            )}

            {/* Selector de frecuencia */}
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_FREQ_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSchedFreq(value);
                    // TEMPLATE_FREQ_OPTIONS solo ofrece PER_CHECKOUT/MANUAL —
                    // al seleccionar cualquiera de los dos los anchors no aplican
                    setSchedDayOfWeek(null);
                    setSchedDayOfMonth(null);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    schedFreq === value
                      ? "bg-neutral-900 text-white"
                      : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Ancla WEEKLY — día de la semana */}
            {schedFreq === "WEEKLY" && (
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Día de la semana</label>
                <select
                  value={schedDayOfWeek ?? ""}
                  onChange={(e) =>
                    setSchedDayOfWeek(e.target.value === "" ? null : parseInt(e.target.value, 10))
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Selecciona el día…</option>
                  <option value="1">Lunes</option>
                  <option value="2">Martes</option>
                  <option value="3">Miércoles</option>
                  <option value="4">Jueves</option>
                  <option value="5">Viernes</option>
                  <option value="6">Sábado</option>
                  <option value="0">Domingo</option>
                </select>
              </div>
            )}

            {/* Ancla MONTHLY — día del mes */}
            {schedFreq === "MONTHLY" && (
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Día del mes</label>
                <select
                  value={schedDayOfMonth ?? ""}
                  onChange={(e) =>
                    setSchedDayOfMonth(e.target.value === "" ? null : parseInt(e.target.value, 10))
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Selecciona el día…</option>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <p className="text-xs text-neutral-400 mt-1">
                  Disponible del 1 al 28 para garantizar compatibilidad con todos los meses.
                </p>
              </div>
            )}

            {/* Timezone — opcional para frecuencias programadas */}
            {(schedFreq === "DAILY" || schedFreq === "WEEKLY" || schedFreq === "MONTHLY") && (
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">
                  Zona horaria <span className="font-normal text-neutral-400">(opcional — default UTC)</span>
                </label>
                <input
                  type="text"
                  value={schedTimezone}
                  onChange={(e) => setSchedTimezone(e.target.value)}
                  placeholder="ej. America/Mexico_City"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>
            )}

            {/* Descripción legible / advertencia de configuración incompleta */}
            {schedFreq !== "MANUAL" && schedFreq !== "PER_CHECKOUT" && (
              isScheduleComplete(schedFreq, schedDayOfWeek, schedDayOfMonth) ? (
                <p className="text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">
                  {scheduleHumanDescription(schedFreq, schedDayOfWeek, schedDayOfMonth)}
                </p>
              ) : (
                <p className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-2 rounded-lg font-medium">
                  ⚠ Este template no generará jobs automáticos hasta completar la programación.
                </p>
              )
            )}

            <button
              type="button"
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              className="bg-neutral-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 transition disabled:opacity-50"
            >
              {savingSchedule ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </div>
      </details>

      {/* Acciones secundarias */}
      <div className="flex flex-wrap gap-2">
        {tenantProperties.length > 1 && (
          <button
            type="button"
            onClick={() => setCopyModalOpen(true)}
            className="text-sm text-neutral-700 bg-white border border-neutral-200 px-4 py-2 rounded-lg font-medium hover:bg-neutral-50 transition"
          >
            Copiar a otra propiedad
          </button>
        )}
        <button
          type="button"
          onClick={() => setDeleteMenuOpen(true)}
          className="text-sm text-white hover:text-neutral-200 bg-neutral-900 border border-neutral-900 px-4 py-2 rounded-lg font-medium transition"
        >
          − Eliminar checklist
        </button>
      </div>

      {/* ---- Modals ---- */}

      {/* Capture modal */}
      {captureModal && (
        <StepCaptureModal
          isOpen
          stepId={captureModal.stepId}
          stepName={captureModal.name}
          currentCaptures={captureModal.captures}
          onClose={() => setCaptureModal(null)}
          onUpdate={(newCaptures) => {
            handleCaptureUpdate(captureModal.stepId, captureModal.sectionId, newCaptures as any);
            setCaptureModal(null);
          }}
        />
      )}

      {/* Frequency modal */}
      {freqModal && (
        <StepFrequencyModal
          isOpen
          stepId={freqModal.stepId}
          stepName={freqModal.name}
          currentFrequency={freqModal.stepFrequency}
          currentAnchorDayOfWeek={freqModal.stepAnchorDayOfWeek}
          currentAnchorDayOfMonth={freqModal.stepAnchorDayOfMonth}
          currentIntervalDays={freqModal.intervalDays}
          currentStartDate={freqModal.startDate}
          onClose={() => setFreqModal(null)}
          onUpdate={(newFreq, dow, dom, intDays, startDate) => {
            handleFreqUpdate(freqModal.stepId, freqModal.sectionId, newFreq, dow, dom, intDays, startDate);
            setFreqModal(null);
          }}
        />
      )}

      {/* Photos modal */}
      {photosModal && (
        <TaskStepPhotosModal
          isOpen
          stepId={photosModal.stepId}
          stepName={photosModal.name}
          onClose={() => setPhotosModal(null)}
          onThumbsChange={(thumbs) => handleThumbsChange(photosModal.stepId, thumbs)}
        />
      )}

      {/* Delete section confirm */}
      <ConfirmModal
        isOpen={deleteSectionConfirm !== null}
        onClose={() => setDeleteSectionConfirm(null)}
        title="¿Eliminar área?"
        message={`¿Seguro que deseas eliminar "${deleteSectionConfirm?.name}" y todas sus tareas?`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmAction={() => deleteSectionConfirm && handleDeleteSection(deleteSectionConfirm)}
        variant="danger"
      />

      {/* Copy to property modal */}
      <CopyToPropertyModal
        isOpen={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        sourceTemplateId={template.id}
        sourceName={template.name}
        currentPropertyId={template.propertyId}
        properties={tenantProperties}
      />

      {/* Delete / Archive menu modal */}
      {deleteMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setDeleteMenuOpen(false); setDeleteConfirm(false); }} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-neutral-900">Eliminar checklist</h2>

            {deleteConfirm ? (
              /* Paso 2 — confirmación final */
              <div className="space-y-4">
                <div className="border border-red-200 rounded-xl p-4 bg-red-50">
                  <p className="text-sm font-medium text-red-800">¿Estás seguro?</p>
                  <p className="text-xs text-red-700 mt-1">
                    {template._count.jobs > 0
                      ? "El checklist desaparecerá de tu lista. El historial de ejecuciones se conservará internamente."
                      : "Se eliminará el checklist con todas sus áreas y tareas. Esta acción no se puede deshacer."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setDeleteMenuOpen(false);
                    setDeleteConfirm(false);
                    const formData = new FormData();
                    formData.append("templateId", template.id);
                    await deleteTaskTemplate(formData);
                  }}
                  className="w-full text-sm text-white bg-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition"
                >
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="w-full text-sm text-neutral-500 hover:text-neutral-700 transition py-1"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              /* Paso 1 — opciones */
              <>
                {/* Archivar */}
                {template.status !== "INACTIVE" && (
                  <div className="border border-neutral-200 rounded-xl p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-800">Archivar</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        El checklist se desactiva y deja de generar tareas, pero conservas el historial y puedes reactivarlo cuando quieras.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setDeleteMenuOpen(false);
                        setDeleteConfirm(false);
                        const formData = new FormData();
                        formData.append("templateId", template.id);
                        await archiveTaskTemplate(formData);
                      }}
                      className="w-full text-sm text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg font-medium hover:bg-amber-100 transition"
                    >
                      Archivar checklist
                    </button>
                  </div>
                )}

                {/* Eliminar */}
                <div className="border border-red-100 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-800">Eliminar</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {template._count.jobs > 0
                        ? `Este checklist tiene ${template._count.jobs} ejecución${template._count.jobs === 1 ? "" : "es"} registrada${template._count.jobs === 1 ? "" : "s"}. Desaparecerá de tu lista, pero el historial se conservará internamente.`
                        : "Se eliminan el checklist, todas sus áreas y tareas. Esta acción no se puede deshacer."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="w-full text-sm text-white bg-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition"
                  >
                    Eliminar checklist
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => { setDeleteMenuOpen(false); setDeleteConfirm(false); }}
                  className="w-full text-sm text-neutral-500 hover:text-neutral-700 transition py-1"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>

      {/* Modal edición de nombre de tarea — portal para escapar cualquier transform de ancestros */}
      {editStepModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditStepModal(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]">
            <div className="px-6 py-4 border-b shrink-0 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">Editar tarea</h2>
              <button
                type="button"
                onClick={() => setEditStepModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition p-1 -mr-1"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <textarea
                value={editStepNameValue}
                onChange={(e) => setEditStepNameValue(e.target.value)}
                rows={4}
                autoFocus
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:border-neutral-400"
                placeholder="Nombre de la tarea"
              />
              <div className="flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={() => setEditStepModal(null)}
                  className="flex-1 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleEditStepName(editStepModal.stepId, editStepModal.sectionId, editStepNameValue)}
                  disabled={!editStepNameValue.trim() || editStepNameValue.trim() === editStepModal.name}
                  className="flex-1 bg-neutral-900 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-neutral-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
