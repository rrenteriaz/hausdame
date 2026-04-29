"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BottomSheet from "@/lib/ui/BottomSheet";
import AddressModal from "@/lib/ui/AddressModal";
import LocationPicker from "@/app/host/properties/[id]/LocationPicker";
import { updateCleanerProfile, resolveGoogleMapsUrl } from "./actions";

type InitialProfile = {
  nickname: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extrae solo dígitos y limita a 10. */
function toRawDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

/** Formatea dígitos mexicanos: XXX XXX XXXX */
function formatMXPhone(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

// ── Sub-modal nombre completo ─────────────────────────────────────────────────

function FullNameModal({
  currentFullName,
  onSave,
  onClose,
}: {
  currentFullName: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const parts = currentFullName.trim().split(/\s+/);
  const [nombre, setNombre] = useState(parts[0] || "");
  const [paterno, setPaterno] = useState(parts[1] || "");
  const [materno, setMaterno] = useState(parts.slice(2).join(" ") || "");

  const handleConfirm = () => {
    const combined = [nombre.trim(), paterno.trim(), materno.trim()]
      .filter(Boolean)
      .join(" ");
    onSave(combined);
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-neutral-900">Nombre completo</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-neutral-700 transition rounded-full hover:bg-neutral-100"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700">Nombre(s)</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoFocus
                placeholder="Ej. María"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 transition"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700">Apellido paterno</label>
              <input
                type="text"
                value={paterno}
                onChange={(e) => setPaterno(e.target.value)}
                placeholder="Ej. García"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 transition"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700">Apellido materno</label>
              <input
                type="text"
                value={materno}
                onChange={(e) => setMaterno(e.target.value)}
                placeholder="Ej. López"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 transition"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!nombre.trim()}
              className="flex-1 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────

export default function EditCleanerProfileModal({
  isOpen,
  onClose,
  initial,
}: {
  isOpen: boolean;
  onClose: () => void;
  initial: InitialProfile;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [nickname, setNickname] = useState(initial.nickname);
  const [fullName, setFullName] = useState(initial.fullName);
  // Almacenamos solo los dígitos del teléfono (10 dígitos MX)
  const [phoneDigits, setPhoneDigits] = useState(toRawDigits(initial.phone));

  const [addressLine1, setAddressLine1] = useState(initial.addressLine1);
  const [addressLine2, setAddressLine2] = useState(initial.addressLine2);
  const [neighborhood, setNeighborhood] = useState(initial.neighborhood);
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [postalCode, setPostalCode] = useState(initial.postalCode);
  const [country, setCountry] = useState(initial.country || "MX");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(
    initial.latitude != null && initial.longitude != null
      ? { latitude: initial.latitude, longitude: initial.longitude }
      : null
  );
  const [gmapsInput, setGmapsInput] = useState(
    initial.latitude != null && initial.longitude != null
      ? `https://www.google.com/maps?q=${initial.latitude},${initial.longitude}`
      : ""
  );
  const [gmapsStatus, setGmapsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gmapsError, setGmapsError] = useState<string | null>(null);
  // Se vuelve true DESPUÉS de que termina la animación de apertura (300ms),
  // para que Leaflet inicialice con dimensiones reales y no un contenedor animando.
  const [mapReady, setMapReady] = useState(false);
  const mapReadyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [isFullNameOpen, setIsFullNameOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Reset al abrir
  useEffect(() => {
    if (!isOpen) return;
    setNickname(initial.nickname);
    setFullName(initial.fullName);
    setPhoneDigits(toRawDigits(initial.phone));
    setAddressLine1(initial.addressLine1);
    setAddressLine2(initial.addressLine2);
    setNeighborhood(initial.neighborhood);
    setCity(initial.city);
    setState(initial.state);
    setPostalCode(initial.postalCode);
    setCountry(initial.country || "MX");
    setLocation(
      initial.latitude != null && initial.longitude != null
        ? { latitude: initial.latitude, longitude: initial.longitude }
        : null
    );
    setGmapsInput(
      initial.latitude != null && initial.longitude != null
        ? `https://www.google.com/maps?q=${initial.latitude},${initial.longitude}`
        : ""
    );
    setGmapsStatus("idle");
    setGmapsError(null);
    setError(null);
    setSuccess(null);
  }, [isOpen, initial]);

  // Drawer desktop lifecycle
  useEffect(() => {
    if (isMobile) return;
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    } else {
      setAnimateIn(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setMounted(false), 300);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen, isMobile]);

  // Escape para cerrar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isFullNameOpen) onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isFullNameOpen, onClose]);

  // mapReady: espera 350ms tras la apertura para que la animación (300ms) termine
  // antes de que Leaflet intente calcular las dimensiones del contenedor.
  useEffect(() => {
    if (mapReadyTimerRef.current) clearTimeout(mapReadyTimerRef.current);
    if (isOpen) {
      mapReadyTimerRef.current = setTimeout(() => setMapReady(true), 350);
    } else {
      setMapReady(false);
    }
    return () => {
      if (mapReadyTimerRef.current) clearTimeout(mapReadyTimerRef.current);
    };
  }, [isOpen]);

  /** Extrae lat/lng de una URL de Google Maps ya resuelta (larga). */
  function parseGoogleMapsCoords(url: string): { latitude: number; longitude: number } | null {
    // !3d{lat}!4d{lng} — coordenadas exactas del pin/lugar (máxima precisión).
    // Aparece en URLs de lugar específico; es más preciso que @lat,lng (viewport).
    const pinMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (pinMatch) return { latitude: parseFloat(pinMatch[1]), longitude: parseFloat(pinMatch[2]) };

    // @lat,lng[,zoom] — centro del viewport (fallback, menos preciso)
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };

    // ?q=lat,lng  o  &q=lat,lng
    const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) return { latitude: parseFloat(qMatch[1]), longitude: parseFloat(qMatch[2]) };

    // ll=lat,lng
    const llMatch = url.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) return { latitude: parseFloat(llMatch[1]), longitude: parseFloat(llMatch[2]) };

    return null;
  }

  const handleGmapsUrl = async () => {
    const raw = gmapsInput.trim();
    if (!raw) return;
    setGmapsStatus("loading");
    setGmapsError(null);
    try {
      // Intentar parsear directamente primero (URL larga)
      let coords = parseGoogleMapsCoords(raw);
      if (!coords) {
        // URL corta → resolver en el servidor
        const { finalUrl } = await resolveGoogleMapsUrl(raw);
        coords = parseGoogleMapsCoords(finalUrl);
      }
      if (!coords) {
        setGmapsStatus("error");
        setGmapsError("No se encontraron coordenadas en ese enlace. Prueba a copiar el enlace largo desde Google Maps.");
        return;
      }
      setLocation(coords);
      setGmapsStatus("ok");
    } catch (e: unknown) {
      setGmapsStatus("error");
      setGmapsError(e instanceof Error ? e.message : "No se pudo leer el enlace.");
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await updateCleanerProfile({
          nickname: nickname.trim() || null,
          fullName: fullName.trim(),
          phone: phoneDigits || null,
          addressLine1: addressLine1.trim() || null,
          addressLine2: addressLine2.trim() || null,
          neighborhood: neighborhood.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          postalCode: postalCode.trim() || null,
          country: country.trim() || "MX",
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
        });

        setSuccess("Guardado");
        router.refresh();
        onClose();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "No se pudo guardar el perfil";
        setError(msg);
      }
    });
  };

  const addressSummary = (() => {
    const street = addressLine1.trim();
    const interior = addressLine2.trim();
    const combinedStreet = interior ? `${street} Int. ${interior}` : street;
    const parts = [combinedStreet, neighborhood, city, state, postalCode]
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length ? parts.join(", ") : "";
  })();

  const formContent = (
    <div className="px-6 pt-8 pb-4 sm:pb-8 space-y-4">
      {/* Nickname */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-neutral-800">Nickname</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
          placeholder="Ej. Itzel"
        />
        <p className="text-xs text-neutral-500">
          Se mostrará en el menú y en tu equipo (si existe).
        </p>
      </div>

      {/* Nombre completo — abre sub-modal */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-neutral-800">Nombre completo *</label>
        <button
          type="button"
          onClick={() => setIsFullNameOpen(true)}
          className={`w-full text-left rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none hover:bg-neutral-50 transition-colors ${
            !fullName ? "text-neutral-400" : "text-neutral-900"
          }`}
        >
          {fullName || "Agregar nombre completo"}
        </button>
      </div>

      {/* Teléfono con prefijo país */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-neutral-800">Teléfono</label>
        <div className="flex rounded-xl border border-neutral-300 overflow-hidden focus-within:ring-2 focus-within:ring-black/5 focus-within:border-neutral-500 transition">
          {/* Prefijo fijo */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-50 border-r border-neutral-300 shrink-0 select-none">
            <span className="text-base leading-none">🇲🇽</span>
            <span className="text-sm text-neutral-600 font-medium">+52</span>
          </div>
          {/* Número formateado */}
          <input
            type="tel"
            inputMode="numeric"
            value={formatMXPhone(phoneDigits)}
            onChange={(e) => setPhoneDigits(toRawDigits(e.target.value))}
            placeholder="755 120 7337"
            className="flex-1 px-3 py-2 text-base outline-none bg-white"
          />
        </div>
      </div>

      {/* Domicilio */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-neutral-800">Domicilio</label>
        <button
          type="button"
          onClick={() => setIsAddressOpen(true)}
          className={`w-full text-left rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 hover:bg-neutral-50 transition-colors ${
            !addressSummary ? "text-neutral-400" : "text-neutral-900"
          }`}
        >
          {addressSummary || "Agregar domicilio"}
        </button>
      </div>

      {/* Nota entre domicilio y mapa */}
      <p className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5">
        Usamos la ubicación de tu domicilio para poder ofrecerte opciones de trabajo cercanas a ti.
      </p>

      {/* Ubicación en el mapa */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-neutral-800">Ubicación en el mapa</label>
          <p className="text-xs text-neutral-500 mt-0.5">
            Busca tu domicilio en Google Maps, copia el enlace y pégalo aquí.
          </p>
        </div>

        {/* Campo para pegar link de Google Maps */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="url"
              value={gmapsInput}
              onChange={(e) => { setGmapsInput(e.target.value); setGmapsStatus("idle"); setGmapsError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleGmapsUrl(); } }}
              placeholder="https://maps.app.goo.gl/..."
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 transition"
            />
            <button
              type="button"
              onClick={handleGmapsUrl}
              disabled={!gmapsInput.trim() || gmapsStatus === "loading"}
              className="shrink-0 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {gmapsStatus === "loading" ? "…" : "Usar"}
            </button>
          </div>
          {gmapsStatus === "ok" && (
            <p className="text-xs text-green-700">Ubicación actualizada desde Google Maps.</p>
          )}
          {gmapsError && (
            <p className="text-xs text-red-600">{gmapsError}</p>
          )}
        </div>

        <LocationPicker
          value={location}
          onChange={setLocation}
          onModalOpen={mapReady}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {success}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancelar
        </button>
      </div>

      <AddressModal
        open={isAddressOpen}
        onOpenChange={setIsAddressOpen}
        title="Domicilio"
        initialValue={{ addressLine1, addressLine2, neighborhood, city, state, postalCode, country }}
        onSave={(value) => {
          setAddressLine1(value.addressLine1);
          setAddressLine2(value.addressLine2);
          setNeighborhood(value.neighborhood);
          setCity(value.city);
          setState(value.state);
          setPostalCode(value.postalCode);
          setCountry(value.country);
        }}
        mode="auto"
      />
    </div>
  );

  // Móvil: BottomSheet
  if (isMobile) {
    return (
      <>
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Editar perfil" maxHeight="90vh">
          {formContent}
        </BottomSheet>
        {isFullNameOpen && (
          <FullNameModal
            currentFullName={fullName}
            onSave={(v) => { setFullName(v); setIsFullNameOpen(false); }}
            onClose={() => setIsFullNameOpen(false)}
          />
        )}
      </>
    );
  }

  // Desktop: Drawer
  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        style={{ opacity: animateIn ? 1 : 0, transitionDuration: "300ms" }}
      />
      <div
        className="relative w-[460px] max-w-full h-full bg-white shadow-2xl transform transition-transform ease-out rounded-tl-2xl rounded-bl-2xl"
        style={{
          transform: animateIn ? "translateX(0)" : "translateX(100%)",
          transitionDuration: "300ms",
          willChange: "transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-xl font-semibold text-neutral-900">Editar perfil</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 transition rounded-full hover:bg-neutral-100"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-73px)]">{formContent}</div>
      </div>

      {isFullNameOpen && (
        <FullNameModal
          currentFullName={fullName}
          onSave={(v) => { setFullName(v); setIsFullNameOpen(false); }}
          onClose={() => setIsFullNameOpen(false)}
        />
      )}
    </div>
  );
}
