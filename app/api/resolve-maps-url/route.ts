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

// location_type que se consideran suficientemente confiables para guardar
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

function isValidCoords(lat: number, lng: number): boolean {
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// ─── Extractores de coordenadas desde texto (URL o HTML) ───────────────────

type CoordsWithSource = { lat: number; lng: number; source: string };

function extractCoordsFromText(text: string): CoordsWithSource | null {
  // A. Pin real del lugar: !3d<lat>!4d<lng>
  const pinMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng, source: "!3d/!4d" };
  }

  // B. Viewport: @<lat>,<lng>
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng, source: "@lat,lng" };
  }

  // C. Query params: ?q= o ?ll=
  for (const param of ["q", "ll"]) {
    const re = new RegExp(`[?&]${param}=(-?\\d+\\.?\\d*),(-?\\d+\\.?\\d*)`);
    const m = text.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoords(lat, lng)) return { lat, lng, source: `?${param}=` };
    }
  }

  // D. HTML pb param URL-encoded: %212d<lng>%213d<lat>
  // Requiere consenso: si hay múltiples candidatos distintos, rechazar
  const pbRe = /%212d(-?\d+\.\d+)%213d(-?\d+\.\d+)/g;
  const pbCandidates: Array<{ lat: number; lng: number }> = [];
  let pbMatch: RegExpExecArray | null;
  while ((pbMatch = pbRe.exec(text)) !== null) {
    const lng = parseFloat(pbMatch[1]);
    const lat = parseFloat(pbMatch[2]);
    if (isValidCoords(lat, lng)) pbCandidates.push({ lat, lng });
  }

  if (pbCandidates.length > 0) {
    const ref = pbCandidates[0];
    const allSame = pbCandidates.every(
      (c) => Math.abs(c.lat - ref.lat) < 0.001 && Math.abs(c.lng - ref.lng) < 0.001
    );
    if (allSame) return { lat: ref.lat, lng: ref.lng, source: "%212d/%213d" };
  }

  return null;
}

// ─── Extraer dirección del path de una URL de Google Maps ──────────────────

function extractAddressFromGoogleMapsUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // /maps/place/DIRECCIÓN/data=...
    const placeMatch = urlObj.pathname.match(/\/maps\/place\/([^/]+)/);
    if (placeMatch) {
      const decoded = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ");
      if (decoded.length > 3) return decoded;
    }

    // ?q=DIRECCIÓN
    const q = urlObj.searchParams.get("q");
    if (q && q.length > 3) return q;
  } catch {}
  return null;
}

// ─── Google Geocoding API ──────────────────────────────────────────────────

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

// ─── Handler principal ────────────────────────────────────────────────────

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

    console.log("[GOOGLE_MAPS] input:", url);
    if (address) console.log("[GOOGLE_MAPS] address context:", address);

    // ── Resolver URL (sigue redirects) y leer body de una vez ──
    const response = await fetch(url.trim(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });

    const resolvedUrl = response.url || url;
    const htmlText = await response.text();

    // ── Estrategias A-D: extracción sin Google API ──
    const urlCoords = extractCoordsFromText(resolvedUrl);
    if (urlCoords) {
      console.log(`[GOOGLE_MAPS] strategy used: ${urlCoords.source} (URL)`);
      console.log(`[GOOGLE_MAPS] final lat/lng: ${urlCoords.lat}, ${urlCoords.lng}`);
      console.log(`[GOOGLE_MAPS] confidence/reason: embed coords in URL — high`);
      const { source: _, ...coords } = urlCoords;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    const htmlCoords = extractCoordsFromText(htmlText);
    if (htmlCoords) {
      console.log(`[GOOGLE_MAPS] strategy used: ${htmlCoords.source} (HTML)`);
      console.log(`[GOOGLE_MAPS] final lat/lng: ${htmlCoords.lat}, ${htmlCoords.lng}`);
      console.log(`[GOOGLE_MAPS] confidence/reason: embed coords in HTML body — high`);
      const { source: _, ...coords } = htmlCoords;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    // ── Estrategia E: Google Geocoding API como fallback ──
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("[GOOGLE_MAPS] strategy used: none — GOOGLE_MAPS_API_KEY no configurada");
      return NextResponse.json(
        { error: "No se encontraron coordenadas en este link." },
        { status: 422 }
      );
    }

    // Candidatos de geocodificación por prioridad
    const placeFromUrl = extractAddressFromGoogleMapsUrl(resolvedUrl);
    const geocodingQuery = placeFromUrl ?? address ?? null;

    if (!geocodingQuery) {
      console.error("[GOOGLE_MAPS] strategy used: Google Geocoding — sin query disponible");
      return NextResponse.json(
        { error: "No se encontraron coordenadas ni dirección para geocodificar." },
        { status: 422 }
      );
    }

    console.log("[GOOGLE_MAPS] strategy used: Google Geocoding API");
    console.log("[GOOGLE_MAPS] geocoding query:", geocodingQuery);

    const geo = await geocodeWithGoogle(geocodingQuery, apiKey);

    if (!geo) {
      console.error("[GOOGLE_MAPS] confidence/reason: ZERO_RESULTS o error de red");
      return NextResponse.json(
        { error: "Google no encontró coordenadas para este link." },
        { status: 422 }
      );
    }

    console.log(`[GOOGLE_MAPS] final lat/lng: ${geo.lat}, ${geo.lng}`);
    console.log(`[GOOGLE_MAPS] confidence/reason: ${geo.locationType} — ${geo.formattedAddress}`);

    if (!ACCEPTABLE_LOCATION_TYPES.has(geo.locationType)) {
      console.warn(`[GOOGLE_MAPS] confidence/reason: ${geo.locationType} — demasiado impreciso, rechazando`);
      return NextResponse.json(
        { error: "Ubicación ambigua. Intenta con un link más específico o coordenadas directas." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      resolvedUrl,
      coordinates: { lat: geo.lat, lng: geo.lng },
    });
  } catch (error: any) {
    console.error("[GOOGLE_MAPS] Error:", error.message);
    return NextResponse.json({ error: "Error al resolver el link" }, { status: 500 });
  }
}
