# HAUSDAME — INVITES CONTRACT (TEAM + JOIN)

Este documento es la **única fuente de verdad** para:
- Invitaciones de equipo (Team scope: TL/Host).
- Pantalla pública de invitación (/join).

---

## 1) Entidad `TeamInvite` (campos relevantes)

- `id`
- `teamId`
- `token`
- `status` (`PENDING` | `CLAIMED` | `REVOKED`)
- `prefillName` (string | null)
- `message` (string | null) *(se genera en backend; UI puede mostrarlo read-only)*
- `createdAt`
- `expiresAt`
- `claimedAt` (Date | null)

> Nota: `EXPIRED` puede ser **estado efectivo** por fecha, aunque en DB siga como `PENDING` (lazy-expire).

---

## 2) Reglas de estado (estado efectivo)

### 2.1 Estados
- **PENDING**: utilizable hasta `expiresAt`.
- **EXPIRED** (efectivo): cuando `status === PENDING` y `expiresAt < now`.
- **REVOKED**: no utilizable.
- **CLAIMED**: ya aceptada.

### 2.2 Regla obligatoria de expiración (frontend/listados)
El frontend puede recalcular expiración para mostrar consistencia visual:

Si `status === PENDING` y `expiresAt < now` → status efectivo = `EXPIRED`.

Esto evita inconsistencias UI si la DB aún no cambió `status`.

---

## 3) Fuente de verdad (anti-inferencia)

### 3.1 `/join` (público)
El backend `GET /api/invites/[token]` es la **única fuente de verdad** para:
- `inviterName`
- `teamDisplayName`
- `status`
- `expiresAt`
- `message`

El frontend **consume**, NO deduce.

**Prohibido**:
- Inferir nombres desde strings (ej. parsear `message`)
- Cambiar permisos
- Alterar flujos de claim
- Mostrar acciones administrativas en /join

---

## 4) Endpoints — General Pattern

Todos los endpoints que listan o crean invitaciones deben retornar el campo `inviteLink`.

### 4.1 Teams Scope (TL/Host)
- **GET** `/api/teams/:teamId/invites`
- **POST** `/api/teams/:teamId/invites`
- Retornan: `inviteLink`, `prefillName`, `status`, `expiresAt`.

### 4.2 Workgroup Scope (Host)
- **POST** `/api/host-workgroups/:workGroupId/invites`
- Retornan: `inviteLink`, `prefillName`, `token`.
- Ruta pública: `/join/host?token=...`

### 4.3 Property Scope (Host)
- **POST** `/api/properties/:propertyId/invites`
- Retornan: `inviteLink`.
- Ruta pública: `/join?token=...&type=property`

---

## 5) Generación de Links (Source of Truth)

1.  **Prioridad de URL Base**:
    - `APP_BASE_URL` (Variable de entorno).
    - **Request Origin**: Si la variable falta, el backend usa el origen real de la petición (`req.nextUrl.origin`).
2.  **Responsabilidad**: El backend es el único responsable de construir el link completo. El frontend **jamás** debe reconstruir el link localmente.
