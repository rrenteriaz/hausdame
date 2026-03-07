# Incidencias (Inbox de Inventario) — Contrato v2

**Estado:** Canonical  
**Última actualización:** v2.0 — Soporte para Evidencia Fotográfica y Detalle Extendido  
**Alcance:** Sistema de inbox de inventario para revisión, resolución y gestión de evidencias fotográficas.

---

## 1. Novedades en v2.0 (Resumen)

1.  **Evidencia Fotográfica**: Los reportes ahora incluyen miniaturas de las fotos tomadas por el cleaner.
2.  **Tarjetas Clickables**: Todas las tarjetas del inbox son clickables para abrir el detalle/resolución.
3.  **Visualizador (Lightbox)**: Inclusión de un visor de fotos a pantalla completa en el detalle.
4.  **Eliminación Robusta**: Implementación de borrado físico de reportes `PENDING` con limpieza de archivos en Storage (Supabase).
5.  **UX Móvil Optimizada**: Filtros basados en iconos y selectores de tipo "Bottom Sheet".

---

## 2. Tipos de Incidencias y Flujos

### 2.1 Cambios de Cantidad (CHANGE)
- **Origen**: Diferencia entre cantidad contada y cantidad esperada durante un inventario.
- **Flujo**:
    - **Aceptar y Aplicar**: Sincroniza la cantidad del cambio con la línea de inventario activa.
    - **Rechazar**: Marca como rechazado; el inventario permanece sin cambios.

### 2.2 Reportes de Daño/Incidencia (REPORT)
- **Origen**: Reportado manualmente por el Cleaner o Host (daños, limpieza profunda, faltantes).
- **Evidencia**: Puede contener múltiples fotos alojadas en Supabase Storage (bucket `assets`).
- **Resoluciones Especiales**:
    - `DISCARD`, `MARK_LOST`, `STORE`: Estas resoluciones desactivan automáticamente las líneas de inventario asociadas al item y, si el item queda sin líneas activas, se archiva el item.

---

## 3. Estados y Reglas de Negocio

### 3.1 Estados de Incidencia
| Estado | Descripción | Visible en Tab |
| :--- | :--- | :--- |
| `PENDING` | Recién creada, requiere acción del Host. | Pendientes |
| `APPLIED` / `RESOLVED` | Acción completada exitosamente. | Resueltos |
| `REJECTED` | Desestimada por el Host. | Resueltos |

### 3.2 Regla de Eliminación
- **Permitido**: Solo reportes en estado `PENDING` pueden ser eliminados.
- **Acción**: Borra el registro de la base de datos y **elimina permanentemente** los archivos de imagen asociados en Supabase.
- **Prohibido**: No se pueden eliminar incidencias que ya han sido procesadas o aplicadas.

---

## 4. Interfaz de Usuario (UX)

### 4.1 Pantalla Principal (`/host/inventory/inbox`)
- **Filtros Persistentes**: Los filtros (Propiedad, Tipo, Severidad, Fecha) se guardan en la URL.
- **Contadores Reales**: Los contadores de los tabs se recalculan en tiempo real tras cada acción.

### 4.2 Tarjeta de Incidencia (`InventoryInboxItemCard`)
- **Thumbnail**: Muestra la foto del item o la primera foto de evidencia.
- **Click Flow**: Al hacer tap/click en cualquier parte de la tarjeta (excepto botones), se abre el modal de Detalle/Resolución.

### 4.3 Detalle y Lightbox
- **Miniaturas de Evidencia**: Carrusel horizontal de fotos dentro del modal.
- **Lightbox**: Al hacer clic en una miniatura, se expande a pantalla completa con fondo oscurecido.

---

## 5. Especificaciones Técnicas

### 5.1 Almacenamiento de Imágenes
- **Bucket**: `assets`
- **Ruta**: `tenants/{tenantId}/assets/{year}/{month}/{id}.{ext}`
- **Provider**: Supabase Storage

### 5.2 Acciones de Servidor (Server Actions)
- `applyInventoryChange`: Aplica el cambio a la tabla `InventoryLine`.
- `resolveInventoryReport`: Registra la solución y aplica efectos secundarios (deactivación de líneas).
- `deleteInventoryReport`: Realiza el cleanup de Storage y DB.

---

**Versión:** 2.0  
**Fecha:** Marzo 2026  
**Mantenedor:** Equipo Antigravity (Hausdame)
