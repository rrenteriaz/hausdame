"use client";

import { useState, useTransition, useEffect } from "react";
import { updateProperty } from "../actions";
import { useRouter } from "next/navigation";
import HourPicker from "./HourPicker";
import AddressModal, { type AddressModalValue } from "@/lib/ui/AddressModal";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import LocationPicker from "./LocationPicker";

// Lista de zonas horarias IANA comunes (fallback si no se puede detectar)
const COMMON_TIMEZONES = [
  { value: "America/Mexico_City", label: "México (Ciudad de México)" },
  { value: "America/Cancun", label: "México (Cancún)" },
  { value: "America/Mazatlan", label: "México (Mazatlán)" },
  { value: "America/Merida", label: "México (Mérida)" },
  { value: "America/Monterrey", label: "México (Monterrey)" },
  { value: "America/Tijuana", label: "México (Tijuana)" },
  { value: "America/New_York", label: "Estados Unidos (Nueva York)" },
  { value: "America/Chicago", label: "Estados Unidos (Chicago)" },
  { value: "America/Denver", label: "Estados Unidos (Denver)" },
  { value: "America/Los_Angeles", label: "Estados Unidos (Los Ángeles)" },
  { value: "America/Toronto", label: "Canadá (Toronto)" },
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
  { value: "America/Lima", label: "Perú (Lima)" },
  { value: "America/Santiago", label: "Chile (Santiago)" },
  { value: "America/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { value: "Europe/Madrid", label: "España (Madrid)" },
  { value: "Europe/London", label: "Reino Unido (Londres)" },
  { value: "Europe/Paris", label: "Francia (París)" },
  { value: "Europe/Berlin", label: "Alemania (Berlín)" },
  { value: "Asia/Tokyo", label: "Japón (Tokio)" },
  { value: "Asia/Shanghai", label: "China (Shanghái)" },
  { value: "Asia/Dubai", label: "Emiratos Árabes (Dubái)" },
  { value: "Australia/Sydney", label: "Australia (Sídney)" },
];

interface Property {
  id: string;
  name: string;
  shortName?: string | null;
  address?: string | null;
  notes?: string | null;
  icalUrl?: string | null;
  timeZone?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  groupName?: string | null;
  notificationEmail?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  wifiSsid?: string | null;
  wifiPassword?: string | null;
  accessCode?: string | null;
}

interface EditPropertyModalProps {
  property: Property;
  returnTo: string;
}

export default function EditPropertyModal({ property, returnTo }: EditPropertyModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [name, setName] = useState(property.name);
  const [shortName, setShortName] = useState(property.shortName || "");
  const [address, setAddress] = useState(property.address || "");
  const [notes, setNotes] = useState(property.notes || "");
  const [icalUrl, setIcalUrl] = useState(property.icalUrl || "");
  const [timeZone, setTimeZone] = useState(property.timeZone || "");
  const [checkInTime, setCheckInTime] = useState(property.checkInTime || "");
  const [checkOutTime, setCheckOutTime] = useState(property.checkOutTime || "");
  const [groupName, setGroupName] = useState(property.groupName || "");
  const [notificationEmail, setNotificationEmail] = useState(property.notificationEmail || "");
  const [latitude, setLatitude] = useState<number | null>(property.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(property.longitude ?? null);
  const [wifiSsid, setWifiSsid] = useState(property.wifiSsid || "");
  const [wifiPassword, setWifiPassword] = useState(property.wifiPassword || "");
  const [accessCode, setAccessCode] = useState(property.accessCode || "");
  const [detectedTimeZone, setDetectedTimeZone] = useState<string>("");
  const [geocodingBusy, setGeocodingBusy] = useState(false);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualCoordsOpen, setManualCoordsOpen] = useState(false);
  const [manualLat, setManualLat] = useState<string>("");
  const [manualLng, setManualLng] = useState<string>("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string>("");
  const [showGoogleMapsInput, setShowGoogleMapsInput] = useState(false);
  
  // Detectar zona horaria al montar
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setDetectedTimeZone(tz);
      // Si no hay zona horaria guardada, usar la detectada
      if (!property.timeZone && tz) {
        setTimeZone(tz);
      }
    } catch {
      // Fallback si no se puede detectar
      setDetectedTimeZone("America/Mexico_City");
      if (!property.timeZone) {
        setTimeZone("America/Mexico_City");
      }
    }
  }, [property.timeZone]);
  
  const handleOpenAddressModal = () => setIsAddressModalOpen(true);

  const handleGeocodeAddress = async () => {
    if (!address || !address.trim()) {
      setGeocodingError("No hay dirección para ubicar.");
      return;
    }

    if (latitude !== null && longitude !== null) {
      // Ya hay ubicación, no hacer geocoding
      return;
    }

    setGeocodingBusy(true);
    setGeocodingError(null);
    setGeoError(null); // Limpiar error de geolocalización

    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address: address.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setGeocodingError(data.error || "No se pudo ubicar con la dirección. Coloca el pin manualmente.");
        setGeocodingBusy(false);
        return;
      }

      // Actualizar lat/lng y centrar mapa
      setLatitude(data.latitude);
      setLongitude(data.longitude);
      setGeocodingError(null);
    } catch (error: any) {
      console.error("[EditPropertyModal] Geocoding error:", error);
      setGeocodingError("Error al obtener la ubicación. Coloca el pin manualmente.");
    } finally {
      setGeocodingBusy(false);
    }
  };

  const handleUseMyLocation = () => {
    setGeoError(null);
    setGeocodingError(null); // Limpiar error de geocoding
    
    if (!("geolocation" in navigator)) {
      setGeoError("Tu navegador no permite obtener la ubicación. Coloca el pin manualmente en el mapa.");
      return;
    }

    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        setGeoError(null);
        const lat = Math.round(pos.coords.latitude * 1_000_000) / 1_000_000;
        const lng = Math.round(pos.coords.longitude * 1_000_000) / 1_000_000;
        setLatitude(lat);
        setLongitude(lng);
      },
      (err) => {
        setGeoBusy(false);
        setGeoError(
          err?.message
            ? `No se pudo obtener tu ubicación (${err.message}). Coloca el pin manualmente en el mapa.`
            : "No se pudo obtener tu ubicación (permiso o navegador). Coloca el pin manualmente en el mapa."
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  /**
   * Parsea coordenadas desde un URL de Google Maps.
   * PRIORIDAD: pin real (!3d/!4d) sobre centro de cámara (@lat,lng).
   * Soporta formatos:
   * - !3d<lat>!4d<lng> (pin real del lugar - PRIORIDAD)
   * - .../@<lat>,<lng>,... (centro de cámara - fallback)
   * - .../maps?q=<lat>,<lng>
   * - .../search/?api=1&query=<lat>,<lng>
   */
  const parseGoogleMapsUrl = (url: string): { lat: number; lng: number } | null => {
    try {
      // PRIORIDAD 1: Pin real del lugar (!3d<lat>!4d<lng>)
      // Este patrón indica la ubicación exacta del pin que el usuario ve en Google Maps
      const pinMatch = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if (pinMatch) {
        const lat = parseFloat(pinMatch[1]);
        const lng = parseFloat(pinMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng };
        }
      }

      // PRIORIDAD 2: Centro de cámara (@lat,lng) - fallback si no hay pin real
      const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (atMatch) {
        const lat = parseFloat(atMatch[1]);
        const lng = parseFloat(atMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng };
        }
      }

      // PRIORIDAD 3: Query parameter q=<lat>,<lng>
      const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (qMatch) {
        const lat = parseFloat(qMatch[1]);
        const lng = parseFloat(qMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng };
        }
      }

      // PRIORIDAD 4: Query parameter query=<lat>,<lng>
      const queryMatch = url.match(/[?&]query=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (queryMatch) {
        const lat = parseFloat(queryMatch[1]);
        const lng = parseFloat(queryMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng };
        }
      }

      return null;
    } catch {
      return null;
    }
  };

  const handlePasteGoogleMapsUrl = async () => {
    if (!googleMapsUrl.trim()) {
      setGeoError("Por favor pega un link de ubicación.");
      return;
    }

    let urlToParse = googleMapsUrl.trim();

    // Si es un link corto, intentar resolverlo primero
    if (urlToParse.includes("maps.app.goo.gl") || urlToParse.includes("goo.gl")) {
      setGeoError(null);
      try {
        const response = await fetch("/api/resolve-maps-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: urlToParse }),
        });

        const data = await response.json();

        if (response.ok && data.resolvedUrl) {
          urlToParse = data.resolvedUrl;
        } else {
          // Si falla la resolución, intentar parsear el link original
          console.warn("[EditPropertyModal] No se pudo resolver link corto, intentando parsear original");
        }
      } catch (error: any) {
        console.error("[EditPropertyModal] Error resolviendo link:", error);
        // Continuar con parseo del link original
      }
    }

    const coords = parseGoogleMapsUrl(urlToParse);
    
    if (!coords) {
      setGeoError("Link corto sin coordenadas; intenta pegar link largo o lat/lng.");
      return;
    }

    // Validar rangos
    if (coords.lat < -90 || coords.lat > 90) {
      setGeoError("La latitud debe estar entre -90 y 90.");
      return;
    }

    if (coords.lng < -180 || coords.lng > 180) {
      setGeoError("La longitud debe estar entre -180 y 180.");
      return;
    }

    // Aplicar coordenadas
    setLatitude(coords.lat);
    setLongitude(coords.lng);
    setManualLat(coords.lat.toFixed(6));
    setManualLng(coords.lng.toFixed(6));
    setGeoError(null);
    setGeocodingError(null);
    setGoogleMapsUrl("");
    setShowGoogleMapsInput(false);
  };

  const handleApplyManualCoords = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || isNaN(lng)) {
      setGeoError("Por favor ingresa coordenadas válidas.");
      return;
    }

    if (lat < -90 || lat > 90) {
      setGeoError("La latitud debe estar entre -90 y 90.");
      return;
    }

    if (lng < -180 || lng > 180) {
      setGeoError("La longitud debe estar entre -180 y 180.");
      return;
    }

    setLatitude(lat);
    setLongitude(lng);
    setGeoError(null);
    setGeocodingError(null);
    // NO limpiar manualLat/manualLng - mantener valores para que persistan
  };

  const handleOpen = () => {
    // Reset form to current property values
    setName(property.name);
    setShortName(property.shortName || "");
    setAddress(property.address || "");
    setNotes(property.notes || "");
    setIcalUrl(property.icalUrl || "");
    setTimeZone(property.timeZone || "");
    setCheckInTime(property.checkInTime || "");
    setCheckOutTime(property.checkOutTime || "");
    setGroupName(property.groupName || "");
    setNotificationEmail(property.notificationEmail || "");
    setLatitude(property.latitude ?? null);
    setLongitude(property.longitude ?? null);
    setWifiSsid(property.wifiSsid || "");
    setWifiPassword(property.wifiPassword || "");
    setAccessCode(property.accessCode || "");
    setGeocodingError(null); // Reset error al abrir modal
    setGeoError(null);
    setManualCoordsOpen(false);
    setShowGoogleMapsInput(false);
    setGoogleMapsUrl("");
    // Prefill coordenadas manuales con valores actuales si existen
    const currentLat = property.latitude ?? null;
    const currentLng = property.longitude ?? null;
    if (currentLat !== null && currentLng !== null) {
      setManualLat(currentLat.toFixed(6));
      setManualLng(currentLng.toFixed(6));
    } else {
      setManualLat("");
      setManualLng("");
    }
    setIsOpen(true);
  };

  // Abre el modal cuando el card de setup despacha el evento (Continuar configuración).
  // detail.propertyId discrimina si hay múltiples instancias montadas simultáneamente.
  useEffect(() => {
    function onOpenFromSetupCard(e: Event) {
      const { propertyId: targetId } = (e as CustomEvent<{ propertyId: string }>).detail ?? {};
      if (targetId && targetId !== property.id) return;
      handleOpen();
    }
    window.addEventListener("hausdame:open-property-edit", onOpenFromSetupCard);
    return () => window.removeEventListener("hausdame:open-property-edit", onOpenFromSetupCard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id]);

  // Prefill coordenadas manuales cuando se abre la sección colapsable
  const handleManualCoordsToggle = (isOpen: boolean) => {
    if (isOpen) {
      // Si se abre y no hay valores en inputs, prefill con coordenadas actuales si existen
      if ((!manualLat || !manualLng) && latitude !== null && longitude !== null) {
        setManualLat(latitude.toFixed(6));
        setManualLng(longitude.toFixed(6));
      }
    }
    setManualCoordsOpen(isOpen);
  };

  // Sincronizar coordenadas manuales cuando cambian desde otras fuentes (geocoding, ubicación actual, etc.)
  // IMPORTANTE: Los inputs deben reflejar siempre el valor actual guardado cuando existe
  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      // Siempre mantener inputs sincronizados con valores actuales
      const currentLat = parseFloat(manualLat);
      const currentLng = parseFloat(manualLng);
      // Solo actualizar si los valores son significativamente diferentes (más de 0.000001)
      if (isNaN(currentLat) || isNaN(currentLng) || 
          Math.abs(currentLat - latitude) > 0.000001 || 
          Math.abs(currentLng - longitude) > 0.000001) {
        setManualLat(latitude.toFixed(6));
        setManualLng(longitude.toFixed(6));
      }
    } else {
      // Si no hay coordenadas, limpiar solo si los inputs no están siendo editados activamente
      if (manualLat && manualLng && !manualCoordsOpen) {
        setManualLat("");
        setManualLng("");
      }
    }
  }, [latitude, longitude]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("propertyId", property.id);
    formData.append("returnTo", returnTo);
    formData.append("name", name.trim());
    formData.append("shortName", shortName.trim());
    if (address.trim()) formData.append("address", address.trim());
    if (notes.trim()) formData.append("notes", notes.trim());
    if (icalUrl.trim()) formData.append("icalUrl", icalUrl.trim());
    if (timeZone.trim()) formData.append("timeZone", timeZone.trim());
    if (checkInTime.trim()) formData.append("checkInTime", checkInTime.trim());
    if (checkOutTime.trim()) formData.append("checkOutTime", checkOutTime.trim());
    if (groupName.trim()) formData.append("groupName", groupName.trim());
    if (notificationEmail.trim()) formData.append("notificationEmail", notificationEmail.trim());

    // Campos operativos (siempre enviar para permitir limpiar valores)
    formData.append("latitude", latitude === null ? "" : String(latitude));
    formData.append("longitude", longitude === null ? "" : String(longitude));
    formData.append("wifiSsid", wifiSsid.trim());
    formData.append("wifiPassword", wifiPassword);
    formData.append("accessCode", accessCode.trim());

    startTransition(async () => {
      await updateProperty(formData);
      setIsOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-xs text-neutral-600 hover:text-neutral-900 underline underline-offset-2"
      >
        Editar
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-end justify-center p-4 sm:items-center"
          onClick={() => setIsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Editar propiedad</h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-800">
                    Nombre de la propiedad *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                    placeholder="Ej. Céntrico depa en Oaxaca"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-800">
                    Alias corto *
                  </label>
                  <input
                    type="text"
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                    placeholder="Ej. Depa01"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-800">
                    Dirección
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenAddressModal}
                    className={`w-full text-left rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 hover:bg-neutral-50 transition-colors ${
                      !address ? "text-neutral-400" : "text-neutral-900"
                    }`}
                  >
                    {address || "Ej. Centro, Oaxaca de Juárez"}
                  </button>
                </div>

                {/* Sección Ubicación (debajo de Dirección) */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-800">
                    Ubicación
                  </label>
                  <div className="space-y-2">
                    {/* Botones de ubicación: solo si NO hay lat/lng guardada */}
                    {(latitude === null || longitude === null) && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        {address && (
                          <button
                            type="button"
                            onClick={handleGeocodeAddress}
                            disabled={geocodingBusy}
                            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {geocodingBusy ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Ubicando…</span>
                              </>
                            ) : (
                              <span>Ubicar con dirección</span>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleUseMyLocation}
                          disabled={geoBusy}
                          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {geoBusy ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Obteniendo…</span>
                            </>
                          ) : (
                            <span>Usar ubicación actual</span>
                          )}
                        </button>
                      </div>
                    )}
                    
                    {/* Mensajes de error */}
                    {(geocodingError || geoError) && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                        <p className="text-xs text-red-900">{geocodingError || geoError}</p>
                      </div>
                    )}

                    {/* Opción avanzada: Pegar link de ubicación */}
                    <div className="space-y-2">
                      {!showGoogleMapsInput ? (
                        <button
                          type="button"
                          onClick={() => setShowGoogleMapsInput(true)}
                          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition"
                        >
                          Pegar link de ubicación
                        </button>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-medium text-neutral-800">
                              Link de ubicación
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setShowGoogleMapsInput(false);
                                setGoogleMapsUrl("");
                                setGeoError(null);
                              }}
                              className="text-xs text-neutral-500 hover:text-neutral-700"
                            >
                              Cancelar
                            </button>
                          </div>
                          <input
                            type="url"
                            value={googleMapsUrl}
                            onChange={(e) => setGoogleMapsUrl(e.target.value)}
                            placeholder="Pega el link (corto o largo) de Google Maps"
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                          />
                          <p className="text-[10px] text-neutral-600">
                            Acepta links cortos y largos. Si no se detectan coordenadas, pega lat/lng o coloca el pin.
                          </p>
                          <button
                            type="button"
                            onClick={handlePasteGoogleMapsUrl}
                            disabled={!googleMapsUrl.trim()}
                            className="w-full rounded-lg border border-black bg-black px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Aceptar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* LocationPicker */}
                    <LocationPicker
                      value={
                        latitude !== null && longitude !== null
                          ? { latitude, longitude }
                          : null
                      }
                      onChange={(v) => {
                        if (!v) {
                          setLatitude(null);
                          setLongitude(null);
                          setGeocodingError(null);
                          setGeoError(null);
                          return;
                        }
                        setLatitude(v.latitude);
                        setLongitude(v.longitude);
                        setGeocodingError(null);
                        setGeoError(null);
                      }}
                      hideUseMyLocationButton={true}
                      onModalOpen={isOpen}
                      onCollapsibleToggle={manualCoordsOpen}
                    />

                    {/* Sección colapsable: Coordenadas manuales */}
                    <CollapsibleSection 
                      title="Ingresar coordenadas manualmente" 
                      defaultOpen={false}
                      open={manualCoordsOpen}
                      onOpenChange={handleManualCoordsToggle}
                    >
                      <div className="space-y-3 pt-2">
                        {latitude !== null && longitude !== null && (
                          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                            <p className="text-xs text-neutral-700">
                              <strong>Coordenadas actuales:</strong> {latitude.toFixed(6)}, {longitude.toFixed(6)}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-neutral-600">
                          Si conoces las coordenadas exactas, puedes ingresarlas directamente.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-neutral-800">
                              Latitud
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={manualLat}
                              onChange={(e) => setManualLat(e.target.value)}
                              placeholder="Ej. 19.432608"
                              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                            />
                            <p className="text-[10px] text-neutral-500">Rango: -90 a 90</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-neutral-800">
                              Longitud
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={manualLng}
                              onChange={(e) => setManualLng(e.target.value)}
                              placeholder="Ej. -99.133209"
                              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                            />
                            <p className="text-[10px] text-neutral-500">Rango: -180 a 180</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyManualCoords}
                          disabled={!manualLat.trim() || !manualLng.trim()}
                          className="w-full rounded-lg border border-black bg-black px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Aplicar
                        </button>
                      </div>
                    </CollapsibleSection>
                  </div>
                </div>

                {/* Check-in y Check-out en la misma fila */}
                <div className="space-y-1 md:col-span-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-800">
                        Hora de check-in
                      </label>
                      <HourPicker
                        value={checkInTime}
                        onChange={(value) => setCheckInTime(value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-800">
                        Hora de check-out
                      </label>
                      <HourPicker
                        value={checkOutTime}
                        onChange={(value) => setCheckOutTime(value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-800">
                    Grupo
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                    placeholder="Ej. Grupo Centro"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-800">
                    Email de notificaciones
                  </label>
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                    placeholder="notificaciones@ejemplo.com"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-800">
                    URL iCal de Airbnb
                  </label>
                  <input
                    type="url"
                    value={icalUrl}
                    onChange={(e) => setIcalUrl(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                    placeholder="https://www.airbnb.mx/calendar/ical/..."
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-800">
                    Notas
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                    placeholder="Notas adicionales sobre la propiedad"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-800">
                    Zona horaria
                  </label>
                  <select
                    value={timeZone || detectedTimeZone || "America/Mexico_City"}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  {detectedTimeZone && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Detectada: {COMMON_TIMEZONES.find(tz => tz.value === detectedTimeZone)?.label || detectedTimeZone}
                    </p>
                  )}
                </div>
              </div>

              {/* Secciones operativas (Host only) */}
              <div className="pt-2 border-t border-neutral-100 space-y-4">
                <CollapsibleSection title="Conectividad" defaultOpen={false}>
                  <div className="space-y-3">
                    <p className="text-xs text-neutral-600">
                      Tu equipo de limpieza podría no tener datos móviles. Ayúdale a mantenerse conectado compartiendo la red Wi-Fi.
                    </p>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-800">
                        Red Wi‑Fi
                      </label>
                      <input
                        type="text"
                        value={wifiSsid}
                        onChange={(e) => setWifiSsid(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                        placeholder="Ej. MiWifi"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-800">
                        Contraseña Wi‑Fi
                      </label>
                      <input
                        type="text"
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                        placeholder="Ej. contraseña del Wi‑Fi"
                      />
                    </div>
                  </div>
                </CollapsibleSection>

                <CollapsibleSection title="Acceso a la propiedad" defaultOpen={false}>
                  <div className="space-y-3">
                    <p className="text-xs text-neutral-600">
                      Comparte el código o contraseña necesaria para acceder a la propiedad.
                    </p>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-800">
                        Clave de acceso
                      </label>
                      <input
                        type="text"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500"
                        placeholder="Ej. código de chapa electrónica"
                      />
                    </div>
                  </div>
                </CollapsibleSection>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
                <button
                  type="submit"
                  disabled={isPending || !name.trim() || !shortName.trim()}
                  className="flex-1 rounded-lg border border-black bg-black px-4 py-2.5 text-base font-medium text-white hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de dirección */}
      <AddressModal
        open={isAddressModalOpen}
        onOpenChange={setIsAddressModalOpen}
        title="Editar dirección"
        initialCombinedAddress={address}
        onSave={(value: AddressModalValue) => {
          setAddress(value.combinedAddress);
        }}
      />
    </>
  );
}

