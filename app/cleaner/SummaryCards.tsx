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
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
      {/* Mis limpiezas */}
      <Link
        href={myHref}
        className="rounded-xl border border-neutral-200 bg-white p-3 pt-4 sm:pt-5 text-left hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.98] transition-all cursor-pointer"
      >
        <p className="text-xs text-neutral-500 mb-1">Mis limpiezas</p>
        <p className="text-2xl font-semibold text-neutral-900">{myCount}</p>
        <p className="text-[10px] text-neutral-400 mt-0.5">Asignadas a mí</p>
      </Link>

      {/* Disponibles */}
      <Link
        href={availableHref}
        className="rounded-xl border border-neutral-200 bg-white p-3 text-left hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.98] transition-all cursor-pointer"
      >
        <p className="text-xs text-neutral-500 mb-1">Disponibles</p>
        <p className="text-2xl font-semibold text-neutral-900">{availableCount}</p>
        <p className="text-[10px] text-neutral-400 mt-0.5">Para asignar</p>
      </Link>

      {/* Limpiezas en progreso */}
      <Link
        href={inProgressHref}
        className="rounded-xl border border-neutral-200 bg-white p-3 text-left hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.98] transition-all cursor-pointer"
      >
        <p className="text-xs text-neutral-500 mb-1">En progreso</p>
        <p className="text-2xl font-semibold text-neutral-900">{inProgressCount}</p>
        <p className="text-[10px] text-neutral-400 mt-0.5">Asignadas a mí</p>
      </Link>
    </section>
  );
}

