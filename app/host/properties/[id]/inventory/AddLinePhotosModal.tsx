// app/host/properties/[id]/inventory/AddLinePhotosModal.tsx
// Fase 11: modal de gestión de fotos a nivel InventoryLine
"use client";

import { useState, useEffect } from "react";
import InventoryLineImageSlots from "./InventoryLineImageSlots";
import { getInventoryLineImageThumbsAction } from "@/app/host/inventory/line-image-actions";

interface AddLinePhotosModalProps {
  isOpen: boolean;
  lineId: string;
  itemName?: string;
  onClose: () => void;
}

export default function AddLinePhotosModal({
  isOpen,
  lineId,
  itemName,
  onClose,
}: AddLinePhotosModalProps) {
  const [thumbs, setThumbs] = useState<Array<string | null>>([null, null, null]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);

  useEffect(() => {
    if (isOpen && lineId) {
      setLoadingThumbs(true);
      getInventoryLineImageThumbsAction(lineId)
        .then(setThumbs)
        .catch(() => setThumbs([null, null, null]))
        .finally(() => setLoadingThumbs(false));
    }
  }, [isOpen, lineId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-lg font-semibold text-neutral-900">Agregar fotos</h2>
            {itemName && (
              <p className="text-sm text-neutral-600 truncate mt-0.5">{itemName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {loadingThumbs ? (
            <p className="text-sm text-neutral-500">Cargando fotos...</p>
          ) : (
            <InventoryLineImageSlots
              lineId={lineId}
              initialThumbs={thumbs}
              onThumbsChange={setThumbs}
            />
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-black text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
