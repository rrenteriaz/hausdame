// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server";

// Patrones de unidades de vivienda a remover para geocoding
const UNIT_PATTERNS = [
  /\s*,?\s*(?:Int\.?|Interior)\s*(?:Condominio|Condo|Torre|Edificio|Piso|Depto\.?|Departamento|Apt\.?|Apartamento|Suite|Unidad|Unit|Local)\s+[\w\d-]+/gi,
  /\s*,?\s*(?:Int\.?|Interior)\s*[\w\d-]+/gi,
  /\s*,?\s*(?:Edificio|Edif\.?)\s+[\w\d-]+/gi,
  /\s*,?\s*(?:Departamento|Depto\.?|Dpto\.?)\s+[\w\d-]+/gi,
  /\s*,?\s*(?:Apartamento|Apt\.?)\s+[\w\d-]+/gi,
  /\s*,?\s*(?:Piso|P\.?)\s+[\w\d-]+/gi,
  /\s*,?\s*(?:Torre)\s+[\w\d-]+/gi,
  /\s*,?\s*(?:Suite)\s+[\w\d-]+/gi,
  /\s*,?\s*#\s*[\w\d-]+/gi,
];

function normalizeAddress(address: string): string {
  let normalized = address.trim();
  for (const pattern of UNIT_PATTERNS) {
    normalized = normalized.replace(pattern, "").trim();
  }
  // Limpiar comas múltiples o finales
  normalized = normalized.replace(/,\s*,/g, ",").replace(/,\s*$/, "").trim();
  return normalized;
}

function simplifyAddress(address: string): string {
  // Quitar CP (últimos 4-5 dígitos sueltos o con prefijo CP)
  let simplified = address.replace(/\s*(?:CP|C\.P\.?|Código Postal)\s*\d{4,5}.*$/gi, "").trim();
  simplified = simplified.replace(/\s+\d{4,5}(?:\s*,|\s*$)/g, " ").trim();
  simplified = simplified.replace(/,\s*$/, "").trim();
  return simplified;
}

async function geocodeWithGoogle(address: string): Promise<{
  latitude: number;
  longitude: number;
  displayName: string;
} | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[geocode] GOOGLE_MAPS_API_KEY not set — skipping Google geocoding");
    return null;
  }

  const params = new URLSearchParams({
    address,
    key: apiKey,
    language: "es",
    region: "mx",
  });

  console.log("[geocode] Google query:", address.substring(0, 120));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("[geocode] Google HTTP error:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    console.log("[geocode] Google status:", data.status, "| results:", data.results?.length ?? 0, "| error_message:", data.error_message ?? "none");

    if (data.status === "REQUEST_DENIED") {
      console.error("[geocode] Google REQUEST_DENIED — API key inválida, deshabilitada o sin permiso para Geocoding API:", data.error_message);
      return null;
    }

    if (data.status === "OVER_DAILY_LIMIT" || data.status === "OVER_QUERY_LIMIT") {
      console.error("[geocode] Google quota exceeded:", data.status);
      return null;
    }

    if (data.status !== "OK" || !data.results?.length) {
      console.log("[geocode] Google ZERO_RESULTS or non-OK status:", data.status);
      return null;
    }

    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    console.log("[geocode] Google result:", result.formatted_address, "→", lat, lng);

    return {
      latitude: lat,
      longitude: lng,
      displayName: result.formatted_address || address,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("TIMEOUT");
    console.error("[geocode] Google fetch error:", err.message);
    throw err;
  }
}

async function geocodeWithNominatim(
  address: string,
  isRetry = false
): Promise<{ latitude: number; longitude: number; displayName: string } | null> {
  const lowerAddress = address.toLowerCase();
  const queryAddress =
    !lowerAddress.includes("méxico") && !lowerAddress.includes("mexico")
      ? `${address}, México`
      : address;

  const params = new URLSearchParams({
    format: "json",
    q: queryAddress,
    limit: "3",
    addressdetails: "1",
    "accept-language": "es",
    countrycodes: "mx",
  });

  console.log(`[geocode] Nominatim ${isRetry ? "RETRY" : "PRIMARY"}: ${queryAddress.substring(0, 120)}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": "Hausdame/1.0 (https://hausdame.app; contact@hausdame.app)",
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("[geocode] Nominatim HTTP error:", response.status);
      return null;
    }

    const data = await response.json();
    console.log("[geocode] Nominatim results:", Array.isArray(data) ? data.length : "non-array");

    if (!Array.isArray(data) || data.length === 0) return null;

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    if (isNaN(lat) || isNaN(lon)) return null;

    console.log("[geocode] Nominatim result:", result.display_name?.substring(0, 80), "→", lat, lon);
    return { latitude: lat, longitude: lon, displayName: result.display_name || address };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("TIMEOUT");
    throw err;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    console.log("[geocode] Received address:", address?.substring(0, 120));

    if (!address || typeof address !== "string" || !address.trim()) {
      return NextResponse.json({ error: "Dirección requerida" }, { status: 400 });
    }
    if (address.length > 500) {
      return NextResponse.json({ error: "Dirección demasiado larga" }, { status: 400 });
    }

    // PASO 1: normalizar (quitar unidades interiores: Int., Edificio, Depto, etc.)
    const normalized = normalizeAddress(address);
    console.log("[geocode] Normalized:", normalized.substring(0, 120));

    if (!normalized) {
      return NextResponse.json({ error: "Dirección inválida" }, { status: 400 });
    }

    // PASO 2: Google con dirección normalizada
    try {
      const result = await geocodeWithGoogle(normalized);
      if (result) return NextResponse.json(result);
    } catch (err: any) {
      if (err.message === "TIMEOUT") {
        return NextResponse.json(
          { error: "Tiempo de espera agotado. Coloca el pin manualmente o usa tu ubicación actual." },
          { status: 504 }
        );
      }
      console.error("[geocode] Google unexpected error:", err);
    }

    // PASO 3: Google con dirección simplificada (sin CP)
    const simplified = simplifyAddress(normalized);
    if (simplified !== normalized && simplified.trim()) {
      console.log("[geocode] Trying simplified:", simplified.substring(0, 120));
      try {
        const result = await geocodeWithGoogle(simplified);
        if (result) return NextResponse.json(result);
      } catch (err: any) {
        if (err.message === "TIMEOUT") {
          return NextResponse.json(
            { error: "Tiempo de espera agotado. Coloca el pin manualmente o usa tu ubicación actual." },
            { status: 504 }
          );
        }
      }
    }

    // PASO 4: Nominatim con dirección normalizada
    try {
      const result = await geocodeWithNominatim(normalized);
      if (result) return NextResponse.json(result);
    } catch (err: any) {
      if (err.message === "TIMEOUT") {
        return NextResponse.json(
          { error: "Tiempo de espera agotado. Coloca el pin manualmente o usa tu ubicación actual." },
          { status: 504 }
        );
      }
    }

    // PASO 5: Nominatim con dirección simplificada
    if (simplified !== normalized && simplified.trim()) {
      try {
        const result = await geocodeWithNominatim(simplified, true);
        if (result) return NextResponse.json(result);
      } catch {
        // ignorar
      }
    }

    console.log("[geocode] All methods failed for:", normalized.substring(0, 80));
    return NextResponse.json(
      { error: "No se encontró ubicación para esta dirección. Intenta con una versión más simple (solo calle, colonia y ciudad) o coloca el pin manualmente." },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("[geocode] Unhandled error:", error);
    return NextResponse.json({ error: "Error interno al geocodificar." }, { status: 500 });
  }
}
