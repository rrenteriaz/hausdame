"use client";

import { useState, useEffect } from "react";
import TaskStepImageSlots from "./TaskStepImageSlots";
import { getTaskStepThumbsAction } from "../step-image-actions";

interface Props {
  isOpen: boolean;
  stepId: string;
  stepName?: string;
  onClose: () => void;
  onThumbsChange?: (thumbs: Array<string | null>) => void;
}

export default function TaskStepPhotosModal({ isOpen, stepId, stepName, onClose, onThumbsChange }: Props) {
  const [thumbs, setThumbs] = useState<Array<string | null>>([null, null, null]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && stepId) {
      setLoading(true);
      getTaskStepThumbsAction(stepId)
        .then(setThumbs)
        .catch(() => setThumbs([null, null, null]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, stepId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-base font-semibold text-neutral-900">Fotos de referencia</h2>
            {stepName && <p className="text-sm text-neutral-500 truncate mt-0.5">{stepName}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">
          {loading ? (
            <p className="text-sm text-neutral-500">Cargando fotos…</p>
          ) : (
            <TaskStepImageSlots
              stepId={stepId}
              initialThumbs={thumbs}
              onThumbsChange={(newThumbs) => {
                setThumbs(newThumbs);
                onThumbsChange?.(newThumbs);
              }}
            />
          )}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 transition"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
