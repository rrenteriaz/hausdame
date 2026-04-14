// lib/inventory-suggestions.ts
// Plantillas sugeridas por categoría (hardcode en frontend)

import { InventoryCategory } from "@/lib/generated/prisma";

/**
 * Obtiene las categorías permitidas para un área específica.
 * Mapea áreas comunes a categorías de inventario relevantes.
 * 
 * @param area - Nombre del área (ej: "Cocina", "Baño", "Recámara 1")
 * @returns Array de categorías permitidas para esa área, o null si no hay restricción
 */
export function getAllowedCategoriesForArea(area: string): InventoryCategory[] | null {
  if (!area || area.trim().length === 0) {
    return null; // Sin área = sin filtro
  }

  const areaNormalized = area.trim().toLowerCase();

  // Cocina
  if (areaNormalized === "cocina") {
    return [
      InventoryCategory.TABLEWARE_UTENSILS,
      InventoryCategory.KITCHEN_ACCESSORIES,
      InventoryCategory.CONSUMABLES,
      InventoryCategory.FURNITURE_EQUIPMENT,
    ];
  }

  // Baño
  if (areaNormalized === "baño" || areaNormalized === "bano" || areaNormalized.startsWith("baño") || areaNormalized.startsWith("bano")) {
    return [
      InventoryCategory.LINENS,
      InventoryCategory.CONSUMABLES,
      InventoryCategory.DECOR,
    ];
  }

  // Recámaras
  if (areaNormalized.startsWith("recámara") || areaNormalized.startsWith("recamara") || areaNormalized.startsWith("habitación") || areaNormalized.startsWith("habitacion")) {
    return [
      InventoryCategory.LINENS,
      InventoryCategory.FURNITURE_EQUIPMENT,
      InventoryCategory.DECOR,
      InventoryCategory.CONSUMABLES,
    ];
  }

  // Sala o Comedor
  if (areaNormalized === "sala" || areaNormalized === "comedor") {
    return [
      InventoryCategory.FURNITURE_EQUIPMENT,
      InventoryCategory.DECOR,
      InventoryCategory.TABLEWARE_UTENSILS,
    ];
  }

  // Lavandería
  if (areaNormalized === "lavandería" || areaNormalized === "lavanderia" || areaNormalized.startsWith("lavandería") || areaNormalized.startsWith("lavanderia")) {
    return [
      InventoryCategory.CONSUMABLES,
      InventoryCategory.LINENS,
      InventoryCategory.FURNITURE_EQUIPMENT,
    ];
  }

  // Bodega, Patio, Jardín, Cochera, Área común
  if (
    areaNormalized === "bodega" ||
    areaNormalized === "patio" ||
    areaNormalized === "jardín" ||
    areaNormalized === "jardin" ||
    areaNormalized === "cochera" ||
    areaNormalized === "área común" ||
    areaNormalized === "area comun" ||
    areaNormalized.startsWith("área común") ||
    areaNormalized.startsWith("area comun")
  ) {
    return [
      InventoryCategory.FURNITURE_EQUIPMENT,
      InventoryCategory.CONSUMABLES,
      InventoryCategory.OTHER,
      InventoryCategory.DECOR,
    ];
  }

  // Si no coincide con ninguna área conocida, retornar null (sin filtro)
  return null;
}

export interface VariantOption {
  value: string; // Valor estable (snake/lowercase): "individual", "queen", etc.
  label: string; // Label en español: "Individual", "Queen", etc.
}

export interface InventorySuggestion {
  name: string;
  variantKey?: string; // ej: "bed_size"
  variantLabel?: string; // ej: "Tamaño de cama"
  variantOptions?: VariantOption[]; // Opciones de variante
}

// Definición de variantes reutilizables
export const BED_SIZE_VARIANT: {
  variantKey: string;
  variantLabel: string;
  variantOptions: VariantOption[];
} = {
  variantKey: "bed_size",
  variantLabel: "Tamaño de cama",
  variantOptions: [
    { value: "individual", label: "Individual" },
    { value: "matrimonial", label: "Matrimonial" },
    { value: "queen", label: "Queen" },
    { value: "king", label: "King" },
  ],
};


export const INVENTORY_SUGGESTIONS: Record<InventoryCategory, InventorySuggestion[]> = {
  FURNITURE_EQUIPMENT: [
    { 
      name: "Colchón",
      variantKey: BED_SIZE_VARIANT.variantKey,
      variantLabel: BED_SIZE_VARIANT.variantLabel,
      variantOptions: BED_SIZE_VARIANT.variantOptions,
    },
    { 
      name: "Cubre colchón",
      variantKey: BED_SIZE_VARIANT.variantKey,
      variantLabel: BED_SIZE_VARIANT.variantLabel,
      variantOptions: BED_SIZE_VARIANT.variantOptions,
    },
    { 
      name: "Base cama / Box",
      variantKey: BED_SIZE_VARIANT.variantKey,
      variantLabel: BED_SIZE_VARIANT.variantLabel,
      variantOptions: BED_SIZE_VARIANT.variantOptions,
    },
    { name: "Cama" },
    { 
      name: "Cabecera",
      variantKey: BED_SIZE_VARIANT.variantKey,
      variantLabel: BED_SIZE_VARIANT.variantLabel,
      variantOptions: BED_SIZE_VARIANT.variantOptions,    
     },
    { name: "Buró" },
    { name: "Espejo" },
    { name: "Ventilador" },
    { name: "Silla" },
    { name: "Mesa" },
    { name: "Refrigerador" },
    { name: "TV" },
    { name: "Microondas" },
    { name: "Aire acondicionado" },
    { name: "Router" },
    { name: "Sofá" },
    { name: "Escritorio" },
    { name: "Lámpara" },
  ],
  LINENS: [
    { 
      name: "Juego Sábanas",
      variantKey: BED_SIZE_VARIANT.variantKey,
      variantLabel: BED_SIZE_VARIANT.variantLabel,
      variantOptions: BED_SIZE_VARIANT.variantOptions,
       },
    { 
      name: "Cubre colchón",
      variantKey: BED_SIZE_VARIANT.variantKey,
      variantLabel: BED_SIZE_VARIANT.variantLabel,
      variantOptions: BED_SIZE_VARIANT.variantOptions,
     },
    { 
      name: "Cobija",
    variantKey: BED_SIZE_VARIANT.variantKey,
    variantLabel: BED_SIZE_VARIANT.variantLabel,
    variantOptions: BED_SIZE_VARIANT.variantOptions,
    },
    { 
      name: "Cobertor",
    variantKey: BED_SIZE_VARIANT.variantKey,
    variantLabel: BED_SIZE_VARIANT.variantLabel,
    variantOptions: BED_SIZE_VARIANT.variantOptions,
    },    
    { name: "Toalla grande" },
    { name: "Toalla de manos" },
    { name: "Toalla de baño" },
    { name: "Almohada" },
    { 
      name: "Colcha",
      variantKey: BED_SIZE_VARIANT.variantKey,
      variantLabel: BED_SIZE_VARIANT.variantLabel,
      variantOptions: BED_SIZE_VARIANT.variantOptions,
       },
  ],
  TABLEWARE_UTENSILS: [
    { name: "Vaso" },
    { name: "Plato ensalada"},
    { name: "Plato postre"},
    { name: "Plato principal"},
    { name: "Plato hondo"},
    { name: "Taza" },
    { name: "Tenedor ensalada" },
    { name: "Tenedor principal" },
    { name: "Cuchara cafetera" },
    { name: "Cuchara principal" },
    { name: "Cuchillo frutas" },
    { name: "Cuchillo carne" },
    { name: "Sartén" },
    { name: "Tapa sartén" },
    { name: "Comal" },
    { name: "Olla" },
    { name: "Tapa de olla" },
    { name: "Tabla de cortar" },
    { name: "Cuchillo cocina" },
    { name: "Exprimidor limones" },
    { name: "Exprimidor naranjas" },
    { name: "Encendedor" },
    { name: "Tijeras cocina" },
    { name: "Salvamanteles" },
  ],
  DECOR: [
    { name: "Cuadro" },
    { name: "Espejo" },
    { name: "Planta" },
    { name: "Jarrón" },
    { name: "Velas" },
    { name: "Cojín decorativo" },
  ],
  KITCHEN_ACCESSORIES: [
    { name: "Cafetera" },
    { name: "Tostadora" },
    { name: "Licuadora" },
    { name: "Exprimidor" },
    { name: "Batidora" },
    { name: "Olla de presión" },
  ],
  KEYS_ACCESS: [
    { name: "Tag peatonal" },
    { name: "Tag vehículo" },
    { name: "Control cochera" },
    { name: "Llave puerta" },
    { name: "Llave principal" },
    { name: "Tarjeta de acceso" },
    { name: "Control remoto" },
  ],
  CONSUMABLES: [
    { name: "Papel higiénico" },
    { name: "Jabón" },
    { name: "Shampoo" },
    { name: "Detergente" },
    { name: "Toallas desechables" },
    { name: "Café" },
    { name: "Azúcar" },
    { name: "Sal" },
  ],
  OTHER: [],
};

export const AREA_SUGGESTIONS = [
  "Cocina",
  "Baño 1",
  "Baño 2",
  "Recámara 1",
  "Recámara 2",
  "Recámara 3",
  "Sala",
  "Comedor",
  "Lavandería",
  "Bodega",
  "Patio",
  "Jardín",
  "Cochera",
  "Área común",
];

export function getCategoryLabel(category: InventoryCategory): string {
  const labels: Record<InventoryCategory, string> = {
    FURNITURE_EQUIPMENT: "Mobiliario y equipo",
    LINENS: "Blancos",
    TABLEWARE_UTENSILS: "Vajilla y utensilios",
    DECOR: "Decoración",
    KITCHEN_ACCESSORIES: "Accesorios de cocina",
    KEYS_ACCESS: "Llaves y accesos",
    CONSUMABLES: "Suministros y consumibles",
    OTHER: "Otros",
  };
  return labels[category];
}

/**
 * Obtiene el label de una variante por su value.
 * Por ahora solo soporta bed_size, pero preparado para extensión.
 */
export function getVariantLabel(variantKey: string, variantValue: string): string {
  if (variantKey === "bed_size") {
    const option = BED_SIZE_VARIANT.variantOptions.find(
      (opt) => opt.value === variantValue
    );
    return option?.label || variantValue;
  }
  return variantValue;
}

/**
 * Determina si un item (por nombre o por configuración) es variantable con bedSize.
 * Items variantables: colchón, sábanas, almohadas, cobertor, colcha, cubre colchón, base cama, cabecera.
 */
export function isBedSizeVariantable(itemName: string, defaultVariantKey?: string | null): boolean {
  // Si el item ya tiene defaultVariantKey configurado como bed_size, es variantable
  if (defaultVariantKey === "bed_size") {
    return true;
  }

  // Si no tiene variantKey configurado, inferir por nombre
  const normalized = itemName.trim().toLowerCase();
  
  const variantableKeywords = [
    "colchón",
    "colchon",
    "sábanas",
    "sabanas",
    "almohadas",
    "almohada",
    "cobertor",
    "colcha",
    "cubre colchón",
    "cubre colchon",
    "base cama",
    "box",
    "cabecera",
  ];

  return variantableKeywords.some(keyword => normalized.includes(keyword));
}

/**
 * Obtiene la configuración de variante bedSize para un item variantable.
 */
export function getBedSizeVariantConfig() {
  return {
    variantKey: BED_SIZE_VARIANT.variantKey,
    variantLabel: BED_SIZE_VARIANT.variantLabel,
    variantOptions: BED_SIZE_VARIANT.variantOptions,
  };
}

