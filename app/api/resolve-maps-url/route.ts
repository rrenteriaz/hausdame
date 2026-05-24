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

function isValidDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return ALLOWED_DOMAINS.some((domain) => hostname.includes(domain));
  } catch {
    return false;
  }
}

function extractCoordsFromText(text: string): { lat: number; lng: number } | null {
  // Formato pin/lugar: !3d<lat>!4d<lng>  (URL larga estándar)
  const pinMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (isFinite(lat) && isFinite(lng)) return { lat, lng };
  }

  // Formato viewport: @<lat>,<lng>,<zoom>  (URL larga estándar)
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isFinite(lat) && isFinite(lng)) return { lat, lng };
  }

  // Formato query param: ?q=<lat>,<lng>
  const qMatch = text.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isFinite(lat) && isFinite(lng)) return { lat, lng };
  }

  // Formato HTML body URL-encoded: %212d<lng>%213d<lat>
  // Google Maps shortlinks resuelven a páginas donde las coords están en el pb param
  const pbMatch = text.match(/%212d(-?\d+\.\d+)%213d(-?\d+\.\d+)/);
  if (pbMatch) {
    const lng = parseFloat(pbMatch[1]);
    const lat = parseFloat(pbMatch[2]);
    if (isFinite(lat) && isFinite(lng)) return { lat, lng };
  }

  return null;
}

function isValidCoords(coords: { lat: number; lng: number }): boolean {
  return coords.lat >= -90 && coords.lat <= 90 && coords.lng >= -180 && coords.lng <= 180;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

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

    const response = await fetch(url.trim(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });

    const resolvedUrl = response.url || url;
    const htmlText = await response.text();

    // Intentar extraer coordenadas de la URL final primero, luego del HTML
    const coords =
      extractCoordsFromText(resolvedUrl) ?? extractCoordsFromText(htmlText);

    if (!coords || !isValidCoords(coords)) {
      console.error("[resolve-maps-url] No se encontraron coordenadas en:", resolvedUrl);
      return NextResponse.json(
        { error: "No se encontraron coordenadas en este link." },
        { status: 422 }
      );
    }

    return NextResponse.json({ resolvedUrl, coordinates: coords });
  } catch (error: any) {
    console.error("[resolve-maps-url] Error:", error.message);
    return NextResponse.json({ error: "Error al resolver el link" }, { status: 500 });
  }
}
