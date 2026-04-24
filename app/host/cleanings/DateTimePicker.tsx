"use client";

import { useState, useEffect, useRef } from "react";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const WEEKDAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type Step = "date" | "hour" | "minute";

interface DateTimePickerProps {
  value: string; // "YYYY-MM-DDTHH:mm"
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

interface Parsed {
  year: number;
  month: number; // 0-indexed
  day: number;
  hours: number;
  minutes: number;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function parseValue(value: string): Parsed {
  const now = new Date();
  const defaults: Parsed = {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
    hours: 9,
    minutes: 0,
  };
  if (!value) return defaults;
  const [datePart = "", timePart = ""] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  return {
    year: y || defaults.year,
    month: m ? m - 1 : defaults.month,
    day: d || defaults.day,
    hours: !isNaN(h) ? h : defaults.hours,
    minutes: !isNaN(min) ? min : defaults.minutes,
  };
}

function formatDisplay(value: string): string {
  if (!value) return "";
  const { year, month, day, hours, minutes } = parseValue(value);
  const dateStr = `${day} ${MONTHS_SHORT[month]} ${year}`;
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return `${dateStr}, ${timeStr}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

function buildDateTimeString(
  year: number, month: number, day: number,
  hours: number, minutes: number
): string {
  return (
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` +
    `T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  );
}

// ──────────────────────────────────────────────
// Clock face (SVG, hour + minute)
// ──────────────────────────────────────────────

const CLOCK_SIZE = 240;
const CX = CLOCK_SIZE / 2;
const CY = CLOCK_SIZE / 2;
const OUTER_R = 90;  // hours 1–12
const INNER_R = 60;  // hours 0, 13–23
const MINUTE_R = 90; // minutes

function polarToXY(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

interface ClockFaceProps {
  step: "hour" | "minute";
  hours: number;
  minutes: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onConfirmHour: (h: number) => void;
  onConfirmMinute: (m: number) => void;
}

function ClockFace({
  step, hours, minutes,
  onHourChange, onMinuteChange,
  onConfirmHour, onConfirmMinute,
}: ClockFaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pressing = useRef(false);

  function pickValue(clientX: number, clientY: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / CLOCK_SIZE;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy) / scale;
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    if (step === "hour") {
      const raw = Math.round(angle / 30) % 12;
      const threshold = (OUTER_R + INNER_R) / 2;
      if (dist >= threshold) {
        return raw === 0 ? 12 : raw;        // outer: 1–12
      } else {
        return raw === 0 ? 0 : raw + 12;    // inner: 0, 13–23
      }
    } else {
      return Math.round(angle / 6) % 60;   // minutes 0–59
    }
  }

  // Mouse
  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    pressing.current = true;
    const v = pickValue(e.clientX, e.clientY);
    if (v === null) return;
    step === "hour" ? onHourChange(v) : onMinuteChange(v);
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pressing.current) return;
    const v = pickValue(e.clientX, e.clientY);
    if (v === null) return;
    step === "hour" ? onHourChange(v) : onMinuteChange(v);
  };
  const onMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pressing.current) return;
    pressing.current = false;
    const v = pickValue(e.clientX, e.clientY);
    if (v === null) return;
    step === "hour" ? onConfirmHour(v) : onConfirmMinute(v);
  };

  // Touch
  const onTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    pressing.current = true;
    const t = e.touches[0];
    const v = pickValue(t.clientX, t.clientY);
    if (v === null) return;
    step === "hour" ? onHourChange(v) : onMinuteChange(v);
  };
  const onTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!pressing.current) return;
    const t = e.touches[0];
    const v = pickValue(t.clientX, t.clientY);
    if (v === null) return;
    step === "hour" ? onHourChange(v) : onMinuteChange(v);
  };
  const onTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    pressing.current = false;
    const t = e.changedTouches[0];
    const v = pickValue(t.clientX, t.clientY);
    if (v === null) return;
    step === "hour" ? onConfirmHour(v) : onConfirmMinute(v);
  };

  // Hand
  const handAngle = step === "hour" ? (hours % 12) * 30 : minutes * 6;
  const isInnerHour = step === "hour" && (hours === 0 || hours >= 13);
  const handR = step === "hour" ? (isInnerHour ? INNER_R : OUTER_R) : MINUTE_R;
  const handEnd = polarToXY(handAngle, handR);

  // Hour rings
  const outerHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const innerHours = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  // Minute labels every 5 min
  const minuteLabels = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
      className="w-full max-w-[220px] cursor-pointer touch-none select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { pressing.current = false; }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Face */}
      <circle cx={CX} cy={CY} r={106} fill="#f4f4f5" />

      {/* Hand */}
      <line
        x1={CX} y1={CY} x2={handEnd.x} y2={handEnd.y}
        stroke="#000" strokeWidth={2} strokeLinecap="round"
      />
      <circle cx={handEnd.x} cy={handEnd.y} r={12} fill="#000" />
      <circle cx={CX} cy={CY} r={5} fill="#000" />

      {step === "hour" ? (
        <>
          {/* Outer ring: 1–12 */}
          {outerHours.map((h, i) => {
            const pos = polarToXY(i * 30, OUTER_R);
            const sel = hours === h;
            return (
              <g key={`oh-${h}`}>
                {sel && <circle cx={pos.x} cy={pos.y} r={16} fill="#000" />}
                <text
                  x={pos.x} y={pos.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="14" fontWeight={sel ? "700" : "400"}
                  fill={sel ? "#fff" : "#1a1a1a"}
                  className="pointer-events-none"
                >
                  {h}
                </text>
              </g>
            );
          })}
          {/* Inner ring: 0, 13–23 */}
          {innerHours.map((h, i) => {
            const pos = polarToXY(i * 30, INNER_R);
            const sel = hours === h;
            return (
              <g key={`ih-${h}`}>
                {sel && <circle cx={pos.x} cy={pos.y} r={13} fill="#000" />}
                <text
                  x={pos.x} y={pos.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="9" fontWeight={sel ? "700" : "400"}
                  fill={sel ? "#fff" : "#666"}
                  className="pointer-events-none"
                >
                  {String(h).padStart(2, "0")}
                </text>
              </g>
            );
          })}
        </>
      ) : (
        <>
          {/* Minute tick marks (every minute, skip labeled) */}
          {Array.from({ length: 60 }, (_, i) => {
            if (i % 5 === 0) return null;
            const inner = polarToXY(i * 6, MINUTE_R - 5);
            const outer = polarToXY(i * 6, MINUTE_R + 2);
            return (
              <line
                key={`tick-${i}`}
                x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                stroke={minutes === i ? "#000" : "#ccc"}
                strokeWidth={minutes === i ? 2.5 : 1.5}
                className="pointer-events-none"
              />
            );
          })}
          {/* Minute labels every 5 min */}
          {minuteLabels.map((m, i) => {
            const pos = polarToXY(i * 30, MINUTE_R);
            const sel = minutes === m;
            return (
              <g key={`ml-${m}`}>
                {sel && <circle cx={pos.x} cy={pos.y} r={14} fill="#000" />}
                <text
                  x={pos.x} y={pos.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="11" fontWeight={sel ? "700" : "400"}
                  fill={sel ? "#fff" : "#1a1a1a"}
                  className="pointer-events-none"
                >
                  {String(m).padStart(2, "0")}
                </text>
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}

// ──────────────────────────────────────────────
// Monthly calendar
// ──────────────────────────────────────────────

interface CalendarProps {
  viewYear: number;
  viewMonth: number;
  selYear: number;
  selMonth: number;
  selDay: number;
  onSelect: (year: number, month: number, day: number) => void;
  onNavigate: (year: number, month: number) => void;
}

function Calendar({
  viewYear, viewMonth,
  selYear, selMonth, selDay,
  onSelect, onNavigate,
}: CalendarProps) {
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const today = new Date();

  function navigate(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    onNavigate(y, m);
  }

  // Build grid cells (null = empty leading cell)
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="w-full">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Mes anterior"
          className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-neutral-900">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={() => navigate(1)}
          aria-label="Mes siguiente"
          className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-[11px] font-medium text-neutral-400 pb-1.5">
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} />;
          const isToday =
            viewYear === today.getFullYear() &&
            viewMonth === today.getMonth() &&
            d === today.getDate();
          const isSelected =
            viewYear === selYear &&
            viewMonth === selMonth &&
            d === selDay;
          return (
            <button
              key={`d-${d}`}
              type="button"
              onClick={() => onSelect(viewYear, viewMonth, d)}
              className={[
                "aspect-square flex items-center justify-center rounded-full text-sm transition active:scale-95",
                isSelected
                  ? "bg-black text-white font-semibold"
                  : isToday
                  ? "ring-1 ring-neutral-300 text-neutral-900 font-medium hover:bg-neutral-100"
                  : "text-neutral-800 hover:bg-neutral-100",
              ].join(" ")}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// DateTimePicker — main component
// ──────────────────────────────────────────────

export default function DateTimePicker({
  value,
  onChange,
  className = "",
  required = false,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("date");

  // Calendar view (navigation can differ from selection)
  const [viewYear, setViewYear] = useState(() => parseValue(value).year);
  const [viewMonth, setViewMonth] = useState(() => parseValue(value).month);

  // Selection
  const [selYear, setSelYear] = useState(() => parseValue(value).year);
  const [selMonth, setSelMonth] = useState(() => parseValue(value).month);
  const [selDay, setSelDay] = useState(() => parseValue(value).day);
  const [hours, setHours] = useState(() => parseValue(value).hours);
  const [minutes, setMinutes] = useState(() => parseValue(value).minutes);

  // Sync when external value changes
  useEffect(() => {
    const p = parseValue(value);
    setViewYear(p.year);
    setViewMonth(p.month);
    setSelYear(p.year);
    setSelMonth(p.month);
    setSelDay(p.day);
    setHours(p.hours);
    setMinutes(p.minutes);
  }, [value]);

  function openPicker() {
    const p = parseValue(value);
    setViewYear(p.year);
    setViewMonth(p.month);
    setSelYear(p.year);
    setSelMonth(p.month);
    setSelDay(p.day);
    setHours(p.hours);
    setMinutes(p.minutes);
    setStep("date");
    setIsOpen(true);
  }

  function cancelAndClose() {
    // Restore to last confirmed value
    const p = parseValue(value);
    setSelYear(p.year);
    setSelMonth(p.month);
    setSelDay(p.day);
    setHours(p.hours);
    setMinutes(p.minutes);
    setIsOpen(false);
  }

  // Step: date → auto-advance to hour on day tap
  function handleDaySelect(y: number, m: number, d: number) {
    setSelYear(y);
    setSelMonth(m);
    setSelDay(d);
    setStep("hour");
  }

  // Step: hour → auto-advance to minute on clock release
  function handleConfirmHour(h: number) {
    setHours(h);
    setStep("minute");
  }

  // Step: minute → auto-confirm on clock release (or via Establecer button)
  function handleConfirmMinute(m: number) {
    const result = buildDateTimeString(selYear, selMonth, selDay, hours, m);
    onChange(result);
    setIsOpen(false);
  }

  // "Establecer" button when minute is already chosen
  function handleConfirmButton() {
    const result = buildDateTimeString(selYear, selMonth, selDay, hours, minutes);
    onChange(result);
    setIsOpen(false);
  }

  function handleBack() {
    if (step === "hour") setStep("date");
    if (step === "minute") setStep("hour");
  }

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelAndClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  function formatSelectedDateChip() {
    const d = new Date(selYear, selMonth, selDay);
    return d.toLocaleDateString("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  const stepTitle: Record<Step, string> = {
    date: "Seleccionar fecha",
    hour: "Seleccionar hora",
    minute: "Seleccionar minutos",
  };

  return (
    <>
      <input
        type="text"
        value={formatDisplay(value)}
        onClick={openPicker}
        readOnly
        required={required}
        className={`w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 cursor-pointer bg-white ${className}`}
        placeholder="Selecciona fecha y hora"
      />

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={cancelAndClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-neutral-200 bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-neutral-100 flex items-center gap-2">
              {step !== "date" && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Volver"
                  className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <h3
                className={`text-sm font-semibold text-neutral-900 ${
                  step === "date" ? "w-full text-center" : "flex-1 text-center"
                }`}
                style={step !== "date" ? { paddingRight: "28px" } : undefined}
              >
                {stepTitle[step]}
              </h3>
            </div>

            {/* Body */}
            <div className="px-4 py-5">
              {step === "date" && (
                <Calendar
                  viewYear={viewYear}
                  viewMonth={viewMonth}
                  selYear={selYear}
                  selMonth={selMonth}
                  selDay={selDay}
                  onSelect={handleDaySelect}
                  onNavigate={(y, m) => { setViewYear(y); setViewMonth(m); }}
                />
              )}

              {(step === "hour" || step === "minute") && (
                <div className="flex flex-col items-center gap-4">
                  {/* Selected date chip */}
                  <p className="text-xs font-medium text-neutral-500 capitalize">
                    {formatSelectedDateChip()}
                  </p>

                  {/* HH : MM display — tap to switch segment */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStep("hour")}
                      className={[
                        "min-w-[60px] text-center text-3xl font-bold px-3 py-1.5 rounded-xl transition",
                        step === "hour"
                          ? "bg-black text-white"
                          : "text-neutral-800 hover:bg-neutral-100",
                      ].join(" ")}
                    >
                      {String(hours).padStart(2, "0")}
                    </button>
                    <span className="text-3xl font-bold text-neutral-300">:</span>
                    <button
                      type="button"
                      onClick={() => setStep("minute")}
                      className={[
                        "min-w-[60px] text-center text-3xl font-bold px-3 py-1.5 rounded-xl transition",
                        step === "minute"
                          ? "bg-black text-white"
                          : "text-neutral-800 hover:bg-neutral-100",
                      ].join(" ")}
                    >
                      {String(minutes).padStart(2, "0")}
                    </button>
                  </div>

                  {/* Circular clock */}
                  <ClockFace
                    step={step}
                    hours={hours}
                    minutes={minutes}
                    onHourChange={setHours}
                    onMinuteChange={setMinutes}
                    onConfirmHour={handleConfirmHour}
                    onConfirmMinute={handleConfirmMinute}
                  />

                  <p className="text-[11px] text-neutral-400">
                    {step === "hour"
                      ? "Arrastra para seleccionar la hora"
                      : "Arrastra para seleccionar los minutos"}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-neutral-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={cancelAndClose}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition"
              >
                Cancelar
              </button>

              {step === "date" && (
                <button
                  type="button"
                  onClick={() => setStep("hour")}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-neutral-800 transition active:scale-[0.98]"
                >
                  Siguiente
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {step === "hour" && (
                <button
                  type="button"
                  onClick={() => setStep("minute")}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-neutral-800 transition active:scale-[0.98]"
                >
                  Siguiente
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {step === "minute" && (
                <button
                  type="button"
                  onClick={handleConfirmButton}
                  className="px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-neutral-800 transition active:scale-[0.98]"
                >
                  Establecer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
