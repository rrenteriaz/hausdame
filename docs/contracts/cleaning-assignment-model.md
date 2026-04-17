Cleaning Assignment Contract — Hausdame
🎯 Propósito

Definir de forma canónica y obligatoria cómo funciona la asignación de limpiezas en el sistema.

Este documento es la fuente de verdad para:

lógica de backend
queries
UI
futuras features

🧠 Principio central

Toda limpieza tiene:
- un grupo responsable (teamId)
- un responsable jerárquico implícito (TL del team)
- un ejecutor opcional y visible (assignedMembershipId)

El TL NO es el ejecutor visible para el Host.
El TL es el responsable jerárquico cuando no hay ejecutor específico asignado.

🧩 Campos oficiales

Requeridos:
  teamId: grupo responsable (puede ser null si no hay configuración)
  assignedMembershipId: ejecutor actual visible (puede ser null)
  status: PENDING | IN_PROGRESS | COMPLETED | CANCELLED

Deprecated (columnas DB — pendiente drop en Fase 8):
  assignedMemberId
  assignedTeamMemberId
  assignedToId

Estos campos:
  NO se usan en ninguna lógica activa (limpieza completada en Fase 5)
  siguen existiendo como columnas de DB hasta la migración de Fase 8
  NO deben usarse en código nuevo bajo ninguna circunstancia

🧑‍💼 Responsable jerárquico (TL)

- Se determina por TeamMembership.role === "TEAM_LEADER" y status === "ACTIVE"
- Helper: lib/cleanings/getResponsibleLeaderForTeam.ts
- El TL NO sustituye al ejecutor visible para el Host
- Cuando assignedMembershipId === null y teamId !== null: la responsabilidad operativa recae en el TL
- No se persiste el TL en la fila de Cleaning (se deriva de TeamMembership)
- Si un team tiene múltiples TL, se usa el más antiguo por createdAt

⚙️ Reglas canónicas

1. Creación de limpieza (helper: lib/cleanings/resolveAutoAssignment.ts)
  Orden de decisión:
  a. Si existe PropertyAssignmentConfig para (propertyId, teamId) y membership sigue ACTIVE:
       assignedMembershipId = preferredMembershipId → ASSIGNED
  b. Si no hay preferencia y hay exactamente 1 membership ACTIVE en el team:
       assignedMembershipId = esa membership → ASSIGNED
  c. Si hay 2+ memberships activas:
       assignedMembershipId = null → OPEN (requiere selección manual)
  d. Si hay 0 memberships activas:
       assignedMembershipId = null → OPEN + needsAttention: NO_AVAILABLE_MEMBER
  e. Si no hay team:
       assignedMembershipId = null → OPEN + needsAttention: NO_TEAM_CONFIGURED

2. Asignación
  assignedMembershipId != null → limpieza asignada a ejecutor específico
  assignedMembershipId == null → responsabilidad operativa en TL

3. Rechazo (declineCleaning)
  assignedMembershipId → null
  teamId permanece sin cambios
  La limpieza regresa al TL implícitamente (NO se asigna explícitamente al TL)
  needsAttention: true, attentionReason: "DECLINED_BY_ASSIGNEE"

4. Inicio (IN_PROGRESS) — CONGELAMIENTO
  status = IN_PROGRESS
  teamId y assignedMembershipId quedan CONGELADOS
  Guard: lib/cleanings/assertCleaningIsNotFrozen.ts
  Ninguna acción puede cambiar teamId ni assignedMembershipId después de este punto

5. Reasignación por TL (reassignCleaningByLeader)
  Solo si status === "PENDING"
  El actor debe ser TEAM_LEADER del mismo equipo
  El miembro destino debe tener TeamMembership ACTIVE en el mismo team
  Resultado: assignedMembershipId = targetMembershipId

6. Cambio de team por Host (changeCleaningTeam)
  Solo si status === "PENDING"
  El nuevo team debe tener cobertura válida sobre la propiedad (WGE o PropertyTeam)
  Al cambiar team: recalcular ejecutor con resolveAutoAssignment para el nuevo team

🏠 Preferencia por propiedad (PropertyAssignmentConfig)

El TL puede definir qué miembro de su equipo recibe automáticamente las limpiezas
de una propiedad específica.

Modelo: PropertyAssignmentConfig
  - propertyId + teamId (unique)
  - preferredMembershipId (FK a TeamMembership)

Validaciones:
  - preferredMembershipId.teamId debe coincidir con teamId
  - La propiedad debe estar ligada al team (WGE o PropertyTeam)
  - Si la membership preferida queda inactiva, se ignora y se aplica la regla estándar

Helper: lib/cleanings/resolvePreferredExecutorForProperty.ts

👁️ Contrato de UI (OBLIGATORIO)

Host debe ver:
  Si assignedMembershipId != null:
    mostrar ejecutor actual

  Si assignedMembershipId == null && teamId != null:
    mostrar "Equipo asignado" o nombre del equipo
    NO mostrar el TL como ejecutor (son roles distintos)

  Si teamId == null:
    mostrar "Requiere atención"

Cleaner / TL debe ver:
  Mis limpiezas (asignadas):
    assignedMembershipId ∈ mis memberships activas

  Limpiezas del equipo sin ejecutor (disponibles para aceptar):
    assignedMembershipId == null && teamId ∈ mis teams

🚫 Invariantes del sistema

Nunca puede existir:
  assignedMembershipId != null && teamId == null

Toda asignación debe resolverse vía:
  TeamMembership (assignedMembershipId)

Toda reasignación debe respetar el freeze guard:
  lib/cleanings/assertCleaningIsNotFrozen.ts

🔁 Auto-asignación

Centralizada en: lib/cleanings/resolveAutoAssignment.ts

Integrada en:
  - app/host/cleanings/actions.ts (createCleaning, changeCleaningTeam)
  - lib/integrations/ical/sync.ts (ical sync)
  - app/host/properties/create-missing-cleanings.ts (batch)

⚠️ Regla crítica

El Host nunca debe ver una limpieza como "asignada" si no existe ejecutor real
(assignedMembershipId !== null).

🔒 Estado de migración (Fase 5 completa — 2026-04-14)

assignedMemberId y assignedTeamMemberId eliminados de toda lógica activa.
Pendiente: drop de columnas DB (Fase 8)

📅 Modelo final implementado (2026-04-14)

Nuevo en esta fase:
  - PropertyAssignmentConfig — preferencia de ejecutor por propiedad+team
  - getResponsibleLeaderForTeam — helper TL
  - resolvePreferredExecutorForProperty — helper preferencia
  - resolveAutoAssignment — helper central de auto-asignación
  - assertCleaningIsNotFrozen — freeze guard
  - reassignCleaningByLeader — acción TL
  - changeCleaningTeam — acción Host

🧭 Fuente de verdad

Este contrato tiene prioridad sobre:
  implementaciones existentes
  comportamiento legacy
  suposiciones previas
