// app/host/properties/[id]/CoverImageSection.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadCoverImage, removeCoverImage } from "../cover-actions";
import ListThumb from "@/lib/ui/ListThumb";

interface CoverImageSectionProps {
  propertyId: string;
  coverThumbUrl: string | null;
  coverOriginalUrl: string | null;
  propertyName: string;
  returnTo?: string | null;
}

export default function CoverImageSection({
  propertyId,
  coverThumbUrl,
  coverOriginalUrl,
  propertyName,
  returnTo,
}: CoverImageSectionProps) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRemoved, setIsRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validación cliente
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert("El archivo es demasiado grande. Máximo 5MB.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      alert("Tipo de archivo no permitido. Use JPG, PNG o WebP.");
      return;
    }

    // Preview local
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setIsRemoved(false);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("propertyId", propertyId);
      formData.append("file", file);
      if (returnTo) {
        formData.append("returnTo", returnTo);
      }

      const result = await uploadCoverImage(formData);
      if (result?.ok) {
        router.refresh();
      } else if (result && !result.ok) {
        console.error("Error uploading cover:", result.error);
        alert(`Error al subir la imagen: ${result.error}`);
        setPreviewUrl(null);
      }
    } catch (error) {
      // Solo si el server action lanza inesperadamente (redirect, auth, etc.)
      const message = error instanceof Error ? error.message : "Error desconocido";
      console.error("Error uploading cover (unexpected throw):", message, error);
      // No mostrar si es un redirect interno de Next.js
      if (!message.includes("NEXT_REDIRECT")) {
        alert(`Error al subir la imagen: ${message}`);
        setPreviewUrl(null);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!confirm("¿Está seguro de que desea eliminar la imagen de portada?")) {
      return;
    }

    // Optimistic: ocultar inmediatamente sin esperar al servidor
    setIsRemoved(true);
    setPreviewUrl(null);

    try {
      const formData = new FormData();
      formData.append("propertyId", propertyId);
      if (returnTo) {
        formData.append("returnTo", returnTo);
      }

      const result = await removeCoverImage(formData);
      if (result?.ok) {
        router.refresh();
      } else {
        // Revertir el optimistic update si falló
        setIsRemoved(false);
        const msg = (result as any)?.error || "Error desconocido";
        console.error("Error removing cover:", msg);
        alert(`Error al eliminar la imagen: ${msg}`);
      }
    } catch (error) {
      // Revertir el optimistic update
      setIsRemoved(false);
      const message = error instanceof Error ? error.message : "Error desconocido";
      console.error("Error removing cover (unexpected throw):", message, error);
      if (!message.includes("NEXT_REDIRECT")) {
        alert(`Error al eliminar la imagen: ${message}`);
      }
    }
  };

  const displayUrl = isRemoved ? null : (previewUrl || coverOriginalUrl || coverThumbUrl);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-800">Imagen de portada</h3>
      </div>

      {displayUrl ? (
        <div className="space-y-3">
          <div className="relative w-full h-40 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : coverOriginalUrl ? (
              <img
                src={coverOriginalUrl}
                alt={propertyName}
                className="w-full h-full object-cover"
              />
            ) : coverThumbUrl ? (
              <img
                src={coverThumbUrl}
                alt={propertyName}
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
              />
              <span className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed">
                {isUploading ? "Subiendo..." : "Cambiar imagen"}
              </span>
            </label>

            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading}
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative w-full h-40 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 flex items-center justify-center">
            <ListThumb src={null} alt={propertyName} size={64} />
          </div>

          <label className="cursor-pointer inline-block">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
            />
            <span className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-black px-4 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed">
              {isUploading ? "Subiendo..." : "Subir portada"}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

