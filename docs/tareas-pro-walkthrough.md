# Tareas Pro — Walkthrough MVP

Dominio nuevo, independiente del checklist legacy. Property-centric, offline-friendly, compatible con Flutter.

---

## Cierre final — unicidad DB + alineación Prisma Client

### Fix 4 — `@@unique([tenantId, occurrenceKey])` en TaskJob (`schema.prisma`)

**Qué cambió:**
- Se eliminó el `@@index([occurrenceKey])` anterior (redundante ahora)
- Se añadió `@@unique([tenantId, occurrenceKey])` que Prisma genera como `TaskJobTenantIdOccurrenceKeyCompoundUniqueInput`
- `findFirst` por occurrenceKey → reemplazado por `findUnique` usando la clave compuesta (más eficiente y semánticamente correcto)
- `create` envuelto en try/catch para P2002: si una carrera concurrente ganó el create, se recupera el job existente en lugar de propagar el error

**Por qué:** el `findFirst` previo al create no garantiza idempotencia bajo concurrencia. La constraint en DB es la única garantía real.

**Causa raíz de los errores TS/Prisma que se mencionaban:**
Los errores `Property 'taskJob' does not exist` y `Module has no exported member 'TaskSectionType'` eran errores de build time que ocurren **cuando el cliente Prisma no ha sido regenerado** tras modificar el schema. Después de ejecutar `npx prisma generate`, el cliente reconoce todos los modelos y enums correctamente. No había ninguna inconsistencia de naming en el código.

**Comandos correctos para este proyecto:**

*Desarrollo (genera migración SQL y aplica a Neon dev branch):*
```bash
npx prisma migrate dev --name <nombre-descriptivo>
```

*Producción (aplica migraciones existentes sin generarlas):*
```bash
npx prisma migrate deploy
```

*Después de cualquier cambio de schema (siempre):*
```bash
npx prisma generate
```

**Cómo validar manualmente:**
1. Llama `generateTaskJob` dos veces con el mismo `cleaningId` y `templateId`
2. Verifica que el segundo call retorna el mismo `job.id` que el primero
3. Verifica en DB que hay exactamente 1 registro en `TaskJob` con ese `occurrenceKey`
4. Verifica que `SELECT * FROM "TaskJob" WHERE "tenantId" = X AND "occurrenceKey" = Y` retorna máximo 1 fila

---

## Correcciones aplicadas (patch quirúrgico)

### Fix 1 — occurrenceKey idempotente (`job-generation.ts`)

**Qué cambió:**
- Se eliminó `createId()` aleatorio.
- Se añadió `buildOccurrenceKey()` que genera claves según contexto:
  - `cleaning:{cleaningId}:{templateId}` → determinista cuando hay cleaning
  - `schedule:{templateId}:{propertyId}:{yyyy-mm-dd}` → para generaciones por schedule
  - `manual:{templateId}:{isoTimestamp}` → explícitamente manual, única por invocación
- Antes de crear el job, se busca uno existente con el mismo `tenantId + occurrenceKey`. Si existe, se retorna ese job sin crear duplicado.
- Se expone `occurrenceKeyOverride` para que futuros callers (scheduler) puedan pasar su propia clave.

**Por qué:** si el generador se llama dos veces para la misma cleaning (doble-submit, retry), el key `cleaning:X:Y` es idéntico y la dedup silenciosa lo resuelve. Para manual, la clave lleva timestamp así que cada click explícito es único (comportamiento esperado).

**Cómo validar:**
1. Genera un job ligado a una cleaning: `cleaningId = "abc"` → `occurrenceKey = "cleaning:abc:{templateId}"`
2. Llama `generateTaskJob` con los mismos parámetros de nuevo
3. Verifica que retorna el mismo `job.id` sin crear un segundo registro en `TaskJob`

---

### Fix 2 — carry-forward inyecta steps (`carry-forward.ts`)

**Qué cambió:**
- `createCarryForwardFromSection()` ahora hace `include: { steps: true }` al cargar la sección
- Los steps se convierten a `StepSnapshot[]` y se guardan dentro de `contextSnapshot.steps`
- `injectCarryForwards()` ahora, tras crear la `TaskJobSection`, itera `snapshot.steps` y crea un `TaskJobStep` por cada uno
- Compatibilidad hacia atrás: si un carry-forward legacy no tiene `steps` en el snapshot, simplemente no crea pasos (igual que antes)

**Por qué:** una sección inyectada sin steps estaba vacía. El Cleaner no tenía nada ejecutable. El snapshot autónomo es la solución correcta porque no depende de que el template original siga existiendo o sin cambios.

**Cómo validar:**
1. Crea un job y difiere una sección que tenga 2 pasos → se crea `TaskCarryForward` con `contextSnapshot.steps` con 2 entradas
2. Genera el siguiente job para la misma propiedad
3. Verifica que la sección inyectada (`isCarryForwardInjected = true`) tiene 2 `TaskJobStep` asociados
4. Verifica que los `nameSnapshot`, `responseTypeSnapshot` etc. son correctos

---

### Fix 3 — validation.ts usa `sectionTypeSnapshot` (`validation.ts`)

**Qué cambió:**
- Se añadió `sectionPrefix()` que genera prefijos semánticos: `[CRÍTICO]`, `[INFO]` o sin prefijo
- Las secciones `INFORMATIVE` se cortocircuitan: no validan pasos, solo verifican confirmación global explícita y sync de evidencia de sección
- Las secciones `CRITICAL` producen mensajes de bloqueo más explícitos: `[CRÍTICO] Sección "X" — paso crítico "Y" sin respuesta`
- Las secciones `STANDARD` mantienen el comportamiento original, ahora con prefijo de sección en los mensajes

**Por qué:** `sectionTypeSnapshot` era decorativo. Ahora INFORMATIVE no puede generar falsos bloqueos por pasos que no tienen respuesta, y CRITICAL produce mensajes claros que el Cleaner puede identificar como urgentes.

**Cómo validar:**
1. Crea un job con una sección INFORMATIVE que tenga un paso tipo NONE (sin respuesta)
2. Intenta completar sin responder → debe completar sin bloquearse por esa sección
3. Crea un job con sección CRITICAL que tenga un paso EVIDENCE sin foto
4. Intenta completar → el blocker debe decir `[CRÍTICO] Sección "X" — evidencia crítica del paso "Y" sin foto sincronizada`

---

## 1. Arquitectura general

```
TaskTemplate (Host define)
  ├── TaskTemplateSchedule (frecuencia + carry-forward policy)
  ├── TaskSectionTemplate[]
  │     ├── TaskSectionReferenceAsset[] (imágenes de referencia)
  │     └── TaskStepTemplate[]
  │           ├── TaskStepOption[] (opciones simplificadas)
  │           └── TaskStepReferenceAsset[]
  │
  └── TaskJob (instancia ejecutable generada desde el template)
        ├── TaskJobSection[] (snapshot de secciones)
        │     ├── TaskJobSectionResponse (confirmación global)
        │     ├── TaskJobSectionEvidenceAsset[]
        │     └── TaskJobStep[] (snapshot de pasos)
        │           ├── TaskJobStepResponse
        │           └── TaskJobStepEvidenceAsset[]
        ├── TaskCarryForward[] (secciones diferidas que vuelven a inyectarse)
        └── TaskJobEventLog[] (auditoría inmutable)
```

### Principios clave

- **Template ≠ Job**: el template es el estándar; el job es la instancia ejecutable.
- **Snapshot obligatorio**: al generar un job se captura toda la estructura del template en ese momento (secciones, pasos, tipos, flags). El histórico es fiel aunque el template cambie después.
- **Carry-forward**: si una sección se difiere, se crea un `TaskCarryForward` OPEN. Al generar el siguiente job de esa propiedad, se inyecta automáticamente como sección extra.
- **Anti-loop**: si la política es `LIMITED`, el carry-forward expira al alcanzar `maxAttempts`.

---

## 2. Flujo Host

### 2.1 Crear template

1. Ir a `/host/tareas-pro`
2. Expandir "Nueva plantilla", elegir propiedad y nombre
3. La plantilla queda en estado `DRAFT`

### 2.2 Agregar secciones y pasos

En `/host/tareas-pro/[templateId]`:

- **Sección**: tiene `sectionType` (INFORMATIVE / STANDARD / CRITICAL) y puede requerir confirmación global
- **Paso**: tiene `responseType`:
  - `NONE` — informativo, no bloquea cierre
  - `CONFIRMATION` — botón de confirmación
  - `YES_NO` — binario
  - `NUMBER` — valor numérico
  - `TEXT` — texto libre
  - `EVIDENCE` — requiere foto subida (bloquea si `blocksCompletion = true`)

### 2.3 Activar y generar job

1. Cambiar estado a `ACTIVE`
2. Hacer clic en "Generar job ahora" (generación manual)
3. El sistema:
   - Crea snapshot completo de la estructura
   - Inyecta automáticamente `TaskCarryForward` OPEN de esa propiedad
   - Registra evento `CREATED` en el log

---

## 3. Flujo Cleaner (web)

En `/cleaner/tareas-pro`:

1. Ver bandeja de jobs activos (asignados a su usuario)
2. Abrir job → ver secciones con instrucciones y pasos
3. **Iniciar**: cambia status a `IN_PROGRESS`
4. **Responder pasos**: según su tipo (confirmación, sí/no, número, texto)
5. **Evidencia**: subir foto via `/api/media/upload` → registrar `assetId` via API o server action
6. **Confirmar sección**: si `requiresGlobalConfirm = true`
7. **Diferir sección**: crea `TaskCarryForward` para el próximo job
8. **Completar**: valida cierre estricto antes de completar

---

## 4. Flujo Cleaner (Flutter / API REST)

### Autenticación

Todos los endpoints usan la sesión existente (cookie `SESSION_COOKIE_NAME`). Para Flutter: enviar la cookie en las peticiones HTTP.

### Endpoints disponibles

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/task-jobs` | Listar jobs del usuario |
| `GET` | `/api/task-jobs/[jobId]` | Detalle completo del job |
| `POST` | `/api/task-jobs/[jobId]/start` | Iniciar job |
| `POST` | `/api/task-jobs/[jobId]/complete` | Completar job (valida cierre estricto) |
| `POST` | `/api/task-jobs/[jobId]/steps/[stepId]/respond` | Responder un paso |
| `POST` | `/api/task-jobs/[jobId]/steps/[stepId]/evidence` | Registrar evidencia de paso |
| `DELETE` | `/api/task-jobs/[jobId]/steps/[stepId]/evidence` | Eliminar evidencia |
| `POST` | `/api/task-jobs/[jobId]/sections/[sectionId]/confirm` | Confirmar sección |
| `POST` | `/api/task-jobs/[jobId]/sections/[sectionId]/defer` | Diferir sección |

### Subida de evidencia (flujo recomendado Flutter)

1. Subir imagen a `POST /api/media/upload` (multipart/form-data)
2. Obtener `assetId` de la respuesta
3. Llamar `POST /api/task-jobs/[jobId]/steps/[stepId]/evidence` con `{ assetId }`
4. La evidencia queda como `UPLOADED` y no bloquea el cierre

### Sincronización progresiva (offline)

Para soporte offline, Flutter puede:
- Guardar respuestas localmente con `syncStatus: LOCAL_PENDING`
- Enviar incrementalmente cuando recupere conexión
- Usar `PUT /api/task-jobs/[jobId]/steps/[stepId]/respond` para actualizar (el endpoint hace upsert)
- Las evidencias con `LOCAL_PENDING` o `FAILED` bloquean el cierre hasta resolverse

---

## 5. Reglas de cierre estricto

El job **no puede completarse** si:

1. Alguna sección `requiresGlobalConfirmSnapshot = true` no tiene `TaskJobSectionResponse`
2. Algún paso `isRequired = true` o `blocksCompletion = true` no tiene respuesta (excepto si la sección está `DEFERRED`)
3. Algún paso tipo `EVIDENCE` con `isRequired = true` no tiene al menos un asset `UPLOADED`
4. Cualquier `TaskJobStepEvidenceAsset` o `TaskJobSectionEvidenceAsset` tiene `syncStatus = FAILED | LOCAL_PENDING`

Pasos tipo `NONE` (informativos) **nunca bloquean**.
Secciones tipo `DEFERRED` se excluyen de la validación.

---

## 6. Carry-forward

### Creación

Al diferir una sección:
- Se crea `TaskCarryForward` con `status = OPEN`
- Se guarda `contextSnapshot` (nombre, tipo, razón)

### Inyección

Al generar un nuevo `TaskJob` para la misma propiedad:
1. Se buscan todos los `TaskCarryForward` con `status = OPEN` y mismo `propertyId`
2. Cada uno genera una `TaskJobSection` con `isCarryForwardInjected = true` y badge visual "Pendiente anterior"
3. El carry-forward pasa a `status = INJECTED` y `currentAttempt++`

### Anti-loop

Si `policy = LIMITED` y `currentAttempt >= maxAttempts`:
- El carry-forward se marca `EXPIRED` y **no se inyecta** en el siguiente job

---

## 7. Event log

Eventos registrados en `TaskJobEventLog`:

| Evento | Cuándo |
|--------|--------|
| `CREATED` | Al generar el job |
| `STARTED` | Al iniciar (`IN_PROGRESS`) |
| `STEP_RESPONDED` | Al responder un paso |
| `SECTION_CONFIRMED` | Al confirmar globalmente una sección |
| `DEFERRED` | Al diferir una sección |
| `COMPLETED` | Al completar el job |
| `CARRY_FORWARD_CREATED` | Al crear un carry-forward |
| `CARRY_FORWARD_INJECTED` | Al inyectar un carry-forward en un nuevo job |

---

## 8. Seed de prueba

```bash
npx tsx prisma/seed-tareas-pro.ts
```

Crea:
- 1 propiedad (si no existe)
- 1 template activo con 3 secciones (informativa, estándar con confirmación global, crítica con evidencia)
- 1 job en `IN_PROGRESS` con un paso parcialmente respondido
- 1 `TaskCarryForward` OPEN (simula terraza diferida de job anterior)

**URLs de prueba tras el seed:**
- Host: `/host/tareas-pro`
- Cleaner: `/cleaner/tareas-pro`

---

## 9. Extensibilidad futura (no implementado en MVP)

- Auto-generación de jobs al detectar checkout (hook de reserva)
- Aprobaciones del Host sobre evidencias
- Hallazgos/pendientes (incidentes)
- Bolsa de trabajo abierta (job sin assignedUserId)
- Analytics y dashboards de cumplimiento
- Versionado completo de plantillas
- Clonación de templates entre propiedades
- Integración total con checklist legacy (migración guiada)
