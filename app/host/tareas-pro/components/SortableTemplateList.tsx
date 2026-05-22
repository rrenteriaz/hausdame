"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderTaskTemplates } from "../actions";
import { isScheduleComplete } from "@/lib/tareas-pro/domain/schedule-anchor";

type TemplateItem = {
  id: string;
  name: string;
  status: string;
  propertyId: string;
  property: { name: string; shortName: string | null };
  sectionCount: number;
  stepCount: number;
  schedule: {
    frequency: string;
    anchorDayOfWeek: number | null;
    anchorDayOfMonth: number | null;
  } | null;
};

function GripIcon() {
  return (
    <svg
      className="w-4 h-4 text-neutral-300 shrink-0"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

function SortableCard({ template }: { template: TemplateItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: template.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const isLegacyPeriodic =
    template.schedule != null &&
    ["DAILY", "WEEKLY", "MONTHLY"].includes(template.schedule.frequency);
  const legacyIncomplete =
    isLegacyPeriodic &&
    !isScheduleComplete(
      template.schedule!.frequency,
      template.schedule!.anchorDayOfWeek,
      template.schedule!.anchorDayOfMonth,
    );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-stretch border rounded-xl bg-white overflow-hidden"
    >
      {/* Drag handle — touch/mouse activator */}
      <button
        type="button"
        className="flex items-center justify-center px-3 cursor-grab active:cursor-grabbing touch-none shrink-0 hover:bg-neutral-50 border-r border-neutral-100"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar para reordenar"
      >
        <GripIcon />
      </button>

      {/* Card content — navigates on click */}
      <Link
        href={`/host/tareas-pro/${template.id}`}
        className="flex flex-1 items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div>
          <p className="font-medium text-sm">{template.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {template.property.shortName ?? template.property.name} ·{" "}
            {template.sectionCount} áreas · {template.stepCount} tareas
          </p>
          {isLegacyPeriodic && (
            <p className="text-xs text-orange-600 mt-1">
              Usa periodicidad legacy. Considera migrar.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              template.status === "ACTIVE"
                ? "bg-green-100 text-green-700"
                : template.status === "DRAFT"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {template.status === "ACTIVE"
              ? "Activo"
              : template.status === "DRAFT"
              ? "Borrador"
              : "Inactivo"}
          </span>
          {isLegacyPeriodic && (
            <span
              title={
                legacyIncomplete
                  ? "Configuración legacy incompleta — falta el ancla de día."
                  : "Usa el modelo legacy de periodicidad."
              }
              className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${
                legacyIncomplete
                  ? "bg-amber-100 text-amber-700"
                  : "bg-orange-100 text-orange-700"
              }`}
            >
              {legacyIncomplete ? "⚠ Legacy incompleto" : "Periódico legacy"}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

export default function SortableTemplateList({
  templates: initialTemplates,
}: {
  templates: TemplateItem[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = templates.findIndex((t) => t.id === active.id);
      const newIndex = templates.findIndex((t) => t.id === over.id);
      const reordered = arrayMove(templates, oldIndex, newIndex);

      setTemplates(reordered);
      await reorderTaskTemplates(reordered.map((t) => t.id));
    },
    [templates],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={templates.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {templates.map((t) => (
            <SortableCard key={t.id} template={t} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
