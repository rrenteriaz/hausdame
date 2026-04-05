/**
 * Grupos de variantes canónicos del sistema (definidos por Hausdame, no editables por el usuario).
 * Coinciden con CANONICAL_GROUPS en lib/variant-groups-bootstrap.ts.
 *
 * - `value`: etiqueta de visualización y valor almacenado en variantValue (p. ej. "Barro", "Individual")
 * - `valueNormalized`: clave normalizada para comparación y búsqueda (p. ej. "barro", "individual")
 */
export const CANONICAL_VARIANT_GROUPS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly valueNormalized: string }>;
}> = [
  {
    key: "bed_size",
    label: "Tamaño de cama",
    options: [
      { value: "Individual", valueNormalized: "individual" },
      { value: "Matrimonial", valueNormalized: "matrimonial" },
      { value: "Queen", valueNormalized: "queen" },
      { value: "King", valueNormalized: "king" },
    ],
  },
  {
    key: "material",
    label: "Material",
    options: [
      { value: "Barro", valueNormalized: "barro" },
      { value: "Cantera", valueNormalized: "cantera" },
      { value: "Cerámica", valueNormalized: "ceramica" },
      { value: "MDF", valueNormalized: "mdf" },
      { value: "Madera", valueNormalized: "madera" },
      { value: "Metal", valueNormalized: "metal" },
      { value: "Plástico", valueNormalized: "plastico" },
      { value: "Tela", valueNormalized: "tela" },
      { value: "Vidrio", valueNormalized: "vidrio" },
      { value: "Melamina", valueNormalized: "melamina" },
      { value: "Aluminio", valueNormalized: "aluminio" },
      { value: "Acero", valueNormalized: "acero" },
      { value: "Acero inoxidable", valueNormalized: "acero_inoxidable" },
      { value: "Piedra", valueNormalized: "piedra" },
      { value: "Granito", valueNormalized: "granito" },
    ],
  },
  {
    key: "size",
    label: "Tamaño",
    options: [
      { value: "Mini", valueNormalized: "mini" },
      { value: "Chico", valueNormalized: "chico" },
      { value: "Mediano", valueNormalized: "mediano" },
      { value: "Grande", valueNormalized: "grande" },
      { value: "Extra Grande", valueNormalized: "extra_grande" },
    ],
  },
] as const;
