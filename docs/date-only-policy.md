# Política de campos `@db.Date` en Hausdame

## Qué es un campo `DateTime @db.Date` en Prisma

Prisma mapea `DateTime @db.Date` al tipo `DATE` de PostgreSQL.

- **En BD**: se almacena solo la fecha (`2026-04-22`), sin hora ni timezone.
- **En JavaScript**: Prisma devuelve un objeto `Date` con valor `2026-04-22T00:00:00.000Z` — siempre UTC midnight.

**Campos afectados en este proyecto:**

| Modelo        | Campo          | Semántica                        |
|---------------|----------------|----------------------------------|
| `Cleaning`    | `scheduledDate`| Fecha programada de la limpieza  |
| `Reservation` | `startDate`    | Fecha de check-in (solo fecha)   |
| `Reservation` | `endDate`      | Fecha de check-out (solo fecha)  |

---

## Regla 1 — Nunca tratar como timestamp real

`scheduledDate` **no tiene hora**. El UTC midnight que Prisma devuelve es un artefacto del tipo, no una hora real.

```typescript
// ❌ INCORRECTO — el campo no tiene hora
cleaning.scheduledDate.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
// → muestra "06:00 p.m." en CDMX (UTC midnight = 18:00 local) — ficticio

// ❌ INCORRECTO — misma trampa con toLocaleString
cleaning.scheduledDate.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit" })

// ✅ CORRECTO
import { formatDateOnly } from "@/lib/ui/formatDateOnly";
formatDateOnly(cleaning.scheduledDate) // → "22 abr 2026"
```

Si necesitas mostrar la hora de inicio real de una limpieza, usa `scheduledAtOriginal` (campo `DateTime @db.Timestamptz`).

---

## Regla 2 — Display siempre con `timeZone: "UTC"`

Al formatear un `@db.Date` con `toLocaleDateString` / `toLocaleString`, **siempre** pasar `timeZone: "UTC"`.

Sin `timeZone: "UTC"`, el navegador/servidor convierte UTC midnight al TZ local:
- CDMX (UTC-6): `2026-04-22T00:00:00Z` → `2026-04-21T18:00:00` → muestra **21 abr** en vez de **22 abr**

```typescript
// ❌ INCORRECTO
date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })

// ✅ CORRECTO — helper canónico
import { formatDateOnly, formatDateOnlyShort } from "@/lib/ui/formatDateOnly";
formatDateOnly(date)      // → "22 abr 2026"
formatDateOnlyShort(date) // → "22 abr"
```

---

## Regla 3 — Comparaciones: usar `isPastDateOnly`, nunca `< now`

Comparar un `@db.Date` contra `new Date()` (timestamp actual) da el resultado incorrecto porque:

- A cualquier hora del día, `utcMidnight < now` → **true** → hoy aparece siempre como "vencida"
- Después de midnight UTC (= 6 PM CDMX), `now` ya pertenece al día siguiente en UTC → `utcMidnight < now` sigue siendo true, pero el problema es que las limpiezas de HOY se clasifican como "vencidas" durante **todo el día**

```typescript
// ❌ INCORRECTO — hoy siempre aparece como vencida
const isOverdue = cleaning.scheduledDate < new Date();

// ✅ CORRECTO — compara contra día calendario CDMX, no contra momento actual
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
const isOverdue = isPastDateOnly(new Date(cleaning.scheduledDate));
// → false si scheduledDate es hoy o futuro, true solo si es ayer o antes
```

---

## Regla 4 — Queries: usar UTC midnight de CDMX, nunca `new Date()` directo

Al construir rangos de fecha para queries sobre `@db.Date`, Prisma trunca el `DateTime` al `DATE` UTC.

```typescript
// ❌ INCORRECTO — depende del TZ del servidor; después de 6 PM CDMX trunca a "mañana"
where: { scheduledDate: { gte: new Date() } }

// ❌ INCORRECTO — new Date(year, month, day) crea medianoche local (TZ del servidor)
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// ✅ CORRECTO — UTC midnight del día CDMX actual, servidor-agnóstico
import { getCdmxDate } from "@/lib/datetime/cdmxToday";
const { year, month, day } = getCdmxDate();
const todayUTC = new Date(Date.UTC(year, month, day));
where: { scheduledDate: { gte: todayUTC } }

// ✅ CORRECTO — rangos de mes/período
const monthStart = new Date(Date.UTC(year, month, 1));
const prevMonthEnd = new Date(Date.UTC(year, month, 0)); // day=0 = último día mes anterior
```

---

## Regla 5 — Si necesitas hora real, usa otro campo

| Necesidad              | Campo correcto          | Tipo Prisma       |
|------------------------|-------------------------|-------------------|
| Hora de inicio real    | `scheduledAtOriginal`   | `DateTime @db.Timestamptz` |
| Hora de inicio efectiva| `startedAt`             | `DateTime`        |
| Hora de finalización   | `completedAt`           | `DateTime`        |
| Timestamp de creación  | `createdAt`             | `DateTime`        |

---

## Resumen de helpers canónicos

```typescript
// Display
import { formatDateOnly, formatDateOnlyShort } from "@/lib/ui/formatDateOnly";
formatDateOnly(date)      // "22 abr 2026"  — sin hora, con año
formatDateOnlyShort(date) // "22 abr"       — sin hora, sin año

// Comparación
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
isPastDateOnly(date)  // true solo si la fecha es anterior a hoy CDMX

// Construcción de rangos (server-side)
import { getCdmxDate } from "@/lib/datetime/cdmxToday";
const { year, month, day } = getCdmxDate();
new Date(Date.UTC(year, month, day))       // hoy CDMX como UTC midnight
new Date(Date.UTC(year, month, day - 7))   // hace 7 días
new Date(Date.UTC(year, month, 1))         // primer día del mes
new Date(Date.UTC(year, month, 0))         // último día del mes anterior
```

---

## Tests de regresión

Los helpers tienen tests unitarios en:
- `lib/datetime/__tests__/isPastDateOnly.test.ts`
- `lib/ui/__tests__/formatDateOnly.test.ts`

Ejecutar con: `npx vitest run`
