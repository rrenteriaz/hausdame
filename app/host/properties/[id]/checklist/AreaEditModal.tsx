"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChecklistArea } from "@/lib/inventory-constants";
import TaskPhotosModal from "./TaskPhotosModal";
import Image from "next/image";

interface ChecklistItem {
  id: string;
  area: ChecklistArea;
  title: string;
  sortOrder: number;
  isActive: boolean;
  requiresValue: boolean;
  valueLabel?: string | null;
}

interface AreaEditModalProps {
  area: ChecklistArea;
  areaLabel: string;
  items: ChecklistItem[];
  isOpen: boolean;
  onClose: () => void;
  autoFocusNewItem?: boolean; // Si es true, enfoca automáticamente el campo de nuevo item
  onDeleteItem: (itemId: string) => void;
  onAddItem: (area: ChecklistArea, title: string) => void;
  onUpdateItemTitle: (itemId: string, title: string) => void;
  itemThumbsMap?: Map<string, Array<string | null>>;
}

export default function AreaEditModal({
  area,
  areaLabel,
  items,
  isOpen,
  onClose,
  autoFocusNewItem = false,
  onDeleteItem,
  onAddItem,
  onUpdateItemTitle,
  itemThumbsMap: initialItemThumbsMap,
}: AreaEditModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [isPhotosModalOpen, setIsPhotosModalOpen] = useState(false);
  const [photosItemId, setPhotosItemId] = useState<string | null>(null);
  const [photosItemTitle, setPhotosItemTitle] = useState<string | null>(null);
  const [itemThumbsMap, setItemThumbsMap] = useState<Map<string, Array<string | null>>>(initialItemThumbsMap || new Map());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Handler para cerrar preview con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && previewUrl) {
        setPreviewUrl(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [previewUrl]);

  // Enfocar el input cuando se abre el modal o cuando se agrega un nuevo item
  useEffect(() => {
    if (isOpen && autoFocusNewItem && !isAddingNew) {
      // Si autoFocusNewItem es true, abrir automáticamente el campo de nuevo item
      setIsAddingNew(true);
    }
  }, [isOpen, autoFocusNewItem, isAddingNew]);

  useEffect(() => {
    if (isOpen && isAddingNew && newItemInputRef.current) {
      // Pequeño delay para asegurar que el input esté renderizado
      const timer = setTimeout(() => {
        newItemInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAddingNew]);

  // Enfocar el input cuando se edita un item
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );

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

    const item = items.find((i) => i.id === itemId);
    if (!item || item.title === editText.trim()) {
      setEditingId(null);
      return;
    }

    setEditingId(null);
    onUpdateItemTitle(itemId, editText.trim());
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleDelete = async (itemId: string) => {
    onDeleteItem(itemId);
  };

  const handleAddNew = async () => {
    if (!newItemText.trim()) {
      setIsAddingNew(false);
      setNewItemText("");
      return;
    }

    const newItemTitle = newItemText.trim();
    setNewItemText("");
    setIsAddingNew(false);
    onAddItem(area, newItemTitle);
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

                {/* Slot fijo para miniatura (mantiene alineación de viñetas) */}
                <div className="w-8 h-8 flex-shrink-0">
                  {(() => {
                    const thumbs = itemThumbsMap.get(item.id) || [null, null, null];
                    return thumbs[0] ? (
                      <div
                        className="relative w-8 h-8 rounded-md overflow-hidden border border-neutral-200 bg-neutral-50 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewUrl(thumbs[0]);
                        }}
                      >
                        <Image
                          src={thumbs[0]}
                          alt="Vista previa"
                          fill
                          className="object-cover"
                          sizes="32px"
                        />
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Viñeta */}
                <span className="text-neutral-400 text-lg leading-none select-none">•</span>

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

                {/* Icono de imagen - siempre visible */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotosItemId(item.id);
                    setPhotosItemTitle(item.title);
                    setIsPhotosModalOpen(true);
                  }}
                  className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors rounded relative"
                  aria-label={itemThumbsMap.get(item.id)?.some(thumb => thumb !== null) ? "Gestionar fotos" : "Agregar fotos"}
                  title={itemThumbsMap.get(item.id)?.some(thumb => thumb !== null) ? "Gestionar fotos" : "Agregar fotos"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {(() => {
                    const thumbs = itemThumbsMap.get(item.id) || [null, null, null];
                    const photosCount = thumbs.filter(thumb => thumb !== null).length;
                    return photosCount > 0 ? (
                      <span className="absolute -top-1 -right-1 text-[10px] font-medium text-white bg-black rounded-full w-4 h-4 flex items-center justify-center">
                        {photosCount}
                      </span>
                    ) : null;
                  })()}
                </button>

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
                <div className="w-5 h-5" /> {/* Spacer para viñeta */}
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
                <div className="w-5 h-5" /> {/* Spacer para viñeta */}
                <span className="text-2xl text-neutral-400 leading-none">+</span>
                <span className="text-base">Elemento de la lista</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer con indicador de guardado */}
        {/* Sin estado duplicado: el guardado optimista sucede en el padre */}
      </div>

      {/* Modal de fotos de tarea */}
      {isPhotosModalOpen && photosItemId && (
        <TaskPhotosModal
          isOpen={isPhotosModalOpen}
          checklistItemId={photosItemId}
          taskTitle={photosItemTitle || undefined}
          onClose={() => {
            setIsPhotosModalOpen(false);
            setPhotosItemId(null);
            setPhotosItemTitle(null);
          }}
          onThumbsChange={(newThumbs) => {
            setItemThumbsMap((prev) => {
              const updated = new Map(prev);
              updated.set(photosItemId, newThumbs);
              return updated;
            });
          }}
        />
      )}

      {/* Modal de preview de imagen (solo visualización) */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={previewUrl}
              alt="Vista previa"
              width={1200}
              height={800}
              className="object-contain rounded-lg"
            />
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-2 hover:bg-black/90 transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

