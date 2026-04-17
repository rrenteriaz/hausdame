# Cleaning Operating Model — Source of Truth

## Status

FINAL — Validado en producción (post timezone fix + assignment fix)

---

## 1. Asignación

### Regla principal

Una limpieza está correctamente asignada si:

```
assignedMembershipId != null
```

### Jerarquía

| Rol | Descripción |
|---|---|
| TL (Team Leader) | Responsable lógico — derivado, no persistido |
| Executor (membership) | Quien ejecuta — persistido en `assignedMembershipId` |

### Auto-asignación

Se resuelve **siempre** vía:

```
resolveEffectiveTeamsForProperty
  → resolveAutoAssignment
```

**Orden de resolución:**

1. Preferred (`PropertyAssignmentConfig`)
2. 1 membership activa → asignación automática
3. 0 memberships → `OPEN` + atención
4. 2+ memberships → `OPEN` (requiere decisión manual)

---

## 2. Estados operativos

| Estado | Condición | Resultado |
|---|---|---|
| `ASSIGNED` | `assignedMembershipId != null` | OK |
| `OPEN` | `assignedMembershipId = null` | Atención |
| `IN_PROGRESS` | `status === IN_PROGRESS` | Congelado |
| `COMPLETED` | `status === COMPLETED` | Cerrado |

---

## 3. Atención (⚠️)

### Regla canónica

```
if (assignedMembershipId != null) → NO atención
```

Solo hay atención si:

- No hay team → razón: `NO_ASSIGNED_TEAM`
- Hay team pero no hay member → razón: `NO_ASSIGNED_MEMBER`

### Restricciones absolutas

| Condición | Atención |
|---|---|
| `IN_PROGRESS` | ❌ nunca |
| `COMPLETED` | ❌ nunca |
| Overdue | ❌ no es atención |

---

## 4. Overdue (Vencida)

### Definición

```
status === PENDING && scheduledDate < now()
```

### Comportamiento visual

- Punto rojo
- Sin fondo amarillo
- No es un problema operativo — es un estado temporal

---

## 5. Visual — Host

| Estado | Visual |
|---|---|
| Asignada | Normal / negritas |
| En progreso | Negritas + punto verde |
| Completada | Badge verde |
| Atención | Fondo ámbar |
| Vencida | Punto rojo |

---

## 6. Visual — Cleaner

| Estado | Visual |
|---|---|
| Mía | Texto normal |
| En progreso | Negritas + punto verde |
| Completada | Fondo verde |
| Mía vencida | Punto rojo |
| Disponible | Fondo amarillo |
| Otro cleaner (TL) | Fondo gris |

---

## 7. Regla de prioridad visual

Orden de evaluación (de mayor a menor prioridad):

1. `CANCELLED`
2. `COMPLETED`
3. `IN_PROGRESS`
4. `OVERDUE`
5. `ATTENTION`
6. `NORMAL`

Este orden evita conflictos visuales cuando múltiples condiciones son verdaderas simultáneamente.

---

## 8. Timezone (CRÍTICO)

### Regla canónica

La hora de la limpieza **siempre** es:

```
fecha de checkout (iCal) + checkOutTime de la propiedad
```

### Persistencia

- Se construye con timezone operativa: **America/Mexico_City = UTC-6 permanente** (sin DST desde octubre 2023)
- Se guarda en UTC

**Ejemplo:**

```
11:00 CDMX → 17:00 UTC
"2026-04-19T11:00:00-06:00" → 2026-04-19T17:00:00.000Z
```

---

## 9. Fuente de hora por flujo

| Flujo | Fuente de hora |
|---|---|
| iCal | `Property.checkOutTime` |
| Manual | Input del usuario |
| Batch | `Property.checkOutTime` |
| Reschedule | Input del usuario |

---

## 10. Regla de construcción de fecha

**Siempre usar:**

```typescript
buildCleaningScheduledDate(year, month0indexed, day, hours, minutes)
```

**Prohibido:**

```typescript
new Date(y, m, d, h, min)   // usa timezone local del servidor
setHours(h, m)               // usa timezone local del servidor
new Date("YYYY-MM-DDTHH:mm") // ambiguo sin offset
```

---

## 11. Congelamiento

Cuando `status === IN_PROGRESS`, no se permiten cambios en:

- `teamId`
- `assignedMembershipId`

---

## 12. Rechazo

Cuando un cleaner declina (`decline`):

```
assignedMembershipId = null
teamId               = sin cambio (se mantiene)
needsAttention       = true
```

---

## 13. Backfill histórico

- Ya aplicado correctamente en producción
- No quedan registros activos con bug de timezone
- Las limpiezas corregidas pasaron de `T11:00:00.000Z` a `T17:00:00.000Z`

---

## 14. Invariantes del sistema

Las siguientes condiciones deben cumplirse **siempre**:

| Invariante |
|---|
| `assignedMembershipId != null` → `needsAttention = false` |
| `status === IN_PROGRESS` → `needsAttention = false` |
| `status === COMPLETED` → `needsAttention = false` |
| `overdue` ≠ `atención` |
| `scheduledDate` siempre correcto en UTC (UTC-6 aplicado) |
