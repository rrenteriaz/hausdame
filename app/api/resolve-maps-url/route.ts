// app/api/resolve-maps-url/route.ts
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_DOMAINS = [
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "www.google.com",
  "maps.google.com",
];

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const ACCEPTABLE_LOCATION_TYPES = new Set([
  "ROOFTOP",
  "RANGE_INTERPOLATED",
  "GEOMETRIC_CENTER",
]);

function isValidDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return ALLOWED_DOMAINS.some((domain) => hostname.includes(domain));
  } catch {
    return false;
  }
}

function isShortlink(url: string): boolean {
  return url.includes("maps.app.goo.gl") || url.includes("goo.gl/maps");
}

function isValidCoords(lat: number, lng: number): boolean {
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

type CoordsWithSource = { lat: number; lng: number; source: string };

/**
 * Alta confianza — representa el PIN del lugar, no el viewport de cámara.
 * NO incluye @lat,lng (geo-targeteable por IP del servidor).
 */
function extractHighConfidenceCoords(text: string): CoordsWithSource | null {
  // !3d<lat>!4d<lng> — pin real del lugar en URL larga
  const pinMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng, source: "!3d/!4d" };
  }

  // Parámetros estructurados: ?q= / ?ll= / ?query=
  for (const param of ["q", "ll", "query"]) {
    const re = new RegExp(`[?&]${param}=(-?\\d+\\.?\\d*),(-?\\d+\\.?\\d*)`);
    const m = text.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoords(lat, lng)) return { lat, lng, source: `?${param}=` };
    }
  }

  // %212d<lng>%213d<lat> — coordenadas del lugar en HTML body de shortlinks
  // Solo acepta si todos los candidatos convergen al mismo punto
  const pbRe = /%212d(-?\d+\.\d+)%213d(-?\d+\.\d+)/g;
  const pbCandidates: Array<{ lat: number; lng: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pbRe.exec(text)) !== null) {
    const lng = parseFloat(m[1]);
    const lat = parseFloat(m[2]);
    if (isValidCoords(lat, lng)) pbCandidates.push({ lat, lng });
  }
  if (pbCandidates.length > 0) {
    const ref = pbCandidates[0];
    const allSame = pbCandidates.every(
      (c) => Math.abs(c.lat - ref.lat) < 0.001 && Math.abs(c.lng - ref.lng) < 0.001
    );
    if (allSame) return { lat: ref.lat, lng: ref.lng, source: "%212d/%213d" };
    // múltiples candidatos ambiguos — no usar
  }

  return null;
}

/**
 * Baja confianza — viewport de cámara, geo-targeteable por IP del servidor.
 * Solo se usa para URLs largas donde el usuario compartió un viewport explícito,
 * NUNCA para shortlinks maps.app.goo.gl.
 */
function extractViewportCoords(text: string): CoordsWithSource | null {
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng, source: "@lat,lng" };
  }
  return null;
}

// ─── Dirección desde URL de Google Maps ───────────────────────────────────

function extractAddressFromGoogleMapsUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const placeMatch = urlObj.pathname.match(/\/maps\/place\/([^/]+)/);
    if (placeMatch) {
      const decoded = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ");
      if (decoded.length > 3) return decoded;
    }
    const q = urlObj.searchParams.get("q");
    if (q && q.length > 3) return q;
  } catch {}
  return null;
}

// ─── Google Geocoding API ─────────────────────────────────────────────────

type GeocodingResult = {
  lat: number;
  lng: number;
  locationType: string;
  formattedAddress: string;
};

async function geocodeWithGoogle(
  query: string,
  apiKey: string
): Promise<GeocodingResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  const data = await res.json();

  console.log("[GOOGLE_MAPS] google status:", data.status, "| results:", data.results?.length ?? 0);

  if (data.status !== "OK" || !data.results?.length) return null;

  const result = data.results[0];
  const locationType: string = result.geometry?.location_type ?? "UNKNOWN";
  const lat: number = result.geometry?.location?.lat;
  const lng: number = result.geometry?.location?.lng;
  const formattedAddress: string = result.formatted_address ?? "";

  if (!isValidCoords(lat, lng)) return null;
  return { lat, lng, locationType, formattedAddress };
}

// ─── Handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, address } = body as { url: string; address?: string };

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "URL requerida" }, { status: 400 });
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json(
        { error: "URL debe comenzar con http:// o https://" },
        { status: 400 }
      );
    }

    if (!isValidDomain(url)) {
      return NextResponse.json(
        { error: "Dominio no permitido. Solo se aceptan links de Google Maps." },
        { status: 400 }
      );
    }

    const short = isShortlink(url);
    console.log("[GOOGLE_MAPS] input:", url, short ? "(shortlink)" : "(long URL)");

    const response = await fetch(url.trim(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });

    const resolvedUrl = response.url || url;
    const htmlText = await response.text();

    console.log("[GOOGLE_MAPS] resolvedUrl:", resolvedUrl.substring(0, 120));

    // ── A+B+C: alta confianza desde URL final ──────────────────────────────
    const highFromUrl = extractHighConfidenceCoords(resolvedUrl);
    if (highFromUrl) {
      console.log(`[GOOGLE_MAPS] high confidence candidate source: ${highFromUrl.source} (URL)`);
      console.log(`[GOOGLE_MAPS] final coords: ${highFromUrl.lat}, ${highFromUrl.lng}`);
      const { source: _, ...coords } = highFromUrl;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    // ── D: alta confianza desde HTML body ─────────────────────────────────
    const highFromHtml = extractHighConfidenceCoords(htmlText);
    if (highFromHtml) {
      console.log(`[GOOGLE_MAPS] HTML candidate source: ${highFromHtml.source}`);
      console.log(`[GOOGLE_MAPS] final coords: ${highFromHtml.lat}, ${highFromHtml.lng}`);
      const { source: _, ...coords } = highFromHtml;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    // ── E: Google Geocoding API ────────────────────────────────────────────
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      const geocodingQuery =
        extractAddressFromGoogleMapsUrl(resolvedUrl) ?? address ?? null;

      if (geocodingQuery) {
        console.log("[GOOGLE_MAPS] strategy used: Google Geocoding API | query:", geocodingQuery);

        const geo = await geocodeWithGoogle(geocodingQuery, apiKey);

        if (geo) {
          console.log(`[GOOGLE_MAPS] final coords: ${geo.lat}, ${geo.lng}`);
          console.log(`[GOOGLE_MAPS] confidence/reason: ${geo.locationType} — ${geo.formattedAddress}`);

          if (ACCEPTABLE_LOCATION_TYPES.has(geo.locationType)) {
            return NextResponse.json({
              resolvedUrl,
              coordinates: { lat: geo.lat, lng: geo.lng },
            });
          }

          console.warn(`[GOOGLE_MAPS] confidence/reason: ${geo.locationType} — rechazando (muy impreciso)`);
          return NextResponse.json(
            { error: "Ubicación ambigua. Intenta con un link más específico o coordenadas directas." },
            { status: 422 }
          );
        }
      }
    }

    // ── F: @lat,lng — solo para URLs largas, nunca shortlinks ─────────────
    if (!short) {
      const viewport = extractViewportCoords(resolvedUrl);
      if (viewport) {
        console.log(`[GOOGLE_MAPS] viewport candidate ignored for shortlink: false`);
        console.log(`[GOOGLE_MAPS] final coords: ${viewport.lat}, ${viewport.lng} (viewport fallback)`);
        const { source: _, ...coords } = viewport;
        return NextResponse.json({ resolvedUrl, coordinates: coords });
      }
    } else {
      const viewport = extractViewportCoords(resolvedUrl);
      if (viewport) {
        console.log(`[GOOGLE_MAPS] viewport candidate ignored: @lat,lng en shortlink ignorado (geo-targeteable)`);
      }
    }

    console.error("[GOOGLE_MAPS] final coords: ninguna con suficiente confianza");
    return NextResponse.json(
      { error: "No se encontraron coordenadas en este link." },
      { status: 422 }
    );
  } catch (error: any) {
    console.error("[GOOGLE_MAPS] Error:", error.message);
    return NextResponse.json({ error: "Error al resolver el link" }, { status: 500 });
  }
}
