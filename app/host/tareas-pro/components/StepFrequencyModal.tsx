"use client";

import { useState, useMemo } from "react";
import { updateTaskStepFrequency } from "../actions";

// ── Constantes ────────────────────────────────────────────────────────────────

type FreqMode = "PER_CHECKOUT" | "WEEKLY" | "MONTHLY" | "INTERVAL" | "";

const MODES: Array<{ value: FreqMode; label: string; desc: string }> = [
  { value: "PER_CHECKOUT", label: "En cada limpieza", desc: "Aparecerá en todas las limpiezas del alojamiento." },
  { value: "WEEKLY",       label: "Cada semana",      desc: "Se volverá pendiente una vez a la semana." },
  { value: "MONTHLY",      label: "Cada mes",         desc: "Se volverá pendiente una vez al mes." },
  { value: "INTERVAL",     label: "Cada X días",      desc: "Se repetirá cada cierto número de días." },
];

// Orden lun→dom con valor JS (dom = 0)
const DOW_COLS = [
  { label: "Lu", value: 1, long: "lunes" },
  { label: "Ma", value: 2, long: "martes" },
  { label: "Mi", value: 3, long: "miércoles" },
  { label: "Ju", value: 4, long: "jueves" },
  { label: "Vi", value: 5, long: "viernes" },
  { label: "Sá", value: 6, long: "sábados" },
  { label: "Do", value: 0, long: "domingos" },
];

const MONTH_NAMES = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCalendarCells(year: number, month: number): Array<number | null> {
  const firstDow    = new Date(year, month, 1).getDay();
  const offset      = (firstDow + 6) % 7; // lun-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  stepId: string;
  stepName: string;
  currentFrequency: string | null;
  currentAnchorDayOfWeek: number | null;
  currentAnchorDayOfMonth: number | null;
  currentIntervalDays: number | null;
  currentStartDate: string | null; // ISO string
  onClose: () => void;
  onUpdate: (
    newFreq: string | null,
    anchorDayOfWeek: number | null,
    anchorDayOfMonth: number | null,
    intervalDays: number | null,
    startDate: string | null,
  ) => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function StepFrequencyModal({
  isOpen,
  stepId,
  stepName,
  currentFrequency,
  currentAnchorDayOfWeek,
  currentAnchorDayOfMonth,
  currentIntervalDays,
  currentStartDate,
  onClose,
  onUpdate,
}: Props) {
  // ── Fecha inicial ─────────────────────────────────────────────────────────────
  // Si hay startDate guardada → abrir en ese mes y pre-seleccionar ese día.
  // Si no → abrir en el mes actual sin selección.
  const initFromStartDate = useMemo(() => {
    if (currentStartDate) {
      const d = new Date(currentStartDate);
      return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    }
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayRef = useMemo(() => new Date(), []);

  // ── Estado del modo ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<FreqMode>((currentFrequency ?? "") as FreqMode);

  // ── Estado del calendario visible (navegable) ────────────────────────────────
  const [visibleYear,  setVisibleYear]  = useState<number>(
    initFromStartDate?.year  ?? todayRef.getFullYear()
  );
  const [visibleMonth, setVisibleMonth] = useState<number>(
    initFromStartDate?.month ?? todayRef.getMonth()
  );

  // ── Fecha seleccionada (año + mes + día completo) ────────────────────────────
  const [selYear,  setSelYear]  = useState<number | null>(initFromStartDate?.year  ?? null);
  const [selMonth, setSelMonth] = useState<number | null>(initFromStartDate?.month ?? null);
  const [selDay,   setSelDay]   = useState<number | null>(initFromStartDate?.day   ?? null);

  const [intervalDays, setIntervalDays] = useState<number | null>(currentIntervalDays);
  const [saving,       setSaving]       = useState(false);

  if (!isOpen) return null;

  // ── Navegación de mes ────────────────────────────────────────────────────────
  const goPrevMonth = () => {
    if (visibleMonth === 0) { setVisibleYear((y) => y - 1); setVisibleMonth(11); }
    else setVisibleMonth((m) => m - 1);
  };
  const goNextMonth = () => {
    if (visibleMonth === 11) { setVisibleYear((y) => y + 1); setVisibleMonth(0); }
    else setVisibleMonth((m) => m + 1);
  };

  // ── Celdas del calendario visible ────────────────────────────────────────────
  const calendarCells = buildCalendarCells(visibleYear, visibleMonth);
  const visibleMonthLabel = `${MONTH_NAMES[visibleMonth]} ${visibleYear}`;

  // ── Selección de un día ──────────────────────────────────────────────────────
  const selectDay = (day: number) => {
    setSelYear(visibleYear);
    setSelMonth(visibleMonth);
    setSelDay(day);
  };

  const hasSelection = selYear !== null && selMonth !== null && selDay !== null;

  // ── Derivar DOW desde la fecha seleccionada ──────────────────────────────────
  const derivedDow = hasSelection
    ? new Date(selYear!, selMonth!, selDay!).getDay()
    : null;
  const derivedDowLabel = derivedDow !== null
    ? DOW_COLS.find((d) => d.value === derivedDow)?.long ?? null
    : null;

  // ── Validación ───────────────────────────────────────────────────────────────
  const needsDate  = mode === "WEEKLY" || mode === "MONTHLY" || mode === "INTERVAL";
  const isComplete =
    mode === "" ? false :
    mode === "PER_CHECKOUT" ? true :
    needsDate && !hasSelection ? false :
    mode === "INTERVAL" && (!intervalDays || intervalDays < 1) ? false :
    true;

  // ── Resumen legible ──────────────────────────────────────────────────────────
  const summary = (() => {
    if (mode === "PER_CHECKOUT") return "Aparecerá en todas las limpiezas del alojamiento.";
    if (!hasSelection) return null;

    const dayNum   = selDay!;
    const monthStr = MONTH_NAMES[selMonth!];
    const yearNum  = selYear!;

    if (mode === "WEEKLY" && derivedDowLabel)
      return `Se volverá pendiente cada ${derivedDowLabel} a partir del ${dayNum} de ${monthStr} de ${yearNum}.`;

    if (mode === "MONTHLY") {
      const base = `Se volverá pendiente el día ${dayNum} de cada mes a partir de ${monthStr} de ${yearNum}.`;
      const note = dayNum >= 29 ? " Si ese día no existe, se usará el último día del mes." : "";
      return base + note;
    }

    if (mode === "INTERVAL" && intervalDays && intervalDays > 0)
      return `Se volverá pendiente cada ${intervalDays} días a partir del ${dayNum} de ${monthStr} de ${yearNum}.`;

    return null;
  })();

  // ── Guardar ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isComplete) return;
    const newFreq  = mode === "" ? null : mode;
    const newDow   = mode === "WEEKLY"   ? derivedDow   : null;
    const newDom   = mode === "MONTHLY"  ? selDay       : null;
    const newInt   = mode === "INTERVAL" ? intervalDays : null;
    const newStart = needsDate && hasSelection
      ? new Date(selYear!, selMonth!, selDay!).toISOString()
      : null;

    if (
      newFreq  === currentFrequency        &&
      newDow   === currentAnchorDayOfWeek  &&
      newDom   === currentAnchorDayOfMonth &&
      newInt   === currentIntervalDays     &&
      newStart === currentStartDate
    ) { onClose(); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("stepId",        stepId);
      fd.append("stepFrequency", mode);
      if (newDow   !== null) fd.append("stepAnchorDayOfWeek",  String(newDow));
      if (newDom   !== null) fd.append("stepAnchorDayOfMonth", String(newDom));
      if (newInt   !== null) fd.append("intervalDays",         String(newInt));
      if (newStart !== null) fd.append("startDate",            newStart);
      await updateTaskStepFrequency(fd);
      onUpdate(newFreq, newDow, newDom, newInt, newStart);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b">
          <p className="text-xs text-neutral-500">¿Cuándo se vuelve exigible esta tarea?</p>
          <p className="font-semibold text-neutral-900 truncate">{stepName}</p>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">

          {/* ── Selector de modo ────────────────────────────────────────── */}
          <div className="p-3 space-y-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  if (m.value !== mode) {
                    setMode(m.value);
                    setSelYear(null);
                    setSelMonth(null);
                    setSelDay(null);
                    setIntervalDays(null);
                  }
                }}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                  mode === m.value
                    ? "bg-neutral-900 text-white"
                    : "hover:bg-neutral-50 text-neutral-800"
                }`}
              >
                <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  mode === m.value ? "border-white" : "border-neutral-400"
                }`}>
                  {mode === m.value && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className={`text-xs ${mode === m.value ? "text-neutral-300" : "text-neutral-400"}`}>
                    {m.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* ── Calendario navegable (WEEKLY / MONTHLY / INTERVAL) ────────── */}
          {needsDate && (
            <div className="px-4 pb-1">
              <div className="border-t pt-3">

                {/* Título + controles de navegación */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-neutral-700">Elige una fecha de inicio</p>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={goPrevMonth}
                      aria-label="Mes anterior"
                      className="p-1 rounded-lg hover:bg-neutral-100 transition text-neutral-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6"/>
                      </svg>
                    </button>
                    <span className="text-xs text-neutral-700 font-medium capitalize w-32 text-center select-none">
                      {visibleMonthLabel}
                    </span>
                    <button
                      type="button"
                      onClick={goNextMonth}
                      aria-label="Mes siguiente"
                      className="p-1 rounded-lg hover:bg-neutral-100 transition text-neutral-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-400 mb-2">
                  Esta fecha define cuándo inicia la tarea y cómo se repite.
                </p>

                {/* Cabecera días */}
                <div className="grid grid-cols-7 gap-px mb-0.5">
                  {DOW_COLS.map((d) => (
                    <p key={d.value} className="text-center text-[10px] font-medium text-neutral-400 py-0.5">
                      {d.label}
                    </p>
                  ))}
                </div>

                {/* Rejilla */}
                <div className="grid grid-cols-7 gap-px">
                  {calendarCells.map((day, idx) => {
                    if (day === null) return <span key={`e-${idx}`} />;
                    const isSelected =
                      hasSelection &&
                      selDay === day &&
                      selMonth === visibleMonth &&
                      selYear === visibleYear;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => selectDay(day)}
                        className={`rounded-lg py-1.5 text-xs font-medium transition ${
                          isSelected
                            ? "bg-neutral-900 text-white"
                            : "hover:bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {/* Indicador de fecha seleccionada cuando el usuario navega a otro mes */}
                {hasSelection && (selMonth !== visibleMonth || selYear !== visibleYear) && (
                  <p className="text-[11px] text-blue-600 mt-2 pb-1">
                    Fecha elegida: {selDay} de {MONTH_NAMES[selMonth!]} de {selYear}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Input intervalo (solo INTERVAL) ─────────────────────────── */}
          {mode === "INTERVAL" && (
            <div className="px-4 pb-3 pt-3 space-y-1.5 border-t">
              <p className="text-xs font-medium text-neutral-700">¿Cada cuántos días?</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500">Repetir cada</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={intervalDays ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setIntervalDays(isNaN(v) || v < 1 ? null : v);
                  }}
                  placeholder="15"
                  className="w-20 border border-neutral-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
                <span className="text-sm text-neutral-500">días</span>
              </div>
              {(!intervalDays || intervalDays < 1) && (
                <p className="text-xs text-amber-600">Ingresa un número mayor a 0.</p>
              )}
            </div>
          )}

          {/* ── Resumen ─────────────────────────────────────────────────── */}
          {summary ? (
            <div className="px-4 pb-3 pt-2">
              <p className="text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">{summary}</p>
            </div>
          ) : mode !== "" && mode !== "PER_CHECKOUT" && (
            <div className="px-4 pb-3 pt-2">
              <p className="text-xs text-amber-600">
                {!hasSelection ? "Selecciona un día en el calendario." :
                 mode === "INTERVAL" ? "Ingresa cada cuántos días se repite." : ""}
              </p>
            </div>
          )}

        </div>

        {/* ── Acciones ─────────────────────────────────────────────────── */}
        <div className="flex gap-2 px-4 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-neutral-200 rounded-xl py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isComplete}
            className="flex-1 bg-neutral-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-neutral-800 transition disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
