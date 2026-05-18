export type PropertySetupItemKey =
  | "identity"
  | "location"
  | "operation"
  | "calendar"
  | "workgroup"
  | "executor"
  | "group"
  | "notifications"
  | "access"
  | "wifi"
  | "checklist"
  | "ical-health";

export type PropertySetupItemCategory = "required" | "recommended";

export type PropertySetupItemStatus = "complete" | "missing" | "warning";

export type PropertySetupItem = {
  key: PropertySetupItemKey;
  category: PropertySetupItemCategory;
  title: string;
  description: string;
  ctaLabel: string;
  completed: boolean;
  status: PropertySetupItemStatus;
};

export type PropertySetupProgress = {
  completedItems: number;
  totalItems: number;
  currentItem: PropertySetupItem | null;
  items: PropertySetupItem[];
  requiredMissing: PropertySetupItem[];
  recommendedMissing: PropertySetupItem[];
  isOperational: boolean;
  hasWarnings: boolean;
};

export type PropertySetupInput = {
  property: {
    name?: string | null;
    shortName?: string | null;
    address?: string | null;
    icalUrl?: string | null;
    timeZone?: string | null;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    groupName?: string | null;
    notificationEmail?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    wifiSsid?: string | null;
    wifiPassword?: string | null;
    accessCode?: string | null;
    icalLastSyncError?: string | null;
  };
  assignedWorkGroupsCount: number;
  activeExecutorsCount: number;
  activeChecklistItemsCount: number;
};

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function makeItem(
  item: Omit<PropertySetupItem, "completed" | "status">,
  completed: boolean,
  status: PropertySetupItemStatus = completed ? "complete" : "missing"
): PropertySetupItem {
  return {
    ...item,
    completed,
    status,
  };
}

export function getPropertySetupProgress({
  property,
  assignedWorkGroupsCount,
  activeExecutorsCount,
  activeChecklistItemsCount,
}: PropertySetupInput): PropertySetupProgress {
  const hasIdentity = hasValue(property.name) && hasValue(property.shortName);
  const hasLocation =
    hasValue(property.address) &&
    property.latitude !== null &&
    property.latitude !== undefined &&
    property.longitude !== null &&
    property.longitude !== undefined;
  const hasOperation =
    hasValue(property.checkInTime) &&
    hasValue(property.checkOutTime) &&
    hasValue(property.timeZone);
  const hasCalendar = hasValue(property.icalUrl);
  const hasWorkGroup = assignedWorkGroupsCount > 0;
  const hasActiveExecutor = activeExecutorsCount > 0;
  const hasGroup = hasValue(property.groupName);
  const hasNotifications = hasValue(property.notificationEmail);
  const hasAccess = hasValue(property.accessCode);
  const hasWifi = hasValue(property.wifiSsid) && hasValue(property.wifiPassword);
  const hasChecklist = activeChecklistItemsCount > 0;
  const hasIcalError = hasValue(property.icalLastSyncError);

  const items: PropertySetupItem[] = [
    makeItem(
      {
        key: "identity",
        category: "required",
        title: "Completar identidad",
        description: "Agrega nombre y alias corto para reconocer la propiedad en listados y limpiezas.",
        ctaLabel: "Editar propiedad",
      },
      hasIdentity
    ),
    makeItem(
      {
        key: "location",
        category: "required",
        title: "Definir ubicación",
        description: "Guarda dirección y coordenadas para que el equipo ubique la propiedad sin fricción.",
        ctaLabel: "Editar propiedad",
      },
      hasLocation
    ),
    makeItem(
      {
        key: "operation",
        category: "required",
        title: "Configurar operación",
        description: "Define check-in, check-out y zona horaria para calendarizar correctamente.",
        ctaLabel: "Editar propiedad",
      },
      hasOperation
    ),
    makeItem(
      {
        key: "calendar",
        category: "required",
        title: "Conectar calendario",
        description: "Agrega la URL iCal para importar reservas y generar limpiezas.",
        ctaLabel: "Conectar calendario",
      },
      hasCalendar
    ),
    makeItem(
      {
        key: "workgroup",
        category: "required",
        title: "Asignar WorkGroup",
        description: "Asocia esta propiedad a un grupo de trabajo para operar con equipos.",
        ctaLabel: "Asignar equipo",
      },
      hasWorkGroup
    ),
    makeItem(
      {
        key: "executor",
        category: "required",
        title: "Conectar ejecutor",
        description: "Asegura que al menos un WorkGroup asignado tenga un equipo activo.",
        ctaLabel: "Asignar equipo",
      },
      hasActiveExecutor
    ),
    makeItem(
      {
        key: "group",
        category: "recommended",
        title: "Organizar en grupo",
        description: "Usa grupo para separar zonas, edificios o portafolios.",
        ctaLabel: "Editar propiedad",
      },
      hasGroup
    ),
    makeItem(
      {
        key: "notifications",
        category: "recommended",
        title: "Agregar email de notificaciones",
        description: "Define dónde recibir avisos operativos de esta propiedad.",
        ctaLabel: "Editar propiedad",
      },
      hasNotifications
    ),
    makeItem(
      {
        key: "access",
        category: "recommended",
        title: "Configurar acceso",
        description: "Indica si ya hay instrucciones o clave de acceso guardadas para el equipo.",
        ctaLabel: "Editar propiedad",
      },
      hasAccess
    ),
    makeItem(
      {
        key: "wifi",
        category: "recommended",
        title: "Configurar WiFi",
        description: "Guarda red y contraseña para que el equipo pueda resolver incidencias en sitio.",
        ctaLabel: "Editar propiedad",
      },
      hasWifi
    ),
    makeItem(
      {
        key: "checklist",
        category: "recommended",
        title: "Crear checklist",
        description: "Agrega tareas base para estandarizar cada limpieza de esta propiedad.",
        ctaLabel: "Crear checklist",
      },
      hasChecklist
    ),
    makeItem(
      {
        key: "ical-health",
        category: "recommended",
        title: "Revisar sincronización iCal",
        description: "Hay un error reciente de sincronización; revisa la URL o fuerza la sincronización.",
        ctaLabel: "Conectar calendario",
      },
      !hasIcalError,
      hasIcalError ? "warning" : "complete"
    ),
  ];

  const requiredMissing = items.filter(
    (item) => item.category === "required" && !item.completed
  );
  const recommendedMissing = items.filter(
    (item) => item.category === "recommended" && !item.completed
  );
  const completedItems = items.filter((item) => item.completed).length;
  const currentItem =
    requiredMissing[0] ??
    recommendedMissing.find((item) => item.status === "warning") ??
    recommendedMissing[0] ??
    null;

  return {
    completedItems,
    totalItems: items.length,
    currentItem,
    items,
    requiredMissing,
    recommendedMissing,
    isOperational: requiredMissing.length === 0,
    hasWarnings: recommendedMissing.length > 0,
  };
}
