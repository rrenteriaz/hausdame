# Asignación de Limpiezas (Host) — Contrato v1

**Estado:** Canonical  
**Última actualización:** v1.0 — Definición inicial del modelo de asignación  
**Alcance:** Host — Modelo conceptual y reglas de asignación de limpiezas

---

## 1. Entidades involucradas

### 1.1 Cleaning (Limpieza)

**Rol:** Entidad central que representa una tarea de limpieza programada.

**Campos relevantes para asignación:**
- `teamId` (String?): ID del Team (Services) asignado a la limpieza
- `assignedMembershipId` (String?): ID del TeamMembership (cleaner individual) que aceptó la limpieza
- `assignedMemberId` (String?): ID del TeamMember (legacy) asignado
- `assignmentStatus` (AssignmentStatus): Estado de asignación (`OPEN` | `ASSIGNED`)
- `needsAttention` (Boolean): Indica si requiere atención del Host
- `attentionReason` (String?): Código de razón de atención requerida
- `status` (CleaningStatus): Estado de ejecución (`PENDING` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED`)

**Relaciones:**
- `property` → Property (propiedad donde se realiza la limpieza)
- `team` → Team (equipo asignado, si existe)
- `TeamMembership` → TeamMembership (cleaner que aceptó, si existe)
- `assignedMember` → TeamMember (legacy, si existe)

**Qué NO representa:**
- `teamId` NO indica que un cleaner haya aceptado la limpieza
- `teamId` NO garantiza que haya miembros disponibles en el equipo
- `assignmentStatus: ASSIGNED` NO garantiza que la limpieza esté en ejecución

---

### 1.2 HostWorkGroup (Grupo de Trabajo Host)

**Rol:** Entidad de configuración en el dominio Host que agrupa propiedades y define equipos ejecutores.

**Relación con Cleaning:** **INDIRECTA** (no hay campo directo en Cleaning)

**Campos relevantes:**
- `id`: Identificador único del grupo de trabajo
- `name`: Nombre del grupo
- `status`: Estado del grupo (`ACTIVE` | `INACTIVE`)

**Relaciones:**
- `HostWorkGroupProperty` → Propiedades asignadas al grupo
- `WorkGroupExecutor` → Equipos ejecutores (Teams) del grupo

**Qué NO representa:**
- NO es una asignación directa a una limpieza
- NO garantiza que una limpieza tenga equipo asignado
- NO indica que un cleaner haya aceptado una limpieza

**Relación con Cleaning:**
- Una Property puede tener un HostWorkGroup asignado vía `HostWorkGroupProperty`
- El HostWorkGroup puede tener Teams ejecutores vía `WorkGroupExecutor`
- Estos Teams pueden ser asignados a limpiezas de la Property, pero **NO automáticamente**

---

### 1.3 WorkGroupExecutor (Ejecutor del Grupo de Trabajo)

**Rol:** Relación entre un HostWorkGroup y un Team (Services) que define qué equipo puede ejecutar limpiezas para propiedades del grupo.

**Campos relevantes:**
- `workGroupId`: ID del HostWorkGroup
- `teamId`: ID del Team (Services) ejecutor
- `status`: Estado del ejecutor (`ACTIVE` | `INACTIVE`)

**Relación con Cleaning:** **INDIRECTA** (no hay campo directo en Cleaning)

**Qué representa:**
- Define qué Teams están **disponibles** para ejecutar limpiezas de propiedades del HostWorkGroup
- Indica que un Team tiene **capacidad** para ejecutar limpiezas (si `status: ACTIVE`)

**Qué NO representa:**
- NO indica que una limpieza específica esté asignada
- NO garantiza que un cleaner haya aceptado una limpieza
- NO es una asignación directa a una limpieza

**Relación con Cleaning:**
- Si una Property pertenece a un HostWorkGroup con un WorkGroupExecutor activo, el Team del executor está **disponible** para asignación
- La asignación real a una limpieza requiere establecer `Cleaning.teamId`

---

### 1.4 Team (Services) — Equipo de Limpieza

**Rol:** Entidad en el dominio Services que representa un equipo de cleaners.

**Campos relevantes:**
- `id`: Identificador único del equipo
- `name`: Nombre del equipo
- `status`: Estado del equipo (`ACTIVE` | `INACTIVE`)

**Relaciones:**
- `TeamMembership` → Cleaners individuales del equipo
- `PropertyTeam` → Propiedades asignadas al equipo (fallback legacy)
- `WorkGroupExecutor` → Relación con HostWorkGroup (nuevo modelo)

**Relación con Cleaning:**
- `Cleaning.teamId` puede apuntar a un Team
- Esto indica que la limpieza está **asignada al equipo**, pero NO que un cleaner haya aceptado

**Qué representa:**
- Un equipo **disponible** para ejecutar limpiezas
- Un conjunto de cleaners que pueden aceptar limpiezas

**Qué NO representa:**
- NO garantiza que haya miembros activos (`TeamMembership` con `status: ACTIVE`)
- NO indica que un cleaner específico haya aceptado la limpieza
- NO es una asignación a nivel de cleaner individual

---

### 1.5 TeamMembership (Cleaner Individual)

**Rol:** Relación entre un User (cleaner) y un Team, representando la membresía activa de un cleaner en un equipo.

**Campos relevantes:**
- `id`: Identificador único de la membresía
- `teamId`: ID del Team al que pertenece
- `userId`: ID del User (cleaner)
- `role`: Rol en el equipo (`TEAM_LEADER` | `CLEANER`)
- `status`: Estado de la membresía (`ACTIVE` | `INACTIVE`)

**Relación con Cleaning:**
- `Cleaning.assignedMembershipId` puede apuntar a un TeamMembership
- Esto indica que un cleaner **específico** ha aceptado la limpieza

**Qué representa:**
- Un cleaner individual que puede aceptar limpiezas
- La aceptación explícita de una limpieza por parte de un cleaner

**Qué NO representa:**
- NO es una asignación automática (requiere acción del cleaner)
- NO garantiza que la limpieza esté en ejecución (`status: IN_PROGRESS`)
- NO es lo mismo que tener un Team asignado (`teamId`)

---

### 1.6 PropertyTeam (Legacy) — Asignación Directa Propiedad → Team

**Rol:** Relación legacy entre Property y Team, usada como fallback cuando no hay HostWorkGroup configurado.

**Campos relevantes:**
- `propertyId`: ID de la propiedad
- `teamId`: ID del Team asignado

**Relación con Cleaning:**
- Al crear una limpieza, si existe `PropertyTeam`, se puede establecer `Cleaning.teamId`
- Es un mecanismo de **fallback** cuando no hay HostWorkGroup

**Qué representa:**
- Un Team **disponible** para limpiezas de una propiedad específica
- Configuración directa propiedad → equipo (sin pasar por HostWorkGroup)

**Qué NO representa:**
- NO es una asignación automática a limpiezas
- NO garantiza que un cleaner haya aceptado

---

## 2. Niveles de asignación (conceptual)

### 2.1 Nivel 0: Sin contexto ejecutor

**Definición:** La propiedad no tiene configuración de equipo disponible.

**Campos en Cleaning:**
- `teamId`: `null`
- `assignedMembershipId`: `null`
- `assignedMemberId`: `null`
- `assignmentStatus`: `OPEN`

**Condiciones:**
- No existe `HostWorkGroupProperty` para la propiedad
- No existe `PropertyTeam` para la propiedad (fallback legacy)
- O existe HostWorkGroup pero no tiene `WorkGroupExecutor` activo

**Qué significa:**
- No hay equipo disponible para asignar limpiezas
- La limpieza NO puede ser asignada automáticamente
- Requiere configuración del Host

**Qué NO significa:**
- NO significa que la limpieza esté "sin asignar" (está en un estado previo)
- NO significa que haya un error (puede ser configuración pendiente)

---

### 2.2 Nivel 1: Con contexto disponible pero sin asignar

**Definición:** La propiedad tiene equipos disponibles, pero la limpieza no está asignada a ningún equipo.

**Campos en Cleaning:**
- `teamId`: `null`
- `assignedMembershipId`: `null`
- `assignedMemberId`: `null`
- `assignmentStatus`: `OPEN`

**Condiciones:**
- Existe `HostWorkGroupProperty` con `WorkGroupExecutor` activo, O existe `PropertyTeam`
- Pero `Cleaning.teamId` es `null`

**Qué significa:**
- Hay equipos disponibles para la propiedad
- La limpieza aún no ha sido asignada a ningún equipo
- Puede ser asignada manualmente o automáticamente (según reglas de negocio)

**Qué NO significa:**
- NO significa que no haya equipos disponibles
- NO significa que haya un error (puede ser asignación pendiente)

---

### 2.3 Nivel 2: Asignada a Team

**Definición:** La limpieza está asignada a un Team específico, pero ningún cleaner individual ha aceptado.

**Campos en Cleaning:**
- `teamId`: `<teamId>` (no null)
- `assignedMembershipId`: `null`
- `assignedMemberId`: `null` (o legacy)
- `assignmentStatus`: `OPEN` o `ASSIGNED` (según contexto)

**Condiciones:**
- `Cleaning.teamId` está establecido
- `Cleaning.assignedMembershipId` es `null`
- El Team existe y puede tener miembros activos

**Qué significa:**
- La limpieza está asignada a un equipo
- Los cleaners del equipo pueden ver y aceptar la limpieza
- Ningún cleaner individual ha aceptado aún

**Qué NO significa:**
- NO significa que un cleaner haya aceptado (requiere `assignedMembershipId`)
- NO significa que la limpieza esté en ejecución (requiere `status: IN_PROGRESS`)
- NO garantiza que haya miembros disponibles en el Team

---

### 2.4 Nivel 3: Aceptada por Cleaner

**Definición:** Un cleaner individual (TeamMembership) ha aceptado la limpieza.

**Campos en Cleaning:**
- `teamId`: `<teamId>` (no null, generalmente)
- `assignedMembershipId`: `<membershipId>` (no null)
- `assignedMemberId`: `null` (o legacy, si aplica)
- `assignmentStatus`: `ASSIGNED`

**Condiciones:**
- `Cleaning.assignedMembershipId` está establecido
- El TeamMembership existe y está activo
- El TeamMembership pertenece al Team asignado (si `teamId` existe)

**Qué significa:**
- Un cleaner específico ha aceptado la limpieza
- La limpieza está lista para ser ejecutada
- El cleaner puede iniciar la limpieza cuando corresponda

**Qué NO significa:**
- NO significa que la limpieza esté en ejecución (requiere `status: IN_PROGRESS`)
- NO significa que la limpieza esté completada (requiere `status: COMPLETED`)
- NO garantiza que el cleaner esté disponible en el horario programado

---

### 2.5 Nivel 4: En ejecución

**Definición:** La limpieza ha sido iniciada por el cleaner asignado.

**Campos en Cleaning:**
- `status`: `IN_PROGRESS`
- `startedAt`: `<timestamp>` (no null)
- `assignedMembershipId`: `<membershipId>` (generalmente no null)
- `teamId`: `<teamId>` (generalmente no null)

**Condiciones:**
- `Cleaning.status` es `IN_PROGRESS`
- `Cleaning.startedAt` está establecido
- Generalmente hay `assignedMembershipId` (cleaner que inició)

**Qué significa:**
- La limpieza está siendo ejecutada en este momento
- El cleaner ha iniciado el trabajo
- El proceso de limpieza está en curso

**Qué NO significa:**
- NO significa que la limpieza esté completada
- NO garantiza que se completará exitosamente

---

### 2.6 Nivel 5: Completada

**Definición:** La limpieza ha sido completada por el cleaner.

**Campos en Cleaning:**
- `status`: `COMPLETED`
- `completedAt`: `<timestamp>` (no null)
- `startedAt`: `<timestamp>` (generalmente no null)
- `assignedMembershipId`: `<membershipId>` (generalmente no null)

**Condiciones:**
- `Cleaning.status` es `COMPLETED`
- `Cleaning.completedAt` está establecido

**Qué significa:**
- La limpieza ha sido finalizada exitosamente
- El trabajo está completo
- No requiere más atención

**Qué NO significa:**
- NO significa que la limpieza esté cancelada (ese es otro estado)
- NO garantiza calidad (eso se evalúa por otros medios)

---

## 3. Estados canónicos de asignación

### 3.1 Modelo de estados

**Estados posibles:**

1. **SIN_CONTEXTO_EJECUTOR**
   - No hay equipos disponibles para la propiedad
   - `teamId: null`, `assignedMembershipId: null`
   - `assignmentStatus: OPEN`
   - `needsAttention: true`, `attentionReason: "NO_TEAM_CONFIGURED"`

2. **CONTEXTO_DISPONIBLE_SIN_ASIGNAR**
   - Hay equipos disponibles, pero limpieza no asignada
   - `teamId: null`, `assignedMembershipId: null`
   - `assignmentStatus: OPEN`
   - `needsAttention: false` o `true` (según reglas)

3. **ASIGNADA_A_TEAM**
   - Limpieza asignada a un Team, sin cleaner individual
   - `teamId: <id>`, `assignedMembershipId: null`
   - `assignmentStatus: OPEN` o `ASSIGNED` (según contexto)
   - `needsAttention: true` si no hay miembros activos, `false` si hay

4. **ACEPTADA_POR_CLEANER**
   - Cleaner individual ha aceptado
   - `teamId: <id>`, `assignedMembershipId: <id>`
   - `assignmentStatus: ASSIGNED`
   - `needsAttention: false` (generalmente)

5. **RECHAZADA_LIBERADA**
   - Limpieza fue rechazada o liberada
   - `teamId: <id>` o `null`, `assignedMembershipId: null`
   - `assignmentStatus: OPEN`
   - `needsAttention: true`, `attentionReason: "DECLINED_BY_ASSIGNEE"` o similar

6. **CANCELADA**
   - Limpieza cancelada (no se ejecutará)
   - `status: CANCELLED`
   - Estados de asignación no aplican

---

### 3.2 Transiciones válidas

**Desde SIN_CONTEXTO_EJECUTOR:**
- → CONTEXTO_DISPONIBLE_SIN_ASIGNAR (cuando se configura equipo en propiedad)
- → ASIGNADA_A_TEAM (si se asigna directamente, aunque no debería ser común)

**Desde CONTEXTO_DISPONIBLE_SIN_ASIGNAR:**
- → ASIGNADA_A_TEAM (asignación manual o automática)
- → SIN_CONTEXTO_EJECUTOR (si se remueve configuración de equipo)

**Desde ASIGNADA_A_TEAM:**
- → ACEPTADA_POR_CLEANER (cleaner acepta)
- → RECHAZADA_LIBERADA (cleaner rechaza o se libera)
- → CONTEXTO_DISPONIBLE_SIN_ASIGNAR (se remueve asignación de Team)

**Desde ACEPTADA_POR_CLEANER:**
- → RECHAZADA_LIBERADA (cleaner rechaza después de aceptar)
- → En ejecución (transición a `status: IN_PROGRESS`, fuera del modelo de asignación)
- → Completada (transición a `status: COMPLETED`, fuera del modelo de asignación)

**Desde RECHAZADA_LIBERADA:**
- → ASIGNADA_A_TEAM (reasignación a otro Team)
- → ACEPTADA_POR_CLEANER (otro cleaner acepta)

**Desde cualquier estado:**
- → CANCELADA (cancelación de limpieza)

---

### 3.3 Transiciones inválidas

**NO válidas:**
- SIN_CONTEXTO_EJECUTOR → ACEPTADA_POR_CLEANER (requiere Team asignado primero)
- ACEPTADA_POR_CLEANER → SIN_CONTEXTO_EJECUTOR (no se puede perder contexto si ya fue aceptada)
- CANCELADA → cualquier otro estado (estado terminal)

---

### 3.4 Estados terminales

**Estados que no permiten transiciones:**
- **CANCELADA:** Limpieza cancelada, no se puede reactivar
- **COMPLETADA:** Limpieza completada, no se puede modificar asignación

**Nota:** `COMPLETADA` es terminal para asignación, pero puede tener transiciones de estado de ejecución (revisión, etc.).

---

## 4. Reglas de "Atención requerida"

### 4.1 Cuándo SÍ debe mostrarse atención requerida

#### 4.1.1 CRITICAL — No hay equipo ejecutando

**Código:** `NO_TEAM_EXECUTING`

**Condición:**
- `Cleaning.teamId` es `null` Y `Cleaning.assignedMembershipId` es `null`
- Limpieza no está completada ni cancelada

**Mensaje conceptual:** "No hay equipo asignado a esta limpieza"

**Severidad:** CRITICAL

**CTA:** "Ir a propiedad y configurar equipo" → `/host/properties/[id]`

---

#### 4.1.2 CRITICAL — Equipo sin miembros activos

**Código:** `NO_AVAILABLE_MEMBER`

**Condición:**
- `Cleaning.teamId` está establecido
- El Team no tiene `TeamMembership` con `status: ACTIVE`
- `Cleaning.assignedMembershipId` es `null`

**Nota — Roles que cuentan como ejecutores disponibles:**
Para evaluar si el equipo tiene miembros activos, se consideran válidos los siguientes roles:
- `TEAM_LEADER` — ejecutor por defecto; su presencia activa es suficiente para suprimir esta alerta.
- `CLEANER` — ejecutor operativo estándar.

Un equipo con solo un `TEAM_LEADER` activo **no debe** generar `NO_AVAILABLE_MEMBER`. La alerta solo aplica cuando no existe ninguna `TeamMembership` con `status: ACTIVE` y `role IN (TEAM_LEADER, CLEANER)`.

**Mensaje conceptual:** "El equipo asignado no tiene miembros activos"

**Severidad:** CRITICAL

**CTA:** "Ir a propiedad y configurar equipo" → `/host/properties/[id]`

---

#### 4.1.3 CRITICAL — Ningún cleaner ha aceptado

**Código:** `NO_AVAILABLE_MEMBER` o `NO_PRIMARY_ASSIGNEE`

**Condición:**
- `Cleaning.teamId` está establecido
- El Team tiene miembros activos
- `Cleaning.assignedMembershipId` es `null`
- Limpieza está pendiente (`status: PENDING`)

**Mensaje conceptual:** "Esta limpieza aún no tiene un miembro asignado" o "Ningún cleaner ha aceptado la limpieza"

**Severidad:** CRITICAL

**CTA:** Opcional (depende del contexto)

---

#### 4.1.4 CRITICAL — Cleaner rechazó limpieza

**Código:** `DECLINED_BY_ASSIGNEE`

**Condición:**
- `Cleaning.attentionReason` es `"DECLINED_BY_ASSIGNEE"`
- `Cleaning.needsAttention` es `true`

**Mensaje conceptual:** "Un cleaner declinó la limpieza"

**Severidad:** CRITICAL

**CTA:** Opcional (depende del contexto)

---

#### 4.1.5 CRITICAL — Limpieza pendiente con fecha pasada

**Código:** `CLEANING_PENDING_OVERDUE`

**Condición:**
- `Cleaning.status` es `PENDING`
- `Cleaning.scheduledDate` es anterior a hoy

**Mensaje conceptual:** "Limpieza pendiente con fecha pasada"

**Severidad:** CRITICAL

**CTA:** Opcional

---

#### 4.1.6 CRITICAL — Cleaner asignado no disponible

**Código:** `CLEANING_ASSIGNED_NOT_AVAILABLE`

**Condición:**
- `Cleaning.assignedMemberId` o `assignedMembershipId` está establecido
- El cleaner no está disponible en el horario programado (verificación de disponibilidad)

**Mensaje conceptual:** "El cleaner asignado no está disponible"

**Severidad:** CRITICAL

**CTA:** Opcional

---

#### 4.1.7 WARNING — Configuración de equipo pendiente

**Código:** `NO_HOST_TEAM_CONFIG`

**Condición:**
- La propiedad no tiene `HostWorkGroupProperty` (no hay Work Group configurado)
- `Cleaning.teamId` puede ser `null` o no
- Es un aviso preventivo

**Mensaje conceptual:** "Configuración de equipo pendiente"

**Severidad:** WARNING

**CTA:** "Ir a propiedad y configurar equipo" → `/host/properties/[id]`

---

### 4.2 Cuándo NO debe mostrarse atención requerida

**NO mostrar atención requerida cuando:**
- `Cleaning.status` es `COMPLETED` o `CANCELLED`
- `Cleaning.assignedMembershipId` está establecido Y el cleaner está disponible
- La limpieza está en ejecución (`status: IN_PROGRESS`) sin problemas adicionales
- Hay `teamId` establecido Y hay miembros activos Y hay `assignedMembershipId` establecido

---

### 4.3 Tipos de atención

#### 4.3.1 Falta de configuración

**Códigos relacionados:**
- `NO_TEAM_CONFIGURED`
- `NO_HOST_TEAM_CONFIG`

**Significado:** La propiedad no tiene equipos configurados o el HostWorkGroup no tiene ejecutores activos.

**Acción requerida:** Configurar equipos en la propiedad o activar ejecutores en el Work Group.

---

#### 4.3.2 Falta de aceptación

**Códigos relacionados:**
- `NO_AVAILABLE_MEMBER`
- `NO_PRIMARY_ASSIGNEE`
- `CLEANING_PENDING_NO_ASSIGNMENT`

**Significado:** Hay equipos disponibles, pero ningún cleaner ha aceptado la limpieza.

**Acción requerida:** Esperar aceptación del cleaner o asignar manualmente.

---

#### 4.3.3 Error operativo

**Códigos relacionados:**
- `DECLINED_BY_ASSIGNEE`
- `CLEANING_ASSIGNED_NOT_AVAILABLE`
- `CLEANING_PENDING_OVERDUE`
- `MANUAL_REVIEW_REQUIRED`

**Significado:** Hay un problema operativo que requiere intervención del Host.

**Acción requerida:** Revisar y resolver el problema específico.

---

## 5. Comportamiento por página (Host)

### 5.1 Página "Hoy" (`/host/hoy`)

**Qué se muestra:**
- Limpiezas con `needsAttention: true` en el bloque "Limpiezas sin confirmar"
- No se muestra información de asignación en los bloques (solo preview de propiedad y fecha)

**Qué NO se muestra:**
- Estado detallado de asignación (Team asignado, cleaner aceptado, etc.)
- Información de equipos disponibles

**Mensajes derivados:**
- Los mensajes de atención requerida se muestran al navegar al detalle de limpieza
- No se muestran mensajes específicos de asignación en la página principal

---

### 5.2 Listados de limpiezas (`/host/actividad/limpiezas/*`)

**Qué se muestra:**
- Lista de limpiezas con nombre de propiedad y fecha
- No se muestra información de asignación en el listado

**Qué NO se muestra:**
- Estado de asignación (Team, cleaner aceptado)
- Mensajes de atención requerida

**Mensajes derivados:**
- Los mensajes se muestran al navegar al detalle de limpieza

---

### 5.3 Detalle de limpieza (`/host/cleanings/[id]`)

**Qué se muestra:**
- **Banner de atención requerida:** Si `needsAttention: true`, se muestra `CleaningWarningCard` con motivos
- **Tarjeta de asignación:** `AssignmentSection` muestra:
  - Si `assignedMembershipId` existe: Nombre del cleaner y equipo
  - Si `teamId` existe pero `assignedMembershipId` es `null`: "Ningún cleaner ha aceptado la limpieza"
  - Si `teamId` es `null`: Estado de sin asignar
- **Botón "Ver equipos":** Si hay `propertyTeams`, muestra modal con equipos asignados a la propiedad

**Qué NO se muestra:**
- Información de HostWorkGroup directamente (se muestra vía equipos de propiedad)
- Estado de WorkGroupExecutor directamente

**Mensajes derivados:**
- **Banner:** "Atención requerida: No hay equipo asignado a esta limpieza" (si `NO_TEAM_EXECUTING`)
- **Tarjeta:** "Ningún cleaner ha aceptado la limpieza" (si `teamId` existe pero `assignedMembershipId` es `null`)
- **Tarjeta:** "Hay 1 equipo asignado a la propiedad" (si hay auto-asignación)

---

### 5.4 Detalle de propiedad (`/host/properties/[id]`)

**Qué se muestra:**
- **Work Groups asignados:** Lista de `HostWorkGroup` asignados a la propiedad vía `HostWorkGroupProperty`
- **Equipos ejecutores:** Para cada Work Group, se muestran los Teams ejecutores vía `WorkGroupExecutor`
- **Equipos legacy:** Si no hay Work Groups, se muestran `PropertyTeam` (fallback)

**Qué NO se muestra:**
- Estado de asignación de limpiezas específicas
- Información de cleaners que aceptaron limpiezas

**Mensajes derivados:**
- No hay mensajes específicos de asignación en esta página
- La información es de configuración, no de estado de limpiezas

---

### 5.5 Detalle de grupo de trabajo (`/host/workgroups/[id]`)

**Qué se muestra:**
- **Propiedades asignadas:** Lista de propiedades del Work Group
- **Equipos ejecutores:** Lista de Teams ejecutores (`WorkGroupExecutor`) con su estado
- **Detalle de equipo ejecutor:** Al navegar a `/host/workgroups/[id]/teams/[teamId]`, se muestra:
  - Estado del executor (`ACTIVE` | `INACTIVE`)
  - Limpiezas futuras asignadas al Team
  - Historial de limpiezas

**Qué NO se muestra:**
- Estado de aceptación de cleaners individuales
- Información de TeamMembership directamente

**Mensajes derivados:**
- No hay mensajes específicos de asignación en esta página
- La información es de configuración y estado del executor

---

## 6. Invariantes (MUST NOT BREAK)

### 6.1 Invariantes de asignación

**INV-1: Tener Work Group asignado ≠ limpieza asignada**
- Si una Property tiene `HostWorkGroupProperty`, NO significa que las limpiezas estén asignadas
- Las limpiezas requieren `Cleaning.teamId` explícito para estar asignadas

**INV-2: Tener Team activo ≠ cleaner aceptó limpieza**
- Si `Cleaning.teamId` está establecido, NO significa que `assignedMembershipId` esté establecido
- La aceptación requiere acción explícita del cleaner

**INV-3: La UI no debe inferir estados no explícitos**
- NO inferir que hay cleaner asignado si solo existe `teamId`
- NO inferir que hay equipo disponible si solo existe `HostWorkGroupProperty`
- Usar solo campos explícitos de `Cleaning` para determinar estado

**INV-4: Mensajes de alerta deben corresponder a un estado real**
- Los mensajes de "Atención requerida" deben derivarse de `needsAttention` y `attentionReason`
- NO mostrar mensajes genéricos sin verificar el estado real

**INV-5: Asignación a Team ≠ Asignación a Cleaner**
- `teamId` establecido NO implica `assignedMembershipId` establecido
- Son niveles diferentes de asignación

**INV-6: Estado de ejecución ≠ Estado de asignación**
- `status: IN_PROGRESS` NO implica que `assignmentStatus` sea `ASSIGNED`
- Son dimensiones independientes (aunque generalmente correlacionadas)

**INV-7: WorkGroupExecutor activo ≠ Limpieza asignada**
- Un `WorkGroupExecutor` con `status: ACTIVE` NO garantiza que limpiezas estén asignadas
- Solo indica disponibilidad, no asignación real

---

## 7. Observaciones actuales

### 7.1 Inconsistencias observadas

#### 7.1.1 Mensaje "No hay equipo asignado" vs configuración existente

**Observación:**
- En detalle de limpieza se muestra: "Atención requerida: No hay equipo asignado a esta limpieza"
- Pero la propiedad SÍ tiene `HostWorkGroupProperty` y `WorkGroupExecutor` activo
- El mensaje es correcto si `Cleaning.teamId` es `null`, pero puede ser confuso

**Estado actual:** El mensaje es técnicamente correcto (no hay `teamId` en Cleaning), pero no distingue entre:
- No hay configuración de equipo (Nivel 0)
- Hay configuración pero limpieza no asignada (Nivel 1)

**Pendiente:** Clarificar mensaje para distinguir estos casos.

---

#### 7.1.2 Mensaje "Ningún cleaner ha aceptado" vs "No hay equipo asignado"

**Observación:**
- Se muestran ambos mensajes en diferentes partes de la UI
- "No hay equipo asignado" en banner de atención requerida
- "Ningún cleaner ha aceptado" en tarjeta de asignación

**Estado actual:** Ambos mensajes pueden aparecer simultáneamente si:
- `Cleaning.teamId` es `null` (banner muestra "No hay equipo asignado")
- `Cleaning.assignedMembershipId` es `null` (tarjeta muestra "Ningún cleaner ha aceptado")

**Pendiente:** Unificar lógica para mostrar solo un mensaje relevante según el nivel de asignación.

---

#### 7.1.3 Navegación a propiedad muestra equipos, pero detalle de limpieza no

**Observación:**
- En detalle de limpieza, se muestra botón "Ver equipos" que abre modal
- El modal muestra equipos asignados a la propiedad
- Pero el banner de atención requerida no muestra esta información directamente

**Estado actual:** La información existe pero requiere navegación adicional.

**Pendiente:** Considerar mostrar información de equipos disponibles directamente en el detalle de limpieza.

---

#### 7.1.4 Uso inconsistente de "equipo" vs "cleaner"

**Observación:**
- Se usa "equipo" para referirse a Team (Services)
- Se usa "cleaner" para referirse a TeamMembership (cleaner individual)
- Pero estos términos se usan de forma intercambiable en algunos mensajes

**Estado actual:** Falta distinción clara entre:
- Equipo configurado (HostWorkGroup / WorkGroupExecutor)
- Equipo asignado (Cleaning.teamId)
- Cleaner que aceptó (Cleaning.assignedMembershipId)

**Pendiente:** Unificar lenguaje para distinguir estos conceptos.

---

### 7.2 Qué parte del contrato aún no se cumple

**No implementado completamente:**

1. **Distinción clara entre niveles de asignación:**
   - Los mensajes no distinguen claramente entre Nivel 0 (sin contexto) y Nivel 1 (contexto disponible sin asignar)
   - La UI no muestra explícitamente el nivel de asignación actual

2. **Mensajes unificados:**
   - Los mensajes de banner y tarjeta pueden ser redundantes o contradictorios
   - No hay lógica centralizada para determinar qué mensaje mostrar según el nivel

3. **Información de equipos disponibles:**
   - No se muestra directamente en detalle de limpieza qué equipos están disponibles
   - Requiere navegación a propiedad o modal adicional

4. **Lenguaje consistente:**
   - "Equipo" y "cleaner" se usan de forma inconsistente
   - No hay glosario claro de términos

---

### 7.3 Qué queda pendiente de implementación futura

**Pendiente de definir:**

1. **Flujo de asignación automática:**
   - ¿Cuándo se asigna automáticamente `teamId` al crear limpieza?
   - ¿Qué reglas determinan la asignación automática?

2. **Notificaciones a cleaners:**
   - ¿Cuándo se notifica a cleaners sobre limpiezas disponibles?
   - ¿Qué información se incluye en las notificaciones?

3. **Reasignación:**
   - ¿Cuándo se puede reasignar una limpieza?
   - ¿Qué sucede con la limpieza original al reasignar?

4. **Historial de asignaciones:**
   - ¿Se debe guardar historial de cambios de asignación?
   - ¿Qué información se debe registrar?

---

## 8. Glosario de términos

### 8.1 Términos clave

**Equipo configurado:**
- Un `HostWorkGroup` con `WorkGroupExecutor` activo, o un `PropertyTeam` (legacy)
- Indica que hay equipos **disponibles** para una propiedad

**Equipo asignado:**
- Un `Cleaning.teamId` establecido
- Indica que una limpieza está asignada a un Team específico

**Cleaner que aceptó:**
- Un `Cleaning.assignedMembershipId` establecido
- Indica que un cleaner individual ha aceptado la limpieza

**Limpieza en ejecución:**
- `Cleaning.status: IN_PROGRESS`
- Indica que la limpieza está siendo ejecutada

**Atención requerida:**
- `Cleaning.needsAttention: true`
- Indica que la limpieza requiere intervención del Host

---

## 9. Referencias cruzadas

### 9.1 Contratos relacionados

- **WORKGROUPS_V1.md:** Define estructura y comportamiento de Work Groups
- **HOY_HOST_V1.md:** Define comportamiento de la página "Hoy" y listados derivados

### 9.2 Archivos de código relevantes

- `lib/cleaning-attention-reasons.ts`: Lógica de cálculo de motivos de atención
- `app/host/cleanings/actions.ts`: Acciones de asignación de limpiezas
- `app/cleaner/actions.ts`: Acciones de aceptación de limpiezas
- `lib/workgroups/resolveEffectiveTeamsForProperty.ts`: Resolución de equipos disponibles

---

**Fin del contrato**

