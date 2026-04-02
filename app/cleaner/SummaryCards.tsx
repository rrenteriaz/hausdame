"use client";

import Link from "next/link";

interface SummaryCardsProps {
  myCount: number;
  availableCount: number;
  inProgressCount: number;
  memberId?: string;
  returnTo?: string;
}

export default function SummaryCards({
  myCount,
  availableCount,
  inProgressCount,
  memberId,
  returnTo,
}: SummaryCardsProps) {
  const safeReturnTo =
    returnTo && returnTo.startsWith("/cleaner")
      ? returnTo
      : memberId
      ? `/cleaner?memberId=${encodeURIComponent(memberId)}`
      : "/cleaner";

  const availableParams = new URLSearchParams();
  if (memberId) availableParams.set("memberId", memberId);
  availableParams.set("returnTo", safeReturnTo);
  const availableHref = `/cleaner/cleanings/available?${availableParams.toString()}`;

  const myParams = new URLSearchParams();
  if (memberId) myParams.set("memberId", memberId);
  myParams.set("scope", "all"); // "all" muestra asignadas a mí (scope="assigned" con includeCompleted=true)
  myParams.set("returnTo", safeReturnTo);
  const myHref = `/cleaner/cleanings/all?${myParams.toString()}`;

  const inProgressParams = new URLSearchParams();
  if (memberId) inProgressParams.set("memberId", memberId);
  inProgressParams.set("scope", "all");
  inProgressParams.set("status", "IN_PROGRESS");
  inProgressParams.set("returnTo", safeReturnTo);
  const inProgressHref = `/cleaner/cleanings/all?${inProgressParams.toString()}`;

  return (
    <section className="grid grid-cols-3 gap-3 pt-3">
      {/* Mis limpiezas — azul */}
      <Link
        href={myHref}
        className="rounded-xl border border-blue-200 bg-blue-50 p-3 pt-4 sm:pt-5 text-left hover:bg-blue-100 hover:border-blue-300 active:scale-[0.98] transition-all cursor-pointer"
      >
        <p className="text-[10px] sm:text-xs text-blue-600 font-medium mb-1">Mis limpiezas</p>
        <p className="text-2xl font-semibold text-blue-900">{myCount}</p>
        <p className="text-[9px] sm:text-[10px] text-blue-400 mt-0.5">Asignadas a mí</p>
      </Link>

      {/* Disponibles — verde */}
      <Link
        href={availableHref}
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left hover:bg-emerald-100 hover:border-emerald-300 active:scale-[0.98] transition-all cursor-pointer"
      >
        <p className="text-[10px] sm:text-xs text-emerald-600 font-medium mb-1">Disponibles</p>
        <p className="text-2xl font-semibold text-emerald-900">{availableCount}</p>
        <p className="text-[9px] sm:text-[10px] text-emerald-400 mt-0.5">Reclamables</p>
      </Link>

      {/* En progreso — azul fuerte */}
      <Link
        href={inProgressHref}
        className="rounded-xl border border-blue-300 bg-blue-100 p-3 text-left hover:bg-blue-200 hover:border-blue-400 active:scale-[0.98] transition-all cursor-pointer"
      >
        <p className="text-[10px] sm:text-xs text-blue-700 font-medium mb-1">En progreso</p>
        <p className="text-2xl font-semibold text-blue-900">{inProgressCount}</p>
        <p className="text-[9px] sm:text-[10px] text-blue-500 mt-0.5">Activas ahora</p>
      </Link>
    </section>
  );
}

