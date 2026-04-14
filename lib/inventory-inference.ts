/**
 * Sistema de inferencias para inventario
 * Infiere nivel de atención y categoría basado en el nombre del item
 */

import { InventoryCategory, InventoryPriority } from "@/lib/generated/prisma";
import { normalizeName } from "./inventory-normalize";

/**
 * Nivel de atención inferido para un item
 * Mapea directamente a InventoryPriority
 */
export type AttentionLevel = "HIGH" | "MEDIUM" | "LOW";

/**
 * Resultado de la inferencia para un item
 */
export interface InventoryInference {
  attentionLevel: AttentionLevel;
  priority: InventoryPriority;
  category: InventoryCategory;
  hint?: string; // Microtexto descriptivo (ej. "Se pierde fácilmente")
}

/**
 * Infiere el nivel de atención basado en el nombre normalizado del item
 */
export function inferAttentionLevel(itemName: string): AttentionLevel {
  const normalized = normalizeName(itemName);

  // ALTA (HIGH): Se pierde o se rompe con facilidad
  const highAttentionKeywords = [
    // Blancos (se pierden fácilmente)
    "toalla",
    "sabana",
    "cobija",
    "almohada",
    "funda",
    "cojin",
    "cojín",
    "manta",
    "edredon",
    "edredón",
    // Vajilla (se rompe fácilmente)
    "vaso",
    "plato",
    "cubierto",
    "taza",
    "copa",
    "tazón",
    "bowl",
    "jarra",
    "botella",
    "termo",
    // Controles y accesos (se pierden)
    "control",
    "remoto",
    "llave",
    "llaves",
    "acceso",
    "tarjeta",
    "mando",
    "mando a distancia",
    // Pequeños objetos decorativos
    "adorno",
    "figura",
    "estatua",
    "escultura",
    "cuadro",
    "marco",
    "vela",
    "veladora",
  ];

  // MEDIA (MEDIUM): Puede dañarse o fallar
  const mediumAttentionKeywords = [
    // Electrodomésticos pequeños
    "cafetera",
    "licuadora",
    "microondas",
    "plancha",
    "secadora",
    "ventilador",
    "calentador",
    "hervidor",
    "tostador",
    "exprimidor",
    // Dispositivos electrónicos
    "router",
    "modem",
    "dispositivo",
    "sensor",
    "detector",
    "alarma",
    "cámara",
    "camara",
    "intercomunicador",
    // Accesorios de cocina
    "batidora",
    "procesador",
    "molinillo",
    "rallador",
    "pelador",
  ];

  // BAJA (LOW): Rara vez cambia
  const lowAttentionKeywords = [
    // Muebles grandes
    "cama",
    "sofa",
    "sofá",
    "mesa",
    "silla",
    "sillón",
    "sillon",
    "escritorio",
    "estante",
    "estantería",
    "estanteria",
    "repisa",
    "anaquel",
    "ropero",
    "closet",
    "armario",
    "cómoda",
    "comoda",
    "cajonera",
    "cajonera",
    // Electrodomésticos grandes
    "refrigerador",
    "refri",
    "lavadora",
    "secadora",
    "lavavajillas",
    "lavavajilla",
    "horno",
    "estufa",
    "cocina",
    // Estructuras fijas
    "ducha",
    "regadera",
    "lavabo",
    "inodoro",
    "wc",
    "tina",
    "bañera",
    "banera",
  ];

  // Verificar keywords de alta atención
  for (const keyword of highAttentionKeywords) {
    if (normalized.includes(keyword)) {
      return "HIGH";
    }
  }

  // Verificar keywords de baja atención
  for (const keyword of lowAttentionKeywords) {
    if (normalized.includes(keyword)) {
      return "LOW";
    }
  }

  // Verificar keywords de media atención
  for (const keyword of mediumAttentionKeywords) {
    if (normalized.includes(keyword)) {
      return "MEDIUM";
    }
  }

  // Fallback: MEDIA si no hay match
  return "MEDIUM";
}

/**
 * Infiere la categoría basada en keywords del nombre
 */
export function inferCategory(itemName: string): InventoryCategory {
  const normalized = normalizeName(itemName);

  // Seguridad y accesos
  if (
    normalized.includes("sensor") ||
    normalized.includes("detector") ||
    normalized.includes("alarma") ||
    normalized.includes("llave") ||
    normalized.includes("llaves") ||
    normalized.includes("acceso") ||
    normalized.includes("tarjeta") ||
    normalized.includes("candado") ||
    normalized.includes("cerradura") ||
    normalized.includes("chapa")
  ) {
    return InventoryCategory.KEYS_ACCESS;
  }

  // Blancos (toallas, sábanas, etc.)
  if (
    normalized.includes("toalla") ||
    normalized.includes("sabana") ||
    normalized.includes("cobija") ||
    normalized.includes("almohada") ||
    normalized.includes("funda") ||
    normalized.includes("cojin") ||
    normalized.includes("cojín") ||
    normalized.includes("manta") ||
    normalized.includes("edredon") ||
    normalized.includes("edredón") ||
    normalized.includes("colcha") ||
    normalized.includes("sabanilla")
  ) {
    return InventoryCategory.LINENS;
  }

  // Vajilla y utensilios
  if (
    normalized.includes("vaso") ||
    normalized.includes("plato") ||
    normalized.includes("cubierto") ||
    normalized.includes("taza") ||
    normalized.includes("copa") ||
    normalized.includes("tazón") ||
    normalized.includes("bowl") ||
    normalized.includes("jarra") ||
    normalized.includes("botella") ||
    normalized.includes("termo") ||
    normalized.includes("cuchara") ||
    normalized.includes("tenedor") ||
    normalized.includes("cuchillo") ||
    normalized.includes("servilleta") ||
    normalized.includes("mantel")
  ) {
    return InventoryCategory.TABLEWARE_UTENSILS;
  }

  // Accesorios de cocina
  if (
    normalized.includes("cafetera") ||
    normalized.includes("licuadora") ||
    normalized.includes("microondas") ||
    normalized.includes("plancha") ||
    normalized.includes("batidora") ||
    normalized.includes("procesador") ||
    normalized.includes("molinillo") ||
    normalized.includes("rallador") ||
    normalized.includes("pelador") ||
    normalized.includes("tostador") ||
    normalized.includes("exprimidor") ||
    normalized.includes("hervidor") ||
    normalized.includes("calentador") ||
    normalized.includes("bote") ||
    normalized.includes("basura") ||
    normalized.includes("cesto") ||
    normalized.includes("canasta")
  ) {
    return InventoryCategory.KITCHEN_ACCESSORIES;
  }

  // Electrodomésticos grandes
  if (
    normalized.includes("refrigerador") ||
    normalized.includes("refri") ||
    normalized.includes("lavadora") ||
    normalized.includes("secadora") ||
    normalized.includes("lavavajillas") ||
    normalized.includes("lavavajilla") ||
    normalized.includes("horno") ||
    normalized.includes("estufa") ||
    normalized.includes("cocina") ||
    normalized.includes("ventilador") ||
    normalized.includes("aire") ||
    normalized.includes("acondicionado")
  ) {
    return InventoryCategory.FURNITURE_EQUIPMENT;
  }

  // Decoración
  if (
    normalized.includes("adorno") ||
    normalized.includes("figura") ||
    normalized.includes("estatua") ||
    normalized.includes("escultura") ||
    normalized.includes("cuadro") ||
    normalized.includes("marco") ||
    normalized.includes("vela") ||
    normalized.includes("veladora") ||
    normalized.includes("florero") ||
    normalized.includes("maceta") ||
    normalized.includes("planta")
  ) {
    return InventoryCategory.DECOR;
  }

  // Consumibles
  if (
    normalized.includes("papel") ||
    normalized.includes("jabon") ||
    normalized.includes("jabón") ||
    normalized.includes("shampoo") ||
    normalized.includes("champu") ||
    normalized.includes("acondicionador") ||
    normalized.includes("crema") ||
    normalized.includes("detergente") ||
    normalized.includes("suavizante")
  ) {
    return InventoryCategory.CONSUMABLES;
  }

  // Fallback: OTHER (categoría genérica)
  return InventoryCategory.OTHER;
}

/**
 * Genera un hint descriptivo basado en el nivel de atención
 */
export function getAttentionHint(attentionLevel: AttentionLevel): string {
  switch (attentionLevel) {
    case "HIGH":
      return "Se pierde o se rompe con facilidad";
    case "MEDIUM":
      return "Puede dañarse o fallar";
    case "LOW":
      return "Rara vez cambia";
    default:
      return "";
  }
}

/**
 * Infiere atención, categoría y hint para un item
 */
export function inferInventoryData(itemName: string): InventoryInference {
  const attentionLevel = inferAttentionLevel(itemName);
  const category = inferCategory(itemName);
  const hint = getAttentionHint(attentionLevel);

  // Mapear attentionLevel a InventoryPriority
  const priority: InventoryPriority =
    attentionLevel === "HIGH"
      ? InventoryPriority.HIGH
      : attentionLevel === "LOW"
      ? InventoryPriority.LOW
      : InventoryPriority.MEDIUM;

  return {
    attentionLevel,
    priority,
    category,
    hint,
  };
}

