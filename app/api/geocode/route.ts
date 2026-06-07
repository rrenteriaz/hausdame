// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server";

async function geocodeWithGoogle(address: string): Promise<{ latitude: number; longitude: number; displayName: string } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    address,
    key: apiKey,
    language: "es",
    region: "mx",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();

    if (data.status !== "OK" || !data.results?.length) return null;

    const result = data.results[0];
    const { lat, lng } = result.geometry.location;

    return {
      latitude: lat,
      longitude: lng,
      displayName: result.formatted_address || address,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("TIMEOUT");
    throw err;
  }
}

function normalizeAddress(address: string): string {
  let normalized = address.trim();
  normalized = normalized.replace(/\s*(?:Int\.?|Interior|#)\s*\d+/gi, "").trim();
  normalized = normalized.replace(/\s*,\s*Int\.?\s*\d*/gi, "").trim();
  return normalized;
}

function simplifyAddress(address: string): string {
  let simplified = address.replace(/\s*(?:CP|C\.P\.?|Código Postal)\s*\d{4,5}.*$/gi, "").trim();
  simplified = simplified.replace(/\s+\d{4,5}(?:\s|$)/g, " ").trim();
  return simplified;
}

async function geocodeWithNominatim(address: string, isRetry = false): Promise<{ latitude: number; longitude: number; displayName: string } | null> {
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

  console.warn(`[geocode] Nominatim ${isRetry ? "RETRY" : "PRIMARY"}: ${queryAddress.substring(0, 100)}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

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

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    if (isNaN(lat) || isNaN(lon)) return null;

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

    if (!address || typeof address !== "string" || !address.trim()) {
      return NextResponse.json({ error: "Dirección requerida" }, { status: 400 });
    }
    if (address.length > 500) {
      return NextResponse.json({ error: "Dirección demasiado larga" }, { status: 400 });
    }

    const normalized = normalizeAddress(address);
    if (!normalized) {
      return NextResponse.json({ error: "Dirección inválida" }, { status: 400 });
    }

    // 1. Google Geocoding (preferido)
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
      console.error("[geocode] Google error:", err);
    }

    // 2. Nominatim como fallback
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

    // 3. Reintento Nominatim con dirección simplificada
    const simplified = simplifyAddress(normalized);
    if (simplified !== normalized && simplified.trim()) {
      try {
        const result = await geocodeWithNominatim(simplified, true);
        if (result) return NextResponse.json(result);
      } catch {
        // ignorar timeout en reintento
      }
    }

    return NextResponse.json(
      { error: "No se encontró ubicación para esta dirección. Coloca el pin manualmente o usa tu ubicación actual." },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("[geocode] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener la ubicación." },
      { status: 500 }
    );
  }
}
