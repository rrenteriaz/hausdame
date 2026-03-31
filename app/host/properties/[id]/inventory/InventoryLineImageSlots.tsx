// app/host/properties/[id]/inventory/InventoryLineImageSlots.tsx
// Fase 11: gestión de imágenes a nivel InventoryLine (reemplaza InventoryItemImageSlots en contexto de edición)
"use client";

import { useState, useRef } from "react";
import {
  uploadInventoryLineImageAction,
  deleteInventoryLineImageAction,
} from "@/app/host/inventory/line-image-actions";
import Image from "next/image";
import ConfirmModal from "@/components/ConfirmModal";

interface InventoryLineImageSlotsProps {
  lineId: string;
  initialThumbs: Array<string | null>; // [thumb1, thumb2, thumb3]
  onThumbsChange?: (thumbs: Array<string | null>) => void;
}

export default function InventoryLineImageSlots({
  lineId,
  initialThumbs,
  onThumbsChange,
}: InventoryLineImageSlotsProps) {
  const [thumbs, setThumbs] = useState<Array<string | null>>(initialThumbs);
  const [uploadingPosition, setUploadingPosition] = useState<number | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<number | null>(null);
  const [confirmDeletePosition, setConfirmDeletePosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null]);

  const handleFileSelect = async (position: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("El archivo es demasiado grande. Máximo 5MB.");
      setTimeout(() => setError(null), 5000);
      return;
    }
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      setError("Tipo de archivo no permitido. Use JPG, PNG o WebP.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setUploadingPosition(position);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("lineId", lineId);
      formData.append("position", position.toString());
      formData.append("file", file);

      const result = await uploadInventoryLineImageAction(formData);

      const newThumbs = [...thumbs];
      newThumbs[position - 1] = result.thumbUrl;
      setThumbs(newThumbs);
      onThumbsChange?.(newThumbs);
    } catch (err: any) {
      setError(err?.message || "Error al subir la imagen. Por favor, intente nuevamente.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setUploadingPosition(null);
      if (fileInputRefs.current[position - 1]) {
        fileInputRefs.current[position - 1]!.value = "";
      }
    }
  };

  const handleConfirmDelete = async () => {
    const position = confirmDeletePosition;
    if (!position || deletingPosition !== null) return;

    setDeletingPosition(position);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("lineId", lineId);
      formData.append("position", position.toString());

      await deleteInventoryLineImageAction(formData);

      const newThumbs = [...thumbs];
      newThumbs[position - 1] = null;
      setThumbs(newThumbs);
      onThumbsChange?.(newThumbs);
      setConfirmDeletePosition(null);
    } catch (err: any) {
      setError(err?.message || "Error al eliminar la imagen. Por favor, intente nuevamente.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setDeletingPosition(null);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-neutral-700">
        Fotos
      </label>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        {(() => {
          const imagesCount = thumbs.filter((t) => t !== null).length;
          const maxSlotsToShow = Math.min(imagesCount + 1, 3);

          return [1, 2, 3].slice(0, maxSlotsToShow).map((position) => {
            const thumbUrl = thumbs[position - 1];
            const isUploading = uploadingPosition === position;
            const isDeleting = deletingPosition === position;
            const isLoading = isUploading || isDeleting;

            return (
              <div key={position} className="flex-shrink-0">
                <div className="relative w-28 h-28 rounded-lg border border-neutral-300 bg-neutral-50 overflow-hidden">
                  {thumbUrl ? (
                    <>
                      <Image
                        src={thumbUrl}
                        alt={`Foto ${position}`}
                        fill
                        className="object-cover"
                        sizes="112px"
                      />
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePosition(position)}
                        disabled={isLoading}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition disabled:opacity-50"
                        aria-label="Eliminar foto"
                      >
                        {isDeleting ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </>
                  ) : (
                    <label className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-neutral-100 transition">
                      <input
                        ref={(el) => { fileInputRefs.current[position - 1] = el; }}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={(e) => handleFileSelect(position, e)}
                        disabled={isLoading}
                        className="hidden"
                      />
                      <div className="text-center">
                        {isUploading ? (
                          <span className="text-xs text-neutral-500">Subiendo...</span>
                        ) : (
                          <span className="text-xs text-neutral-600">Agregar</span>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>
      <p className="text-xs text-neutral-500">Máximo 3 imágenes por ítem</p>

      <ConfirmModal
        isOpen={confirmDeletePosition !== null}
        onClose={() => { if (deletingPosition === null) setConfirmDeletePosition(null); }}
        title="¿Eliminar imagen?"
        message="¿Seguro que deseas eliminar esta imagen?"
        confirmText={deletingPosition !== null ? "Eliminando..." : "Eliminar"}
        cancelText="Cancelar"
        confirmAction={handleConfirmDelete}
        variant="danger"
        disabled={deletingPosition !== null}
      />
    </div>
  );
}
