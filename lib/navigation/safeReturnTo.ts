/**
 * Helper para validar y sanitizar rutas de retorno (returnTo) en navegación Host.
 * 
 * Garantiza que el returnTo pertenece a un set permitido de rutas del scope Host,
 * previniendo navegación a rutas externas o no autorizadas.
 * 
 * @param input - String de returnTo desde query params (puede estar codificado)
 * @param fallback - Ruta de fallback si input no es válido (default: "/host/properties")
 * @returns Ruta validada o fallback
 */
export function safeReturnTo(
  input?: string | null,
  fallback: string = "/host/properties"
): string {
  if (!input) return fallback;

  // Next.js ya decodifica automáticamente los query params
  // Pero por seguridad, intentamos decodificar si parece estar codificado
  let decoded = input;
  try {
    if (input.includes("%")) {
      decoded = decodeURIComponent(input);
    }
  } catch {
    decoded = input;
  }

  // Extraer solo la ruta base (sin query params anidados) para validar
  const pathOnly = decoded.split("?")[0];

  // Rutas permitidas en scope Host
  const allowedPrefixes = [
    "/host/properties",
    "/host/workgroups",
    "/host/cleanings",
    "/host/reservations",
    "/host/inventory",
  ];

  // Validar que la ruta pertenece a un prefijo permitido
  const isValid = allowedPrefixes.some((prefix) => pathOnly.startsWith(prefix));

  if (isValid) {
    // Retornar el decoded completo (con query params si los tiene)
    return decoded;
  }

  return fallback;
}

