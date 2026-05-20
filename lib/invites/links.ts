/**
 * Utility for generating invitation links consistently across the application.
 * Respects the INVITES_V3 contract and centralizes APP_BASE_URL logic.
 */

/**
 * Gets the base URL for the application.
 * Priority:
 * 1. providedBaseUrl (request/current origin)
 * 2. APP_BASE_URL (canonical)
 * 3. NEXT_PUBLIC_APP_URL (compatibility)
 * 4. window.location.origin (client-only fallback)
 * 5. http://localhost:3000 (development fallback)
 */
export function getBaseUrl(providedBaseUrl?: string): string {
  // 0. Use provided URL if available (from request origin)
  if (providedBaseUrl && providedBaseUrl.trim() !== "") {
    return providedBaseUrl.trim().replace(/\/$/, "");
  }

  // 1. Try canonical environment variable (most reliable)
  const appBaseUrl = process.env.APP_BASE_URL;
  if (appBaseUrl && appBaseUrl.trim() !== "") {
    return appBaseUrl.trim().replace(/\/$/, "");
  }

  // 2. Try public compatibility variable
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicAppUrl && publicAppUrl.trim() !== "") {
    return publicAppUrl.trim().replace(/\/$/, "");
  }

  // 3. Client-side fallback to current origin
  if (typeof window !== "undefined") {
    // Avoid returning "null" or empty origins
    if (window.location.origin && window.location.origin !== "null") {
      return window.location.origin;
    }
  }

  // 4. Production fail-fast
  // Railway often set NODE_ENV=production. Also check common Railway provider variables.
  const isProduction = 
    process.env.NODE_ENV === "production" || 
    !!process.env.RAILWAY_ENVIRONMENT || 
    !!process.env.RAILWAY_ENVIRONMENT_NAME ||
    !!process.env.RAILWAY_STATIC_URL;
  
  if (isProduction) {
    // Log the error for easier debugging in Railway logs
    if (typeof window === "undefined") {
      console.error("CRITICAL: APP_BASE_URL is not configured in production environment.", {
        NODE_ENV: process.env.NODE_ENV,
        RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
        RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL
      });
    }
    
    // We return a slightly more useful error link instead of throwing to prevent a full crash, 
    // but the link will obviously be an error indicator.
    return "https://ERROR_MISSING_APP_BASE_URL";
  }

  // 5. Development fallback
  return "http://localhost:3000";
}

function normalizeLocalHost(host: string): string {
  return host.replace(/^0\.0\.0\.0(?=:\d+$|$)/, "localhost");
}

function normalizeBaseUrl(value: string | null): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!url.protocol.startsWith("http")) return undefined;
    url.host = normalizeLocalHost(url.host);
    return url.origin.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Derives the public origin from an incoming request. Prefer Origin/Referer so
 * local mobile testing keeps the same host the browser is actually using
 * (for example 192.168.x.x:3000 instead of localhost or 0.0.0.0).
 */
export function getInviteRequestBaseUrl(
  headers: Pick<Headers, "get">,
  fallbackOrigin?: string
): string | undefined {
  const origin = normalizeBaseUrl(headers.get("origin"));
  if (origin) return origin;

  const referer = normalizeBaseUrl(headers.get("referer"));
  if (referer) return referer;

  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost || headers.get("host");
  if (host) {
    const forwardedProto = headers.get("x-forwarded-proto") || "http";
    return normalizeBaseUrl(`${forwardedProto}://${normalizeLocalHost(host)}`);
  }

  return normalizeBaseUrl(fallbackOrigin ?? null);
}

export type InviteType = "team" | "property" | "workgroup";

/**
 * Constructs a full invitation link using the centralized base URL.
 */
export function getInviteLink(token: string, type: InviteType = "team", baseUrl?: string): string {
  const finalBaseUrl = getBaseUrl(baseUrl);
  
  switch (type) {
    case "property":
      return `${finalBaseUrl}/join?token=${token}&type=property`;
    case "workgroup":
      return `${finalBaseUrl}/join/host?token=${token}`;
    case "team":
    default:
      return `${finalBaseUrl}/join?token=${token}`;
  }
}
