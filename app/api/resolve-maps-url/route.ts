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

// location_type de Google Geocoding que se consideran suficientemente precisos
const ACCEPTABLE_LOCATION_TYPES = new Set([
  "ROOFTOP",
  "RANGE_INTERPOLATED",
  "GEOMETRIC_CENTER",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────

function isValidDomain(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_DOMAINS.some((d) => hostname.toLowerCase().includes(d));
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

type Coords = { lat: number; lng: number };
type CoordsWithSource = Coords & { source: string };

// ─── Extractores de coordenadas desde URL ─────────────────────────────────

/**
 * !8m2!3d<lat>!4d<lng> — coordenada explícita del lugar en la data param.
 * Más específico que !3d/!4d genérico; siempre tiene prioridad máxima.
 */
function extractExplicitPlaceCoords(url: string): CoordsWithSource | null {
  const m = url.match(/!8m2!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (isValidCoords(lat, lng)) return { lat, lng, source: "!8m2!3d/!4d" };
  }
  return null;
}

/**
 * !3d<lat>!4d<lng> — pin del lugar (forma general, sin contexto !8m2).
 */
function extractPinCoords(url: string): CoordsWithSource | null {
  const m = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (isValidCoords(lat, lng)) return { lat, lng, source: "!3d/!4d" };
  }
  return null;
}

/**
 * ?q= / ?ll= / ?query= — coordenadas en parámetros de query.
 */
function extractQueryParamCoords(url: string): CoordsWithSource | null {
  for (const param of ["q", "ll", "query"]) {
    const re = new RegExp(`[?&]${param}=(-?\\d+\\.?\\d*),(-?\\d+\\.?\\d*)`);
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoords(lat, lng)) return { lat, lng, source: `?${param}=` };
    }
  }
  return null;
}

/**
 * @<lat>,<lng> — viewport/cámara de Google Maps.
 * Geo-targeteable por IP del servidor → solo confiable en URLs largas compartidas
 * explícitamente por el usuario, NUNCA en shortlinks.
 */
function extractViewportCoords(url: string): CoordsWithSource | null {
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (isValidCoords(lat, lng)) return { lat, lng, source: "@lat,lng" };
  }
  return null;
}

/**
 * %212d<lng>%213d<lat> — coordenadas en HTML body de shortlinks (pb param).
 * BAJA CONFIANZA: captura el centroide del área, no la dirección exacta.
 * Solo usar si no hay API key y no hay nada más.
 */
function extractHtmlPbCoords(html: string): CoordsWithSource | null {
  const re = /%212d(-?\d+\.\d+)%213d(-?\d+\.\d+)/g;
  const candidates: Coords[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const lng = parseFloat(m[1]);
    const lat = parseFloat(m[2]);
    if (isValidCoords(lat, lng)) candidates.push({ lat, lng });
  }
  if (candidates.length === 0) return null;

  const ref = candidates[0];
  const allSame = candidates.every(
    (c) => Math.abs(c.lat - ref.lat) < 0.001 && Math.abs(c.lng - ref.lng) < 0.001
  );
  return allSame ? { lat: ref.lat, lng: ref.lng, source: "%212d/%213d" } : null;
}

// ─── Google Geocoding API ─────────────────────────────────────────────────

type GeocodingResult = Coords & { locationType: string; formattedAddress: string };

async function geocodeWithGoogle(
  query: string,
  apiKey: string
): Promise<GeocodingResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  const data = await res.json();

  console.log(`[GOOGLE_MAPS] google result: status=${data.status} results=${data.results?.length ?? 0}`);

  if (data.status !== "OK" || !data.results?.length) return null;

  const result = data.results[0];
  const locationType: string = result.geometry?.location_type ?? "UNKNOWN";
  const lat: number = result.geometry?.location?.lat;
  const lng: number = result.geometry?.location?.lng;
  const formattedAddress: string = result.formatted_address ?? "";

  if (!isValidCoords(lat, lng)) return null;
  return { lat, lng, locationType, formattedAddress };
}

function extractAddressFromGoogleMapsUrl(url: string): string | null {
  try {
    const { pathname, searchParams } = new URL(url);
    const placeMatch = pathname.match(/\/maps\/place\/([^/]+)/);
    if (placeMatch) {
      const decoded = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ");
      if (decoded.length > 3) return decoded;
    }
    const q = searchParams.get("q");
    if (q && q.length > 3) return q;
  } catch {}
  return null;
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
      return NextResponse.json({ error: "URL debe comenzar con http:// o https://" }, { status: 400 });
    }
    if (!isValidDomain(url)) {
      return NextResponse.json(
        { error: "Dominio no permitido. Solo se aceptan links de Google Maps." },
        { status: 400 }
      );
    }

    const short = isShortlink(url);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

    console.log("[GOOGLE_MAPS] input:", url, short ? "(shortlink)" : "(long URL)");

    // Seguir redirects y obtener body de una vez
    const response = await fetch(url.trim(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });

    const resolvedUrl = response.url || url;
    const htmlText = await response.text();

    console.log("[GOOGLE_MAPS] resolvedUrl:", resolvedUrl);

    // ── 1. !8m2!3d/!4d — coordenada explícita del lugar (máxima prioridad) ──
    const explicit = extractExplicitPlaceCoords(resolvedUrl);
    if (explicit) {
      console.log(`[GOOGLE_MAPS] exact URL coords: ${explicit.source} → ${explicit.lat}, ${explicit.lng}`);
      console.log(`[GOOGLE_MAPS] final coords: ${explicit.lat}, ${explicit.lng}`);
      const { source: _, ...coords } = explicit;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    // ── 2. !3d/!4d genérico ────────────────────────────────────────────────
    const pin = extractPinCoords(resolvedUrl);
    if (pin) {
      console.log(`[GOOGLE_MAPS] exact URL coords: ${pin.source} → ${pin.lat}, ${pin.lng}`);
      console.log(`[GOOGLE_MAPS] final coords: ${pin.lat}, ${pin.lng}`);
      const { source: _, ...coords } = pin;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    // ── 3. Query params: q/ll/query ────────────────────────────────────────
    const qParam = extractQueryParamCoords(resolvedUrl);
    if (qParam) {
      console.log(`[GOOGLE_MAPS] exact URL coords: ${qParam.source} → ${qParam.lat}, ${qParam.lng}`);
      console.log(`[GOOGLE_MAPS] final coords: ${qParam.lat}, ${qParam.lng}`);
      const { source: _, ...coords } = qParam;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    // ── 4. @lat,lng — viewport, solo para URLs largas (no shortlinks) ──────
    if (!short) {
      const viewport = extractViewportCoords(resolvedUrl);
      if (viewport) {
        console.log(`[GOOGLE_MAPS] exact URL coords: ${viewport.source} → ${viewport.lat}, ${viewport.lng}`);
        console.log(`[GOOGLE_MAPS] final coords: ${viewport.lat}, ${viewport.lng}`);
        const { source: _, ...coords } = viewport;
        return NextResponse.json({ resolvedUrl, coordinates: coords });
      }
    } else {
      const viewport = extractViewportCoords(resolvedUrl);
      if (viewport) {
        console.log(`[GOOGLE_MAPS] viewport candidate ignored: @lat,lng en shortlink ignorado (geo-targeteable por IP)`);
      }
    }

    // ── 5. Google Geocoding API ────────────────────────────────────────────
    if (apiKey) {
      const geocodingQuery =
        extractAddressFromGoogleMapsUrl(resolvedUrl) ?? address ?? null;

      console.log("[GOOGLE_MAPS] geocoding query:", geocodingQuery ?? "(ninguna)");

      if (geocodingQuery) {
        const geo = await geocodeWithGoogle(geocodingQuery, apiKey);

        if (geo) {
          if (ACCEPTABLE_LOCATION_TYPES.has(geo.locationType)) {
            console.log(`[GOOGLE_MAPS] final coords: ${geo.lat}, ${geo.lng} [${geo.locationType}] ${geo.formattedAddress}`);
            return NextResponse.json({ resolvedUrl, coordinates: { lat: geo.lat, lng: geo.lng } });
          }
          console.warn(`[GOOGLE_MAPS] google result: ${geo.locationType} — rechazado (demasiado impreciso)`);
          return NextResponse.json(
            { error: "Ubicación ambigua. Intenta con un link más específico o coordenadas directas." },
            { status: 422 }
          );
        }
      }
    } else {
      console.log("[GOOGLE_MAPS] geocoding query: omitida (GOOGLE_MAPS_API_KEY no configurada)");
    }

    // ── 6. HTML body %212d/%213d — último recurso, baja confianza ──────────
    const htmlPb = extractHtmlPbCoords(htmlText);
    if (htmlPb) {
      console.log(`[GOOGLE_MAPS] html fallback candidate: ${htmlPb.source} → ${htmlPb.lat}, ${htmlPb.lng}`);
      console.log(`[GOOGLE_MAPS] final coords: ${htmlPb.lat}, ${htmlPb.lng} (baja confianza — sin API key)`);
      const { source: _, ...coords } = htmlPb;
      return NextResponse.json({ resolvedUrl, coordinates: coords });
    }

    console.error("[GOOGLE_MAPS] final coords: ninguna — 422");
    return NextResponse.json(
      { error: "No se encontraron coordenadas en este link." },
      { status: 422 }
    );
  } catch (error: any) {
    console.error("[GOOGLE_MAPS] Error:", error.message);
    return NextResponse.json({ error: "Error al resolver el link" }, { status: 500 });
  }
}
