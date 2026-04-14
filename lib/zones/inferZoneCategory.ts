/**
 * Inferencia determinística de categoría de zona a partir del nombre.
 * Las reglas se evalúan en orden: frases específicas primero, luego palabras clave.
 * Retorna null si no hay match claro.
 */

import { PropertyZoneOperationalCategory } from "@/lib/generated/prisma";
import { normalizeName } from "@/lib/inventory-normalize";

// Ordenadas de más específico a más general para evitar falsos positivos
const RULES: Array<{
  phrases: string[];
  category: PropertyZoneOperationalCategory;
}> = [
  // Frases específicas (prioridad alta)
  { phrases: ["cuarto de lavado", "area de lavado", "cuarto lavado"], category: "LAUNDRY" },
  { phrases: ["closet de blancos"],                                    category: "STORAGE" },
  { phrases: ["medio bano"],                                           category: "BATHROOM" },

  // Palabras clave
  { phrases: ["lavanderia", "lavado"],                                                         category: "LAUNDRY"  },
  { phrases: ["bano", "wc"],                                                                   category: "BATHROOM" },
  { phrases: ["cocina", "cocineta"],                                                           category: "KITCHEN"  },
  { phrases: ["sala", "estancia", "living"],                                                   category: "SOCIAL"   },
  { phrases: ["comedor"],                                                                      category: "DINING"   },
  { phrases: ["recamara", "dormitorio", "habitacion", "cuarto"],                              category: "BEDROOM"  },
  { phrases: ["patio", "terraza", "balcon", "jardin", "cochera", "garage", "exterior"],       category: "OUTDOOR"  },
  { phrases: ["almacen", "bodega", "despensa"],                                               category: "STORAGE"  },
];

export function inferZoneCategory(
  name: string
): PropertyZoneOperationalCategory | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const normalized = normalizeName(trimmed);

  for (const rule of RULES) {
    for (const phrase of rule.phrases) {
      if (normalized.includes(phrase)) {
        return rule.category;
      }
    }
  }

  return null;
}
