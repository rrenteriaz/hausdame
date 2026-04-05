"use client";

import { useState } from "react";

export default function ZonesBannerClient({ propertyId }: { propertyId: string }) {
  const storageKey = `zones_banner_dismissed_${propertyId}`;
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem(storageKey);
  });

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      <span>
        Hemos creado áreas sugeridas para organizar tu inventario. Puedes modificarlas en cualquier momento.
      </span>
      <button
        onClick={dismiss}
        className="shrink-0 text-blue-600 hover:text-blue-800 font-medium"
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  );
}
