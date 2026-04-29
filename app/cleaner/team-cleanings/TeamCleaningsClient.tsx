"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { reassignCleaningByLeader } from "@/app/cleaner/cleanings/reassign-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemberItem = {
  membershipId: string;
  name: string;
  role: "TEAM_LEADER" | "CLEANER";
  teamId: string;
};

export type CleaningItem = {
  id: string;
  propertyName: string;
  thumbUrl: string | null;
  scheduledDate: string; // ISO string
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  assignedMembershipId: string | null;
  assignedMemberName: string | null;
  teamId: string;
  teamName?: string; // Presente solo cuando el TL tiene múltiples equipos
};

export type CleanerForReassign = {
  membershipId: string;
  name: string;
  teamId: string;
};

type FilterTab = "assigned" | "in_progress" | "completed";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "assigned", label: "Asignadas" },
  { key: "in_progress", label: "En proceso" },
  { key: "completed", label: "Completadas" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesFilter(c: CleaningItem, f: FilterTab): boolean {
  if (f === "assigned") return c.status === "PENDING";
  if (f === "in_progress") return c.status === "IN_PROGRESS";
  return c.status === "COMPLETED";
}

function matchesMember(c: CleaningItem, membershipId: string): boolean {
  if (membershipId === "__all__") return true;
  if (membershipId === "__unassigned__") return !c.assignedMembershipId;
  return c.assignedMembershipId === membershipId;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emptyLabel(f: FilterTab) {
  if (f === "assigned") return "asignadas";
  if (f === "in_progress") return "en proceso";
  return "completadas";
}

// ── FilterTabs ────────────────────────────────────────────────────────────────

function FilterTabs({
  filter,
  onChange,
  counts,
}: {
  filter: FilterTab;
  onChange: (f: FilterTab) => void;
  counts: Record<FilterTab, number>;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
            filter === tab.key
              ? "bg-neutral-900 text-white"
              : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          {tab.label}
          <span
            className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none ${
              filter === tab.key
                ? "bg-white/20 text-white"
                : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {counts[tab.key]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── CleaningCard ──────────────────────────────────────────────────────────────

function CleaningCard({
  cleaning,
  cleanersForReassign,
  isTeamLeader,
}: {
  cleaning: CleaningItem;
  cleanersForReassign: CleanerForReassign[];
  isTeamLeader: boolean;
}) {
  const members = cleanersForReassign.filter((m) => m.teamId === cleaning.teamId);
  const isUnassigned = !cleaning.assignedMembershipId;
  const isDone = cleaning.status === "COMPLETED";
  const isInProgress = cleaning.status === "IN_PROGRESS";

  const href = `/cleaner/cleanings/${cleaning.id}?returnTo=${encodeURIComponent("/cleaner/team-cleanings")}`;

  return (
    <div
      className={`rounded-2xl border space-y-3 ${
        isUnassigned && !isDone && !isInProgress
          ? "border-amber-200 bg-amber-50"
          : isDone
          ? "border-green-100 bg-green-50"
          : isInProgress
          ? "border-indigo-100 bg-indigo-50"
          : "border-neutral-200 bg-white"
      }`}
    >
      <Link href={href} className="flex items-start gap-3 p-4 hover:bg-black/[0.02] transition rounded-t-2xl">
        {cleaning.thumbUrl ? (
          <img
            src={cleaning.thumbUrl}
            alt={cleaning.propertyName}
            className="h-10 w-10 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-neutral-200 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {cleaning.propertyName}
            </p>
            {cleaning.teamName && (
              <span className="shrink-0 text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-1.5 py-0.5 leading-none">
                {cleaning.teamName}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-0.5" suppressHydrationWarning>
            {formatDate(cleaning.scheduledDate)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {isUnassigned && !isDone && !isInProgress ? (
              <span className="text-xs text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                Sin ejecutor
              </span>
            ) : isDone ? (
              <>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-neutral-600">
                  {cleaning.assignedMemberName}
                </span>
                <span className="text-xs text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                  Completada
                </span>
              </>
            ) : isInProgress ? (
              <>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-xs text-neutral-600">
                  {cleaning.assignedMemberName}
                </span>
                <span className="text-xs text-indigo-700 bg-indigo-100 rounded-full px-2 py-0.5">
                  En proceso
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-xs text-neutral-600">
                  {cleaning.assignedMemberName}
                </span>
                <span className="text-xs text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
                  Asignada
                </span>
              </>
            )}
          </div>
        </div>
      </Link>

      {isTeamLeader && !isDone && members.length > 0 && (
        <form action={reassignCleaningByLeader} className="flex gap-2 px-4 pb-4 -mt-1">
          <input type="hidden" name="cleaningId" value={cleaning.id} />
          <input type="hidden" name="returnTo" value="/cleaner/team-cleanings" />
          <select
            name="targetMembershipId"
            required
            className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 bg-white min-w-0"
          >
            <option value="">
              {isUnassigned ? "— Asignar a —" : "— Reasignar a —"}
            </option>
            {members.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 shrink-0"
          >
            {isUnassigned ? "Asignar" : "Reasignar"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── MemberButton (left panel) ─────────────────────────────────────────────────

function MemberButton({
  membershipId,
  label,
  sublabel,
  initial,
  count,
  isSelected,
  isUnassigned,
  onClick,
}: {
  membershipId: string;
  label: string;
  sublabel?: string;
  initial: string;
  count: number;
  isSelected: boolean;
  isUnassigned?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition ${
        isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"
      }`}
    >
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
          isUnassigned
            ? "bg-amber-100 text-amber-700"
            : isSelected
            ? "bg-neutral-200 text-neutral-700"
            : "bg-neutral-100 text-neutral-600"
        }`}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium truncate ${
            isSelected ? "text-neutral-900" : "text-neutral-700"
          }`}
        >
          {label}
        </p>
        {sublabel && (
          <p className="text-xs text-neutral-400">{sublabel}</p>
        )}
      </div>
      {count > 0 && (
        <span
          className={`text-xs font-medium rounded-full px-2 py-0.5 shrink-0 ${
            isSelected
              ? "bg-neutral-900 text-white"
              : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamCleaningsClient({
  members,
  cleanings,
  cleanersForReassign,
  isTeamLeader,
}: {
  members: MemberItem[];
  cleanings: CleaningItem[];
  cleanersForReassign: CleanerForReassign[];
  isTeamLeader: boolean;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>("__all__");
  const [filter, setFilter] = useState<FilterTab>("assigned");
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(
    new Set([members[0]?.membershipId ?? ""])
  );

  const hasUnassigned = useMemo(
    () => cleanings.some((c) => c.status === "PENDING" && !c.assignedMembershipId),
    [cleanings]
  );

  // Total counts for filter tabs (across all)
  const totalCounts = useMemo<Record<FilterTab, number>>(
    () => ({
      assigned: cleanings.filter((c) => c.status === "PENDING").length,
      in_progress: cleanings.filter((c) => c.status === "IN_PROGRESS").length,
      completed: cleanings.filter((c) => c.status === "COMPLETED").length,
    }),
    [cleanings]
  );

  function getCleanings(membershipId: string) {
    return cleanings.filter(
      (c) => matchesFilter(c, filter) && matchesMember(c, membershipId)
    );
  }

  function countForMember(membershipId: string) {
    return cleanings.filter(
      (c) => matchesFilter(c, filter) && matchesMember(c, membershipId)
    ).length;
  }

  function toggleMember(id: string) {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rightPanelCleanings = getCleanings(selectedMemberId);

  // ── Mobile ──────────────────────────────────────────────────────────────────
  const MobileSection = ({
    id,
    label,
    sublabel,
    initial,
    avatarClass,
    headerClass,
  }: {
    id: string;
    label: string;
    sublabel?: string;
    initial: string;
    avatarClass: string;
    headerClass: string;
  }) => {
    const sectionCleanings = getCleanings(id);
    const isExpanded = expandedMembers.has(id);
    const count = sectionCleanings.length;

    return (
      <div className={`rounded-2xl border overflow-hidden ${headerClass}`}>
        <button
          type="button"
          onClick={() => toggleMember(id)}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-black/[0.02] transition"
        >
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarClass}`}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 truncate">{label}</p>
            {sublabel && (
              <p className="text-xs text-neutral-500">{sublabel}</p>
            )}
          </div>
          <span
            className={`text-xs font-medium rounded-full px-2 py-0.5 shrink-0 ${
              count > 0 ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {count}
          </span>
          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform shrink-0 ${
              isExpanded ? "rotate-180" : ""
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
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 pt-2 space-y-2 border-t border-neutral-100">
            {sectionCleanings.length === 0 ? (
              <p className="text-sm text-neutral-400 py-3 text-center">
                Sin limpiezas {emptyLabel(filter)}.
              </p>
            ) : (
              sectionCleanings.map((c) => (
                <CleaningCard
                  key={c.id}
                  cleaning={c}
                  cleanersForReassign={cleanersForReassign}
                  isTeamLeader={isTeamLeader}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ── MOBILE ─────────────────────────────────────────────────── */}
      <div className="sm:hidden space-y-4 p-4">
        <FilterTabs filter={filter} onChange={setFilter} counts={totalCounts} />

        {hasUnassigned && filter === "assigned" && (
          <MobileSection
            id="__unassigned__"
            label="Sin ejecutor"
            sublabel="Requieren asignación"
            initial="?"
            avatarClass="bg-amber-100 text-amber-700"
            headerClass="border-amber-200 bg-amber-50"
          />
        )}

        {members.map((member) => (
          <MobileSection
            key={member.membershipId}
            id={member.membershipId}
            label={member.name}
            sublabel={member.role === "TEAM_LEADER" ? "Líder" : "Ejecutor"}
            initial={member.name.trim()[0]?.toUpperCase() ?? "M"}
            avatarClass="bg-neutral-100 text-neutral-700"
            headerClass="border-neutral-200 bg-white"
          />
        ))}
      </div>

      {/* ── DESKTOP ────────────────────────────────────────────────── */}
      <div className="hidden sm:flex h-[calc(100vh-160px)] overflow-hidden">
        {/* Left panel — member list */}
        <div className="w-64 xl:w-72 shrink-0 border-r border-neutral-200 bg-white overflow-y-auto">
          <div className="p-3 space-y-0.5">
            {/* Todos */}
            <MemberButton
              membershipId="__all__"
              label="Todos"
              initial="T"
              count={countForMember("__all__")}
              isSelected={selectedMemberId === "__all__"}
              onClick={() => setSelectedMemberId("__all__")}
            />

            {/* Sin ejecutor */}
            {hasUnassigned && filter === "assigned" && (
              <MemberButton
                membershipId="__unassigned__"
                label="Sin ejecutor"
                sublabel="Requieren asignación"
                initial="?"
                count={countForMember("__unassigned__")}
                isSelected={selectedMemberId === "__unassigned__"}
                isUnassigned
                onClick={() => setSelectedMemberId("__unassigned__")}
              />
            )}

            {/* Separator */}
            <div className="py-1">
              <div className="border-t border-neutral-100" />
            </div>

            {/* Members */}
            {members.map((member) => (
              <MemberButton
                key={member.membershipId}
                membershipId={member.membershipId}
                label={member.name}
                sublabel={member.role === "TEAM_LEADER" ? "Líder" : "Ejecutor"}
                initial={member.name.trim()[0]?.toUpperCase() ?? "M"}
                count={countForMember(member.membershipId)}
                isSelected={selectedMemberId === member.membershipId}
                onClick={() => setSelectedMemberId(member.membershipId)}
              />
            ))}
          </div>
        </div>

        {/* Right panel — filter + cleanings */}
        <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50">
          {/* Filtros fijos */}
          <div className="shrink-0 px-6 pt-5 pb-4 bg-neutral-50 border-b border-neutral-100">
            <FilterTabs
              filter={filter}
              onChange={(f) => {
                setFilter(f);
                if (selectedMemberId === "__unassigned__") {
                  setSelectedMemberId("__all__");
                }
              }}
              counts={totalCounts}
            />
          </div>

          {/* Lista scrolleable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {rightPanelCleanings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
                <p className="text-sm text-neutral-500">
                  Sin limpiezas {emptyLabel(filter)}.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rightPanelCleanings.map((c) => (
                  <CleaningCard
                    key={c.id}
                    cleaning={c}
                    cleanersForReassign={cleanersForReassign}
                    isTeamLeader={isTeamLeader}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
