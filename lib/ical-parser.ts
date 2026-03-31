/**
 * Parser de iCal para Airbnb
 * Convierte VEVENTs de iCal a objetos internos de Reservation
 */

import ical from "node-ical";

export interface ParsedIcalEvent {
  uid: string;
  summary: string;
  startDate: Date;
  endDate: Date;
  description?: string;
}

export interface ParsedReservation {
  calendarUid: string;
  startDate: Date;
  endDate: Date;
  status: "CONFIRMED" | "BLOCKED";
  reservationCodeCalendar?: string;
  guestPhoneLast4?: string;
}

/**
 * Extrae el código de reserva de la URL en la DESCRIPTION
 * Ejemplo: "Reservation URL: https://www.airbnb.com/rooms/123456/details/HMS12345"
 * Retorna: "HMS12345"
 */
function extractReservationCode(description: string): string | undefined {
  if (!description) return undefined;

  // Buscar patrón /details/HMSXXXXX
  const match = description.match(/\/details\/([A-Z0-9]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Extrae los últimos 4 dígitos del teléfono de la DESCRIPTION
 * Ejemplo: "Phone Number (Last 4 Digits): 1234"
 * Retorna: "1234"
 */
function extractPhoneLast4(description: string): string | undefined {
  if (!description) return undefined;

  // Buscar patrón "Phone Number (Last 4 Digits): ####"
  const match = description.match(/Phone Number \(Last 4 Digits\):\s*(\d{4})/i);
  return match ? match[1] : undefined;
}

/**
 * Parsea un archivo iCal y retorna los eventos como objetos ParsedReservation
 */
export async function parseIcalUrl(icalUrl: string): Promise<ParsedReservation[]> {
  try {
    console.log("[parseIcalUrl] Fetching iCal from:", icalUrl);
    
    // Fetch del iCal
    const response = await fetch(icalUrl, {
      headers: {
        "User-Agent": "Hausdame/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status} ${response.statusText}`);
    }

    const icalText = await response.text();
    console.log("[parseIcalUrl] iCal text length:", icalText.length);
    console.log("[parseIcalUrl] First 500 chars:", icalText.substring(0, 500));

    // Parsear con node-ical
    const events = ical.parseICS(icalText);
    console.log("[parseIcalUrl] Total events parsed:", Object.keys(events).length);

    const reservations: ParsedReservation[] = [];

    for (const key in events) {
      const event = events[key];

      // Solo procesar VEVENTs
      if (event.type !== "VEVENT") {
        console.log(`[parseIcalUrl] Skipping non-VEVENT: ${event.type}`);
        continue;
      }

      // Obtener SUMMARY para determinar si es reserva o bloqueo
      const summary = event.summary || "";
      console.log(`[parseIcalUrl] Event UID: ${event.uid}, SUMMARY: "${summary}"`);
      
      // Airbnb puede usar diferentes formatos de SUMMARY
      const isReserved = summary === "Reserved" || summary.toLowerCase().includes("reserved");
      const isBlocked = summary === "Airbnb (Not available)" || 
                        summary.toLowerCase().includes("not available") ||
                        summary.toLowerCase().includes("blocked");

      // Solo procesar reservas confirmadas o bloqueos
      if (!isReserved && !isBlocked) {
        console.log(`[parseIcalUrl] Skipping event with summary: "${summary}"`);
        continue;
      }

      // Obtener fechas
      // Airbnb usa DTSTART;VALUE=DATE y DTEND;VALUE=DATE (all-day events)
      // DTEND es EXCLUSIVO (representa el día de salida)
      let startDate: Date;
      let endDate: Date;

      if (event.start) {
        startDate = event.start instanceof Date ? event.start : new Date(event.start);
        // Normalizar a medianoche UTC para all-day events (VALUE=DATE)
        startDate.setUTCHours(0, 0, 0, 0);
      } else {
        console.warn(`[parseIcalUrl] Event ${event.uid} sin DTSTART, omitiendo`);
        continue;
      }

      if (event.end) {
        endDate = event.end instanceof Date ? event.end : new Date(event.end);
        // Normalizar a medianoche UTC para all-day events (VALUE=DATE)
        endDate.setUTCHours(0, 0, 0, 0);
        // DTEND es exclusivo, así que ya representa el día de salida correctamente
      } else if (event.start) {
        // Si no hay DTEND, usar DTSTART + 1 día (fallback)
        endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        endDate.setUTCHours(0, 0, 0, 0);
      } else {
        console.warn(`[parseIcalUrl] Event ${event.uid} sin DTEND, omitiendo`);
        continue;
      }

      // Extraer información adicional de DESCRIPTION
      const description = event.description || "";
      const reservationCode = extractReservationCode(description);
      const phoneLast4 = extractPhoneLast4(description);

      const reservation = {
        calendarUid: event.uid || key,
        startDate,
        endDate,
        status: (isReserved ? "CONFIRMED" : "BLOCKED") as "CONFIRMED" | "BLOCKED",
        reservationCodeCalendar: reservationCode,
        guestPhoneLast4: phoneLast4,
      };
      
      console.log(`[parseIcalUrl] Adding reservation:`, {
        uid: reservation.calendarUid,
        startDate: reservation.startDate.toISOString(),
        endDate: reservation.endDate.toISOString(),
        status: reservation.status,
      });
      
      reservations.push(reservation);
    }

    console.log(`[parseIcalUrl] Total reservations parsed: ${reservations.length}`);
    return reservations;
  } catch (error) {
    console.error("[parseIcalUrl] Error parsing iCal:", error);
    throw error;
  }
}

