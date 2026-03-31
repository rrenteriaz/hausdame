"use client";

import { useEffect, useRef, useState } from "react";
import BottomSheet from "@/lib/ui/BottomSheet";

export type AddressModalValue = {
  // Campos estructurados (compatibles con CleanerProfile)
  addressLine1: string; // Calle y número
  addressLine2: string; // Número interior
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  // Versión combinada (compatibilidad con Property.address)
  combinedAddress: string;
};

type AddressModalInitialValue = Partial<
  Omit<AddressModalValue, "combinedAddress"> & { combinedAddress: string }
>;

interface AddressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string; // default: "Domicilio"
  /**
   * Valores iniciales estructurados (si existen).
   * Si solo tienes un address combinado (Property.address), usa initialCombinedAddress.
   */
  initialValue?: AddressModalInitialValue;
  /**
   * Address combinado para parsear (formato de Propiedades: "calle, colonia, ciudad, estado, cp")
   */
  initialCombinedAddress?: string;
  onSave: (value: AddressModalValue) => Promise<void> | void;
  mode?: "mobile" | "desktop" | "auto";
}

function parseCombinedAddress(addr: string) {
  // MISMA lógica de Propiedades (CreatePropertyForm/EditPropertyModal)
  const parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p);

  const result = {
    streetNumber: "",
    interiorNumber: "",
    neighborhood: "",
    city: "",
    state: "",
    postalCode: "",
  };

  if (parts.length === 0) return result;
  if (parts.length === 1) {
    result.streetNumber = parts[0];
    return result;
  }
  if (parts.length === 2) {
    result.streetNumber = parts[0];
    result.city = parts[1];
    return result;
  }
  if (parts.length === 3) {
    result.streetNumber = parts[0];
    result.neighborhood = parts[1];
    result.city = parts[2];
    return result;
  }
  if (parts.length === 4) {
    result.streetNumber = parts[0];
    result.neighborhood = parts[1];
    result.city = parts[2];
    result.state = parts[3];
    return result;
  }

  // 5 o más: street, neighborhood, city, state, postal code
  result.streetNumber = parts[0];
  result.neighborhood = parts[1];
  result.city = parts[2];
  result.state = parts[3];
  result.postalCode = parts[4];
  return result;
}

export default function AddressModal({
  open,
  onOpenChange,
  title = "Domicilio",
  initialValue,
  initialCombinedAddress,
  onSave,
  mode = "auto",
}: AddressModalProps) {
  const [streetNumber, setStreetNumber] = useState("");
  const [interiorNumber, setInteriorNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("MX");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const effectiveIsMobile = mode === "mobile" ? true : mode === "desktop" ? false : isMobile;

  // Inicializar campos al abrir (misma idea que parseAddress + reset)
  useEffect(() => {
    if (!open) return;

    setError(null);

    // Reset
    setStreetNumber("");
    setInteriorNumber("");
    setNeighborhood("");
    setCity("");
    setState("");
    setPostalCode("");
    setCountry("MX");

    // Preferir initialValue estructurado si viene
    if (initialValue) {
      if (initialValue.addressLine1) setStreetNumber(initialValue.addressLine1);
      if (initialValue.addressLine2) setInteriorNumber(initialValue.addressLine2);
      if (initialValue.neighborhood) setNeighborhood(initialValue.neighborhood);
      if (initialValue.city) setCity(initialValue.city);
      if (initialValue.state) setState(initialValue.state);
      if (initialValue.postalCode) setPostalCode(initialValue.postalCode);
      if (initialValue.country) setCountry(initialValue.country);
    } else if (initialCombinedAddress && initialCombinedAddress.trim()) {
      const parsed = parseCombinedAddress(initialCombinedAddress);
      setStreetNumber(parsed.streetNumber);
      setInteriorNumber(parsed.interiorNumber);
      setNeighborhood(parsed.neighborhood);
      setCity(parsed.city);
      setState(parsed.state);
      setPostalCode(parsed.postalCode);
    }
  }, [open, initialValue, initialCombinedAddress]);

  // Lifecycle para drawer desktop
  useEffect(() => {
    if (effectiveIsMobile) return;

    if (open) {
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
  }, [open, effectiveIsMobile]);

  // Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    if (open) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  const buildCombinedAddress = () => {
    let streetAndNumber = streetNumber.trim();
    if (interiorNumber.trim()) {
      streetAndNumber += ` Int. ${interiorNumber.trim()}`;
    }

    const addressParts = [streetAndNumber, neighborhood, city, state, postalCode].filter(
      (part) => part.trim() !== ""
    );

    return addressParts.join(", ");
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const combinedAddress = buildCombinedAddress();

      await onSave({
        addressLine1: streetNumber.trim(),
        addressLine2: interiorNumber.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
        country: country.trim() || "MX",
        combinedAddress,
      });

      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar el domicilio";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-neutral-800">
          Calle y número
        </label>
        <input
          type="text"
          value={streetNumber}
          onChange={(e) => setStreetNumber(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
          placeholder="Ej. Calle Principal #123"
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-neutral-800">
          Número interior
        </label>
        <input
          type="text"
          value={interiorNumber}
          onChange={(e) => setInteriorNumber(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
          placeholder="Ej. A, 2B, 301"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-neutral-800">
          Colonia
        </label>
        <input
          type="text"
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
          placeholder="Ej. Centro"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-neutral-800">
          Ciudad
        </label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
          placeholder="Ej. Oaxaca de Juárez"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-neutral-800">
          Estado
        </label>
        <input
          type="text"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
          placeholder="Ej. Oaxaca"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-neutral-800">
          C.P.
        </label>
        <input
          type="text"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
          placeholder="Ej. 68000"
        />
      </div>

      {/* country existe en CleanerProfile; no lo exponemos para no cambiar UX */}
      <input type="hidden" value={country} onChange={() => {}} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-4 mt-4 border-t border-neutral-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={isSaving}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  if (effectiveIsMobile) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={() => onOpenChange(false)}
        title={title}
        maxHeight="90vh"
        zIndex="z-[2001]"
      >
        <div className="px-6 pt-8 pb-4 sm:pb-8">{content}</div>
      </BottomSheet>
    );
  }

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[2001] flex items-center justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        style={{ opacity: animateIn ? 1 : 0, transitionDuration: "300ms" }}
      />

      <div
        className="relative w-[420px] max-w-full h-full bg-white shadow-2xl transform transition-transform ease-out rounded-tl-2xl rounded-bl-2xl"
        style={{
          transform: animateIn ? "translateX(0)" : "translateX(100%)",
          transitionDuration: "300ms",
          willChange: "transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 transition rounded-full hover:bg-neutral-100"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-73px)]">
          <div className="px-6 py-4">{content}</div>
        </div>
      </div>
    </div>
  );
}


