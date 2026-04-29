"use client";

// app/cleaner/profile/CleanerAddressMapPreview.tsx
// Muestra un mapa Leaflet compacto geocodificando la dirección via Nominatim (OSM).
// No requiere coordenadas almacenadas ni API key.

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

type Status = "loading" | "ready" | "error";

function isImageModule(x: unknown): x is { src: string } {
  return typeof x === "object" && x !== null && "src" in x &&
    typeof (x as { src?: unknown }).src === "string";
}

export default function CleanerAddressMapPreview({ address }: { address: string }) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [mapsUrl, setMapsUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapElRef.current || mapRef.current) return;

      try {
        // 1. Geocodificar con Nominatim (OSM, gratuito)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
          { headers: { "Accept-Language": "es-MX,es" } }
        );
        if (cancelled || !mapElRef.current) return;

        const data: { lat: string; lon: string }[] = await res.json();
        if (!data.length) { setStatus("error"); return; }

        const latitude = parseFloat(data[0].lat);
        const longitude = parseFloat(data[0].lon);
        setMapsUrl(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`);

        // 2. Inicializar Leaflet (mismo patrón que PropertyLocationPreview)
        const L = await import("leaflet");
        if (cancelled || !mapElRef.current || mapRef.current) return;

        const markerIcon2x = (await import("leaflet/dist/images/marker-icon-2x.png")).default;
        const markerIcon   = (await import("leaflet/dist/images/marker-icon.png")).default;
        const markerShadow = (await import("leaflet/dist/images/marker-shadow.png")).default;

        const toUrl = (x: unknown): string => {
          if (typeof x === "string") return x;
          if (isImageModule(x)) return x.src;
          return "";
        };

        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: toUrl(markerIcon2x),
          iconUrl:       toUrl(markerIcon),
          shadowUrl:     toUrl(markerShadow),
        });

        const map = L.map(mapElRef.current, {
          zoomControl: false,
          attributionControl: true,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false,
        }).setView([latitude, longitude], 15);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        L.marker([latitude, longitude]).addTo(map);
        mapRef.current = map;

        setTimeout(() => { if (mapRef.current && !cancelled) mapRef.current.invalidateSize(); }, 0);
        setStatus("ready");

      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      try { mapRef.current?.remove(); } catch { /* noop */ }
      mapRef.current = null;
    };
  }, [address]);

  if (status === "error") return null;

  return (
    <div className="property-map-preview relative w-full rounded-xl border border-neutral-200 overflow-hidden bg-neutral-100 isolate">
      <div ref={mapElRef} className="h-[160px] w-full" />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 z-10">
          <p className="text-xs text-neutral-400">Cargando mapa…</p>
        </div>
      )}

      {status === "ready" && mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-2 right-2 rounded-lg bg-white px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 transition z-10"
        >
          Abrir ruta
        </a>
      )}
    </div>
  );
}
