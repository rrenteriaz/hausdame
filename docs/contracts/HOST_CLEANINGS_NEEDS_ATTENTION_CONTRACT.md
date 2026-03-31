# Limpiezas que requieren atención (Host) — Contrato v1

**Estado:** Canonical  
**Última actualización:** v1.0 — Contrato inicial  
**Alcance:** Host — Página `/host/cleanings/needs-attention`

---

## 1. Propósito de la página

La página "Limpiezas que requieren atención" (`/host/cleanings/needs-attention`) muestra una lista de limpiezas que requieren intervención del Host por problemas de asignación o configuración.

**Objetivo:**
- Centralizar limpiezas que requieren atención en un solo lugar
- Permitir al Host identificar rápidamente qué limpiezas necesitan acción
- Mostrar información clara sobre el estado de asignación usando copy canónico

**NO es:**
- Una herramienta de gestión operativa (eso corresponde a Cleaner)
- Un lugar para asignar limpiezas manualmente (eso se hace en detalle de limpieza)
- Una vista de todas las limpiezas (eso es `/host/cleanings`)

---

## 2. Fuente de verdad

### 2.1 Helpers canónicos (MUST USE)

La página **DEBE** usar los helpers canónicos para determinar el estado de asignación:

- **`getCleaningAssignmentLevel()`** (`lib/cleanings/getCleaningAssignmentLevel.ts`)
  - Determina el nivel de asignación (0-5) según los campos del Cleaning
  - Requiere `hasAvailableTeams` que se obtiene de `resolveAvailableTeamsForProperty()`

- **`resolveAvailableTeamsForProperty()`** (`lib/workgroups/resolveAvailableTeamsForProperty.ts`)
  - Calcula si hay equipos disponibles para la propiedad (UNION de WorkGroups + PropertyTeam)
  - Retorna `teamIds` y breakdown de fuentes

- **`getCleaningsNeedingAttention()`** (`lib/cleaning-needs-attention.ts`)
  - Obtiene la lista de limpiezas que requieren atención según criterios de negocio

### 2.2 Copy canónico

El copy mostrado **DEBE** seguir exactamente el contrato:
- **`docs/contracts/ASSIGNMENT_COPY_V1.md`** — Copy canónico por nivel de asignación

**Regla crítica:** NO inventar textos nuevos. Usar SOLO los 7 mensajes canónicos definidos en el contrato.

---

## 3. Mensajes canónicos por nivel

### 3.1 Tabla: Mensaje → Condición

| Nivel | Título | Mensaje secundario | Condición |
|-------|--------|-------------------|-----------|
| **0** | "Sin equipo disponible" | "Esta propiedad no tiene equipos configurados. Ve a la propiedad para configurar equipos." | `hasAvailableTeams === false` |
| **1** | "Pendiente de aceptación" | "Hay equipos asignados a esta propiedad, pero ningún miembro ha aceptado la limpieza." | `hasAvailableTeams === true` y `teamId === null` |
| **2** | "Asignada a equipo: {nombreTeam}" | "La limpieza está asignada al equipo. Los cleaners del equipo pueden ver y aceptar la limpieza." | `teamId !== null` y `assignedMembershipId === null` |
| **3** | "{nombreCleaner}" | "{nombreEquipo} · {estado}" | `assignedMembershipId !== null` (o `assignedMemberId` legacy) |
| **4** | "En ejecución por: {nombreCleaner}" | "{nombreEquipo} · En progreso" | `status === "IN_PROGRESS"` y `startedAt !== null` |
| **5** | "Completada por: {nombreCleaner}" | "{nombreEquipo} · Completada" | `status === "COMPLETED"` y `completedAt !== null` |
| **Error** | "Asignación" | "No se pudo cargar la asignación." | Error técnico al calcular/obtener datos |

### 3.2 Variantes permitidas

**Nivel 2:**
- Si `teamName` no está disponible: usar "Equipo" en lugar del nombre

**Nivel 3, 4, 5:**
- Si `cleanerName` no está disponible: usar "Cleaner asignado"
- Si `teamNameSecondary` no está disponible: usar "Equipo"
- Estado: "Pendiente" (PENDING), "En progreso" (IN_PROGRESS), "Completada" (COMPLETED)

---

## 4. Invariantes (MUST NOT BREAK)

### 4.1 No prometer automatismos

**❌ PROHIBIDO:**
- "Será asignada automáticamente"
- "Se asignará automáticamente"
- Cualquier promesa de comportamiento futuro

**✅ PERMITIDO:**
- Describir el estado actual
- Indicar qué puede ocurrir (sin garantizar)

### 4.2 No confundir niveles

**❌ PROHIBIDO:**
- "No hay equipos asignados a la propiedad" cuando `hasAvailableTeams === true` (Nivel 1)
- "Ningún cleaner ha aceptado" cuando `teamId === null` (Nivel 1, no Nivel 2)
- "Sin equipo disponible" cuando hay equipos configurados pero no asignados (Nivel 1, no Nivel 0)

**✅ PERMITIDO:**
- Distinguir claramente entre:
  - Equipos configurados en propiedad (`hasAvailableTeams`)
  - Equipo asignado a limpieza (`teamId`)
  - Cleaner que aceptó (`assignedMembershipId`)

### 4.3 Consistencia con otros componentes

**Regla:** El copy mostrado en esta página **DEBE** ser consistente con:
- Banner de atención en `/host/cleanings`
- Tarjeta de asignación en `/host/cleanings/[id]`

**Implicación:** Todos usan el mismo `assignmentLevel` y el mismo copy canónico.

### 4.4 La alerta visible NO debe derivarse del flag `needsAttention` de forma aislada

**Regla crítica:** `Cleaning.needsAttention` es un flag persistido en base de datos que puede quedar con valor `true` de forma desactualizada (stale) tras eventos del sistema — por ejemplo, cuando un cleaner acepta una limpieza que previamente estuvo sin asignar.

**❌ PROHIBIDO en cualquier vista o componente:**
```ts
// MAL: usa el flag persistido directamente sin validar el estado de asignación
if (cleaning.needsAttention) { /* mostrar alerta */ }
cleanings.some((c) => c.needsAttention)
```

**✅ CORRECTO:** La visibilidad de la alerta **DEBE** seguir la misma lógica que usa `getCleaningAttentionReasons()` para generar razones visibles — que en su línea de control principal evalúa:

```ts
// lib/cleaning-attention-reasons.ts
if (cleaning.needsAttention && !cleaning.assignedMemberId && !cleaning.assignedMembershipId) {
  // solo entonces agregar razones visibles
}
```

**Regla derivada:** Si existe cleaner asignado por cualquier path, **NO debe mostrarse la alerta visible**, aunque `cleaning.needsAttention === true`:

| Campo | Condición que suprime la alerta |
|-------|--------------------------------|
| `assignedMembershipId` | `!== null` (path moderno — TeamMembership) |
| `assignedMemberId` | `!== null` (path legacy — TeamMember) |

**Condición canónica correcta para mostrar la alerta en UI:**
```ts
cleaning.needsAttention && !cleaning.assignedMembershipId && !cleaning.assignedMemberId
```

**Aplica a todas las vistas que muestran la alerta "Atención requerida":**
- `/host/reservations` (lista)
- `/host/reservations/[id]` (detalle de reserva)
- `/host/cleanings` (lista de limpiezas)
- Cualquier componente futuro que consuma `Cleaning.needsAttention`

---

## 5. Estructura de la página

### 5.1 Encabezado

- **Título:** "Limpiezas que requieren atención"
- **Subtítulo:** "Estas limpiezas requieren atención porque no tienen equipo o cleaner asignado, o el horario no es compatible."
- **Botón "Volver":** Navega a `/host/cleanings`

### 5.2 Lista de limpiezas

Cada item muestra:

1. **Thumbnail de propiedad** (si existe `coverAssetGroupId`)
2. **Nombre de propiedad** (`shortName` o `name`)
3. **Fecha y hora programada** (formato localizado)
4. **Copy canónico de asignación:**
   - Título según nivel (ej. "Pendiente de aceptación")
   - Mensaje secundario según nivel (si aplica)

### 5.3 Selector de cleaner (si aplica)

- Se muestra si `eligibleMembers.length > 0`
- Permite asignar/reasignar cleaner directamente desde la lista
- Usa componente `TeamMemberSelect` existente

### 5.4 Mensaje cuando no hay limpiezas

- **Estado vacío:** "No hay limpiezas que requieran atención en este momento."
- **CTA:** Link a `/host/cleanings` con texto "Volver a Limpiezas"

---

## 6. Cálculo de assignmentLevel

### 6.1 Datos requeridos

Para cada cleaning, se necesitan:

- `teamId` (del Cleaning)
- `assignedMembershipId` (del Cleaning)
- `assignedMemberId` (del Cleaning, legacy)
- `status` (del Cleaning)
- `startedAt` (del Cleaning)
- `completedAt` (del Cleaning)
- `hasAvailableTeams` (calculado con `resolveAvailableTeamsForProperty()`)

### 6.2 Datos adicionales para copy

- `teamName` (si `teamId` existe, obtener de `Team.name`)
- `cleanerName` (si `assignedMembershipId` existe, obtener de `TeamMembership.User.name`; si no, de `assignedMember.name`)
- `teamNameSecondary` (si `assignedMembershipId` existe, obtener de `TeamMembership.team.name`; si no, de `assignedMember.team.name`)

### 6.3 Flujo de cálculo

```
1. Obtener cleanings que requieren atención (getCleaningsNeedingAttention)
2. Para cada cleaning:
   a. Obtener datos adicionales (teamId, startedAt, completedAt, TeamMembership, Team)
   b. Calcular hasAvailableTeams (resolveAvailableTeamsForProperty)
   c. Calcular assignmentLevel (getCleaningAssignmentLevel)
   d. Obtener nombres (teamName, cleanerName, teamNameSecondary)
   e. Obtener copy canónico (getAssignmentCopy)
3. Renderizar lista con copy canónico
```

---

## 7. Archivos involucrados

### 7.1 Página principal
- `app/host/cleanings/needs-attention/page.tsx`

### 7.2 Helpers canónicos
- `lib/cleanings/getCleaningAssignmentLevel.ts` — Cálculo de nivel
- `lib/workgroups/resolveAvailableTeamsForProperty.ts` — Equipos disponibles
- `lib/cleaning-needs-attention.ts` — Lista de limpiezas que requieren atención

### 7.3 Componentes reutilizados
- `app/host/cleanings/[id]/TeamMemberSelect.tsx` — Selector de cleaner

### 7.4 Contratos relacionados
- `docs/contracts/ASSIGNMENT_COPY_V1.md` — Copy canónico
- `docs/contracts/CLEANING_ASSIGNMENT_V1.md` — Niveles de asignación

---

## 8. Criterios de aceptación (QA)

### 8.1 Copy canónico

- ✅ Cada nivel muestra el título y mensaje secundario exactos del contrato
- ✅ No aparecen textos inventados o variantes no permitidas
- ✅ Los nombres (team, cleaner) se obtienen correctamente de las relaciones

### 8.2 Consistencia

- ✅ El copy coincide con el mostrado en `/host/cleanings/[id]` (AssignmentSection)
- ✅ El nivel calculado es correcto según los campos del Cleaning
- ✅ `hasAvailableTeams` se calcula usando UNION de WorkGroups + PropertyTeam

### 8.3 Invariantes

- ✅ No se prometen automatismos
- ✅ No se confunden equipos configurados con equipo asignado
- ✅ No se confunden niveles de asignación

### 8.4 Casos de prueba

- ✅ Cleaning sin equipos en propiedad → Nivel 0 → "Sin equipo disponible"
- ✅ Cleaning con equipos pero `teamId === null` → Nivel 1 → "Pendiente de aceptación"
- ✅ Cleaning con `teamId` pero sin `assignedMembershipId` → Nivel 2 → "Asignada a equipo: X"
- ✅ Cleaning con `assignedMembershipId` → Nivel 3 → "{nombreCleaner}"
- ✅ Cleaning `IN_PROGRESS` con `startedAt` → Nivel 4 → "En ejecución por: {nombreCleaner}"
- ✅ Cleaning `COMPLETED` con `completedAt` → Nivel 5 → "Completada por: {nombreCleaner}"
- ✅ Error al calcular → "Asignación" / "No se pudo cargar la asignación."

---

## 9. Referencias

### 9.1 Contratos relacionados

- `docs/contracts/ASSIGNMENT_COPY_V1.md` — Copy canónico (fuente de verdad para textos)
- `docs/contracts/CLEANING_ASSIGNMENT_V1.md` — Niveles de asignación (fuente de verdad para lógica)
- `docs/contracts/CLEANING_DETAIL_UX_V1.md` — UX del detalle de limpieza

### 9.2 Helpers técnicos

- `lib/cleanings/getCleaningAssignmentLevel.ts` — Helper canónico para nivel
- `lib/workgroups/resolveAvailableTeamsForProperty.ts` — Helper canónico para equipos disponibles

---

**Fin del contrato**

---

## 10. Extensión v1.1 — Overdue Cleanings (Atrasadas)

Esta sección extiende el comportamiento para incluir limpiezas pasadas no resueltas.

### 10.1 Definición de Overdue
Una cleaning se considera **OVERDUE** si:
- `scheduledDate < today`
- `status` NO es `COMPLETED` ni `CANCELLED`

### 10.2 Ventana operativa (Host)
Para evitar saturar la vista con histórico irrelevante, se define un límite hacia atrás:
- **HOST_OVERDUE_WINDOW_DAYS** = 45 días.
- Regla: `scheduledDate >= (today - 45 días)`.

### 10.3 Reglas de inclusión en "Needs Attention"
Una limpieza **OVERDUE** debe aparecer en la lista si cumple **CUALQUIERA** de estas:
1. Cumple cualquier regla de atención existente (Niveles 0, 1, 2) y su `status` es `PENDING`.
2. Está **OPEN** (`assignedMembershipId === null` AND `assignedMemberId === null`) independientemente de si su `status` es `PENDING` o `IN_PROGRESS`.

**Regla crítica para IN_PROGRESS:**
- Una cleaning `IN_PROGRESS` **SOLO** se incluye si está totalmente sin asignar (`assignedMembershipId === null` AND `assignedMemberId === null`).
- Si está asignada y en progreso, **NO** requiere atención del Host (se asume flujo operativo normal del Cleaner).

### 10.4 Indicadores visuales (UI)
Si una cleaning es **OVERDUE**, la UI debe mostrar:
1. **Badge:** "Vencida" (estilo ámbar).
2. **Mensaje complementario:** Usar la constante `OVERDUE_MESSAGE_V1`.

**Constante de Texto:**
`OVERDUE_MESSAGE_V1 = "La fecha programada ya pasó y la limpieza sigue pendiente."`

**IMPORTANTE:** Este mensaje es adicional y **NO** sustituye los mensajes definidos en `ASSIGNMENT_COPY_V1`.

### 10.5 Orden de Resultados
La lista debe priorizar la urgencia:
1. **Overdue primero**: De más reciente a más antigua (`scheduledDate` DESC).
2. **Futuras después**: De más próxima a más lejana (`scheduledDate` ASC).

### 10.6 Exclusiones explícitas
- `status === "COMPLETED"`: NUNCA se incluye.
- `status === "CANCELLED"`: NUNCA se incluye.

