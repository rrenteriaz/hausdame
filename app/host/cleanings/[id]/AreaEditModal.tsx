"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { ChecklistArea } from "@/lib/inventory-constants";
import {
  updateCleaningChecklistItem,
  deleteCleaningChecklistItem,
  addCleaningChecklistItem,
  reorderCleaningChecklistItems,
  toggleCleaningChecklistItem,
} from "./checklist-actions";
import { useRouter } from "next/navigation";

interface ChecklistItem {
  id: string;
  area: ChecklistArea;
  title: string;
  sortOrder: number;
  isCompleted: boolean;
  requiresValue: boolean;
  valueLabel?: string | null;
  valueNumber?: number | null;
}

interface AreaEditModalProps {
  area: ChecklistArea;
  areaLabel: string;
  items: ChecklistItem[];
  cleaningId: string;
  isOpen: boolean;
  onClose: () => void;
  cleaningStatus?: string; // Status de la limpieza para determinar si se puede editar
}

export default function AreaEditModal({
  area,
  areaLabel,
  items,
  cleaningId,
  isOpen,
  onClose,
  cleaningStatus = "PENDING",
}: AreaEditModalProps) {
  // Permitir edición solo si la limpieza está en IN_PROGRESS o PENDING
  const canEdit = cleaningStatus === "IN_PROGRESS" || cleaningStatus === "PENDING";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingItems, setEditingItems] = useState<ChecklistItem[]>(items);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Sincronizar items cuando cambian las props
  useEffect(() => {
    setEditingItems(items);
  }, [items]);

  // Enfocar el input cuando se abre el modal o cuando se agrega un nuevo item
  useEffect(() => {
    if (isOpen && isAddingNew && newItemInputRef.current) {
      newItemInputRef.current.focus();
    }
  }, [isOpen, isAddingNew]);

  // Enfocar el input cuando se edita un item
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  if (!isOpen) return null;

  const handleStartEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditText(item.title);
  };

  const handleSaveEdit = async (itemId: string) => {
    if (!editText.trim()) {
      setEditingId(null);
      return;
    }

    const item = editingItems.find((i) => i.id === itemId);
    if (!item || item.title === editText.trim()) {
      setEditingId(null);
      return;
    }

    startTransition(async () => {
      const result = await updateCleaningChecklistItem(
        cleaningId,
        itemId,
        editText
      );
      if (result.success) {
        setEditingItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, title: editText.trim() } : i
          )
        );
        setEditingId(null);
        router.refresh();
      }
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleDelete = async (itemId: string) => {
    startTransition(async () => {
      const result = await deleteCleaningChecklistItem(cleaningId, itemId);
      if (result.success) {
        setEditingItems((prev) => prev.filter((i) => i.id !== itemId));
        router.refresh();
      }
    });
  };

  const handleAddNew = async () => {
    if (!newItemText.trim()) {
      setIsAddingNew(false);
      setNewItemText("");
      return;
    }

    const newSortOrder =
      editingItems.length > 0
        ? Math.max(...editingItems.map((i) => i.sortOrder)) + 1
        : 0;

    startTransition(async () => {
      const result = await addCleaningChecklistItem(
        cleaningId,
        area,
        newItemText,
        newSortOrder
      );
      if (result.success) {
        setNewItemText("");
        setIsAddingNew(false);
        router.refresh();
      }
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    action: "edit" | "add",
    itemId?: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (action === "edit" && itemId) {
        handleSaveEdit(itemId);
      } else if (action === "add") {
        handleAddNew();
      }
    } else if (e.key === "Escape") {
      if (action === "edit") {
        handleCancelEdit();
      } else if (action === "add") {
        setIsAddingNew(false);
        setNewItemText("");
      }
    }
  };

  // Ordenar items por sortOrder
  const sortedItems = [...editingItems].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header estilo Google Keep */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <button
            onClick={onClose}
            className="text-neutral-600 hover:text-neutral-900 p-2 -ml-2 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label="Cerrar"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="text-2xl font-semibold text-neutral-900 flex-1 text-center">
            {areaLabel}
          </h2>
          <div className="w-10" /> {/* Spacer para centrar el título */}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-1">
            {sortedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 group transition-colors"
              >
                {/* Icono de reordenar (seis puntos) - estilo Google Keep */}
                <button
                  type="button"
                  className="text-neutral-400 hover:text-neutral-600 cursor-move p-1 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
                  aria-label="Reordenar"
                  draggable={false}
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="9" cy="5" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="9" cy="19" r="1.5" />
                    <circle cx="15" cy="5" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="15" cy="19" r="1.5" />
                  </svg>
                </button>

                {/* Checkbox - estilo Google Keep */}
                <input
                  type="checkbox"
                  checked={item.isCompleted}
                  onChange={() => {
                    if (canEdit) {
                      startTransition(async () => {
                        const result = await toggleCleaningChecklistItem(
                          cleaningId,
                          item.id,
                          !item.isCompleted
                        );
                        if (result.success) {
                          setEditingItems((prev) =>
                            prev.map((i) =>
                              i.id === item.id ? { ...i, isCompleted: !i.isCompleted } : i
                            )
                          );
                          router.refresh();
                        }
                      });
                    }
                  }}
                  className="rounded border-neutral-300 text-black focus:ring-black/5 w-5 h-5 cursor-pointer"
                  disabled={!canEdit || isPending}
                />

                {/* Texto del item - editable */}
                {editingId === item.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => handleSaveEdit(item.id)}
                    onKeyDown={(e) => handleKeyDown(e, "edit", item.id)}
                    className="flex-1 text-base text-neutral-900 border-b-2 border-black focus:outline-none bg-transparent py-1"
                    placeholder="Elemento de la lista"
                  />
                ) : (
                  <button
                    onClick={() => handleStartEdit(item)}
                    className="flex-1 text-left text-base text-neutral-900 hover:text-neutral-700 py-1 min-h-[24px]"
                  >
                    {item.title}
                  </button>
                )}

                {/* Botón eliminar - siempre visible */}
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="text-neutral-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-all"
                  aria-label="Eliminar"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}

            {/* Campo para agregar nuevo item - estilo Google Keep */}
            {isAddingNew ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50">
                <div className="w-5 h-5" /> {/* Spacer para icono de reordenar */}
                <div className="w-5 h-5" /> {/* Spacer para checkbox */}
                <input
                  ref={newItemInputRef}
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onBlur={() => {
                    // No cerrar automáticamente, solo cuando se presiona Escape o Enter
                    if (!newItemText.trim()) {
                      setIsAddingNew(false);
                      setNewItemText("");
                    }
                  }}
                  onKeyDown={(e) => handleKeyDown(e, "add")}
                  placeholder="Elemento de la lista"
                  className="flex-1 text-base text-neutral-900 border-b-2 border-black focus:outline-none bg-transparent py-1"
                  autoFocus
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 w-full transition-colors"
              >
                <div className="w-5 h-5" /> {/* Spacer para icono de reordenar */}
                <div className="w-5 h-5" /> {/* Spacer para checkbox */}
                <span className="text-2xl text-neutral-400 leading-none">+</span>
                <span className="text-base">Elemento de la lista</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer con botón de guardar (opcional, ya que se guarda automáticamente) */}
        {isPending && (
          <div className="p-4 border-t border-neutral-200 bg-neutral-50">
            <p className="text-xs text-neutral-600 text-center">
              Guardando...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

