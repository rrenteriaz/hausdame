// app/host/properties/[id]/checklist/ChecklistItemImageSlots.tsx
"use client";

import { useState, useRef } from "react";
import {
  uploadChecklistItemImageAction,
  deleteChecklistItemImageAction,
} from "@/app/host/properties/checklist-image-actions";
import Image from "next/image";
import ConfirmModal from "@/components/ConfirmModal";

interface ChecklistItemImageSlotsProps {
  checklistItemId: string;
  initialThumbs: Array<string | null>; // [thumb1, thumb2, thumb3] o null
  onThumbsChange?: (thumbs: Array<string | null>) => void; // Callback opcional para notificar cambios
}

export default function ChecklistItemImageSlots({
  checklistItemId,
  initialThumbs,
  onThumbsChange,
}: ChecklistItemImageSlotsProps) {
  const [thumbs, setThumbs] = useState<Array<string | null>>(initialThumbs);
  const [uploadingPosition, setUploadingPosition] = useState<number | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeletePosition, setConfirmDeletePosition] = useState<number | null>(null);
  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null]);
  const cameraInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null]);
  const [openSheetPosition, setOpenSheetPosition] = useState<number | null>(null);

  const handleFileSelect = async (position: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validación cliente
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError("El archivo es demasiado grande. Máximo 5MB.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Tipo de archivo no permitido. Use JPG, PNG o WebP.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setUploadingPosition(position);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("checklistItemId", checklistItemId);
      formData.append("position", position.toString());
      formData.append("file", file);

      const result = await uploadChecklistItemImageAction(formData);

      // Actualizar el thumb en la posición correspondiente
      const newThumbs = [...thumbs];
      newThumbs[position - 1] = result.thumbUrl;
      setThumbs(newThumbs);
      onThumbsChange?.(newThumbs);
    } catch (error: any) {
      console.error("Error uploading image:", error);
      setError(error?.message || "Error al subir la imagen. Por favor, intente nuevamente.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setUploadingPosition(null);
      // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
      if (fileInputRefs.current[position - 1]) {
        fileInputRefs.current[position - 1]!.value = "";
      }
      if (cameraInputRefs.current[position - 1]) {
        cameraInputRefs.current[position - 1]!.value = "";
      }
    }
  };

  const handleDeleteClick = (position: number) => {
    setConfirmDeletePosition(position);
  };

  const handleConfirmDelete = async () => {
    const position = confirmDeletePosition;
    if (!position) return;

    // Si ya está eliminando, no hacer nada (evitar doble click)
    if (deletingPosition !== null) return;

    setDeletingPosition(position);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("checklistItemId", checklistItemId);
      formData.append("position", position.toString());

      await deleteChecklistItemImageAction(formData);

      // Limpiar el thumb en la posición correspondiente
      const newThumbs = [...thumbs];
      newThumbs[position - 1] = null;
      setThumbs(newThumbs);
      onThumbsChange?.(newThumbs);

      // Cerrar modal solo después de éxito
      setConfirmDeletePosition(null);
    } catch (error: any) {
      console.error("Error deleting image:", error);
      setError(error?.message || "Error al eliminar la imagen. Por favor, intente nuevamente.");
      setTimeout(() => setError(null), 5000);
      // El modal permanece abierto para que el usuario vea el error y pueda cerrarlo manualmente
    } finally {
      setDeletingPosition(null);
    }
  };

  const handleCancelDelete = () => {
    // No permitir cerrar si está eliminando
    if (deletingPosition !== null) return;
    setConfirmDeletePosition(null);
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
          // Determinar cuántos slots mostrar
          const imagesCount = thumbs.filter(thumb => thumb !== null).length;
          const maxSlotsToShow = Math.min(imagesCount + 1, 3); // Mostrar slots ocupados + 1 vacío (hasta 3)
          
          return [1, 2, 3].slice(0, maxSlotsToShow).map((position) => {
            const thumbUrl = thumbs[position - 1];
            const isUploading = uploadingPosition === position;
            const isDeleting = deletingPosition === position;
            const isLoading = isUploading || isDeleting;

            return (
              <div key={position} className="flex flex-col gap-1.5 flex-shrink-0">
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
                        onClick={() => handleDeleteClick(position)}
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
                    <div
                      className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100 transition"
                      onClick={() => !isLoading && setOpenSheetPosition(position)}
                      role="button"
                      aria-label="Agregar foto"
                    >
                      {isUploading ? (
                        <span className="text-xs text-neutral-500">Subiendo...</span>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-neutral-400">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-[10px]">Agregar foto</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>
      <p className="text-xs text-neutral-500">
        Máximo 3 imágenes por tarea
      </p>

      {/* Hidden inputs — siempre montados para dispararse desde el bottom sheet */}
      {[1, 2, 3].map((pos) => (
        <div key={`inputs-${pos}`} className="hidden">
          <input
            ref={(el) => { cameraInputRefs.current[pos - 1] = el; }}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFileSelect(pos, e)}
          />
          <input
            ref={(el) => { fileInputRefs.current[pos - 1] = el; }}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect(pos, e)}
          />
        </div>
      ))}

      {/* Modal de confirmación de eliminación */}
      <ConfirmModal
        isOpen={confirmDeletePosition !== null}
        onClose={handleCancelDelete}
        title="¿Eliminar imagen?"
        message="¿Seguro que deseas eliminar esta imagen?"
        confirmText={deletingPosition === confirmDeletePosition ? "Eliminando..." : "Eliminar"}
        cancelText="Cancelar"
        confirmAction={handleConfirmDelete}
        variant="danger"
        disabled={deletingPosition === confirmDeletePosition}
      />

      {/* Bottom sheet — selección de origen de foto */}
      {openSheetPosition !== null && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/40"
            onClick={() => setOpenSheetPosition(null)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[80] bg-white rounded-t-2xl shadow-2xl pt-5 pb-10 px-4 space-y-1">
            <p className="text-center text-sm font-semibold text-neutral-800 pb-2">Agregar foto</p>
            <button
              type="button"
              onClick={() => {
                cameraInputRefs.current[openSheetPosition - 1]?.click();
                setOpenSheetPosition(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-xl text-base text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 transition text-left"
            >
              <svg className="w-5 h-5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Tomar foto
            </button>
            <button
              type="button"
              onClick={() => {
                fileInputRefs.current[openSheetPosition - 1]?.click();
                setOpenSheetPosition(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-xl text-base text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 transition text-left"
            >
              <svg className="w-5 h-5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Elegir de galería
            </button>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => setOpenSheetPosition(null)}
                className="w-full py-3.5 text-base font-medium text-neutral-500 rounded-xl border border-neutral-200 hover:bg-neutral-50 active:bg-neutral-100 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

