"use client";

import Link from "next/link";
import { InventoryReviewStatus } from "@/lib/types/inventory-enums";
import { submitInventoryReview } from "@/app/host/inventory-review/actions";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

interface InventoryCardProps {
  cleaningId: string;
  review: {
    id: string;
    status: InventoryReviewStatus;
  } | null;
  returnTo?: string;
}

export default function InventoryCard({ cleaningId, review, returnTo }: InventoryCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isSubmitted = review?.status === InventoryReviewStatus.SUBMITTED;
  const isDraft = review?.status === InventoryReviewStatus.DRAFT || !review;

  const handleSubmit = async () => {
    if (!review) return;

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("reviewId", review.id);
        await submitInventoryReview(formData);
        router.refresh();
      } catch (error: any) {
        console.error("Error al enviar inventario:", error);
        // El error se mostrará en la página de inventario
      }
    });
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-900">Inventario</h3>
        {isSubmitted ? (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Enviado
          </span>
        ) : (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            No enviado
          </span>
        )}
      </div>

      <p className="text-sm text-neutral-600">
        {isSubmitted
          ? "El inventario ha sido enviado y está bloqueado para edición."
          : "Debes revisar y enviar el inventario antes de terminar la limpieza."}
      </p>

      <div className="flex gap-2">
        {isDraft ? (
          <>
            <Link
              href={`/host/cleanings/${cleaningId}/inventory-review${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
              className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-900 hover:bg-neutral-50 transition text-center"
            >
              Revisar / Ajustar
            </Link>
            {review && (
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 px-3 py-2 rounded-lg bg-black text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isPending ? "Enviando..." : "Enviar inventario"}
              </button>
            )}
          </>
        ) : (
          <Link
            href={`/host/cleanings/${cleaningId}/inventory-review${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
            className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-900 hover:bg-neutral-50 transition text-center"
          >
            Ver inventario
          </Link>
        )}
      </div>
    </section>
  );
}

