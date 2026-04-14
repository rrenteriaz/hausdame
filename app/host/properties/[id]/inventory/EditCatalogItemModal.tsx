"use client";

import { useState, useEffect, useRef } from "react";
import { BED_SIZE_VARIANT, type VariantOption } from "@/lib/inventory-suggestions";
import { updateInventoryItemAction, createInventoryItemAction } from "@/app/host/inventory/actions";
import {
  InventoryCategory,
  InventoryCondition,
  InventoryPriority,
} from "@/lib/inventory-constants";
import ItemVariantGroupsSection from "./ItemVariantGroupsSection";

interface EditCatalogItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: {
    id: string; // Puede estar vacío si es una sugerencia
    name: string;
    defaultVariantKey: string | null;
    defaultVariantLabel?: string | null;
    defaultVariantOptions?: any;
  };
  category?: InventoryCategory; // Necesario para crear items desde sugerencias
}

export default function EditCatalogItemModal({
  isOpen,
  onClose,
  onSave,
  item,
  category,
}: EditCatalogItemModalProps) {
  const [itemName, setItemName] = useState(item.name);
  const [hasVariant, setHasVariant] = useState(!!item.defaultVariantKey);
  const [variantMode, setVariantMode] = useState<"existing" | "custom">(
    item.defaultVariantKey && item.defaultVariantKey !== "bed_size" ? "custom" : "existing"
  );
  const [selectedVariantKey, setSelectedVariantKey] = useState<string>(item.defaultVariantKey || "");
  const [customVariantLabel, setCustomVariantLabel] = useState<string>("");
  const [customVariantOptions, setCustomVariantOptions] = useState<VariantOption[]>([]);
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [newOptionValue, setNewOptionValue] = useState<string>("");
  const [newOptionLabel, setNewOptionLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Variantes disponibles (por ahora solo bed_size, pero se puede extender)
  const availableVariants = [
    {
      key: "bed_size",
      label: "Tamaño de cama",
      options: BED_SIZE_VARIANT.variantOptions,
    },
  ];

  // Resetear formulario cuando se abre o cambia el item
  useEffect(() => {
    if (isOpen) {
      setItemName(item.name);
      const hasVariantValue = !!item.defaultVariantKey;
      setHasVariant(hasVariantValue);
      
      // Determinar si es variante existente o personalizada
      const isCustom = hasVariantValue && item.defaultVariantKey !== "bed_size";
      setVariantMode(isCustom ? "custom" : "existing");
      setSelectedVariantKey(item.defaultVariantKey || "");
      
      // Cargar datos de variante personalizada si existen
      if (isCustom && item.defaultVariantLabel) {
        setCustomVariantLabel(item.defaultVariantLabel);
        if (item.defaultVariantOptions && Array.isArray(item.defaultVariantOptions)) {
          setCustomVariantOptions(item.defaultVariantOptions);
        } else {
          setCustomVariantOptions([]);
        }
      } else {
        setCustomVariantLabel("");
        setCustomVariantOptions([]);
      }
      
      setError(null);
      // Focus en el input de nombre
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, item]);

  // Prevenir scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Cerrar modal con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleClose = () => {
    setItemName(item.name);
    setHasVariant(!!item.defaultVariantKey);
    setSelectedVariantKey(item.defaultVariantKey || "");
    setCustomVariantLabel("");
    setCustomVariantOptions([]);
    setEditingOptionIndex(null);
    setNewOptionValue("");
    setNewOptionLabel("");
    setError(null);
    onClose();
  };

  const handleAddOption = () => {
    if (!newOptionValue.trim() || !newOptionLabel.trim()) {
      setError("El valor y la etiqueta de la opción son obligatorios");
      return;
    }

    // Validar que el value no esté duplicado
    if (customVariantOptions.some(opt => opt.value.toLowerCase() === newOptionValue.trim().toLowerCase())) {
      setError("Ya existe una opción con ese valor");
      return;
    }

    setCustomVariantOptions([...customVariantOptions, {
      value: newOptionValue.trim().toLowerCase(),
      label: newOptionLabel.trim(),
    }]);
    setNewOptionValue("");
    setNewOptionLabel("");
    setError(null);
  };

  const handleEditOption = (index: number) => {
    const option = customVariantOptions[index];
    setEditingOptionIndex(index);
    setNewOptionValue(option.value);
    setNewOptionLabel(option.label);
  };

  const handleUpdateOption = () => {
    if (editingOptionIndex === null) return;
    if (!newOptionValue.trim() || !newOptionLabel.trim()) {
      setError("El valor y la etiqueta de la opción son obligatorios");
      return;
    }

    // Validar que el value no esté duplicado (excepto el actual)
    const duplicateIndex = customVariantOptions.findIndex(
      (opt, idx) => idx !== editingOptionIndex && opt.value.toLowerCase() === newOptionValue.trim().toLowerCase()
    );
    if (duplicateIndex !== -1) {
      setError("Ya existe una opción con ese valor");
      return;
    }

    const updated = [...customVariantOptions];
    updated[editingOptionIndex] = {
      value: newOptionValue.trim().toLowerCase(),
      label: newOptionLabel.trim(),
    };
    setCustomVariantOptions(updated);
    setEditingOptionIndex(null);
    setNewOptionValue("");
    setNewOptionLabel("");
    setError(null);
  };

  const handleDeleteOption = (index: number) => {
    setCustomVariantOptions(customVariantOptions.filter((_, i) => i !== index));
  };

  const handleCancelEditOption = () => {
    setEditingOptionIndex(null);
    setNewOptionValue("");
    setNewOptionLabel("");
  };

  const handleSave = async () => {
    // Validaciones
    if (!itemName.trim()) {
      setError("El nombre del ítem es obligatorio");
      return;
    }

    if (itemName.trim().length > 120) {
      setError("El nombre del ítem no puede tener más de 120 caracteres");
      return;
    }

    if (hasVariant) {
      if (variantMode === "existing" && !selectedVariantKey) {
        setError("Debes seleccionar un tipo de variante");
        return;
      }
      if (variantMode === "custom") {
        if (!customVariantLabel.trim()) {
          setError("El nombre de la variante es obligatorio");
          return;
        }
        if (customVariantOptions.length === 0) {
          setError("Debes agregar al menos una opción para la variante");
          return;
        }
      }
    }

    setIsPending(true);
    setError(null);

    try {
      // Si es una sugerencia (sin ID), crear un nuevo item en el catálogo
      if (!item.id || item.id.trim() === "") {
        if (!category) {
          setError("No se puede crear el item sin categoría");
          setIsPending(false);
          return;
        }
        
        const formData = new FormData();
        formData.set("category", category);
        formData.set("itemName", itemName.trim());
        
        if (hasVariant) {
          if (variantMode === "existing") {
            formData.set("variantKey", selectedVariantKey);
            formData.set("variantLabel", "");
            formData.set("variantOptions", "");
          } else {
            // Generar un variantKey único basado en el nombre del item y label
            const customKey = `${itemName.trim().toLowerCase().replace(/\s+/g, "_")}_${customVariantLabel.trim().toLowerCase().replace(/\s+/g, "_")}`;
            formData.set("variantKey", customKey);
            formData.set("variantLabel", customVariantLabel.trim());
            formData.set("variantOptions", JSON.stringify(customVariantOptions));
            console.log("[EditCatalogItemModal] Creando item con variantes personalizadas:", {
              variantKey: customKey,
              variantLabel: customVariantLabel.trim(),
              variantOptions: customVariantOptions,
            });
          }
        } else {
          formData.set("variantKey", "");
          formData.set("variantLabel", "");
          formData.set("variantOptions", "");
        }
        
        console.log("[EditCatalogItemModal] FormData antes de crear:", {
          category: formData.get("category"),
          itemName: formData.get("itemName"),
          variantKey: formData.get("variantKey"),
          variantLabel: formData.get("variantLabel"),
          variantOptions: formData.get("variantOptions"),
        });
        
        await createInventoryItemAction(formData);
        onSave();
        handleClose();
        return;
      }

      // Si tiene ID, actualizar el item existente
      const formData = new FormData();
      formData.set("itemId", item.id);
      formData.set("itemName", itemName.trim());
      
      if (hasVariant) {
        if (variantMode === "existing") {
          formData.set("variantKey", selectedVariantKey);
          formData.set("variantLabel", "");
          formData.set("variantOptions", "");
        } else {
          // Generar un variantKey único basado en el nombre del item y label
          const customKey = `${itemName.trim().toLowerCase().replace(/\s+/g, "_")}_${customVariantLabel.trim().toLowerCase().replace(/\s+/g, "_")}`;
          formData.set("variantKey", customKey);
          formData.set("variantLabel", customVariantLabel.trim());
          formData.set("variantOptions", JSON.stringify(customVariantOptions));
        }
      } else {
        formData.set("variantKey", "");
        formData.set("variantLabel", "");
        formData.set("variantOptions", "");
      }

      await updateInventoryItemAction(formData);
      onSave();
      handleClose();
    } catch (error: any) {
      console.error("Error al actualizar/crear item:", error);
      setError(error?.message || "Ocurrió un error al procesar el item. Por favor, intenta de nuevo.");
    } finally {
      setIsPending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-xs rounded-2xl border border-neutral-200 bg-white shadow-xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Editar ítem del catálogo
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Contenido */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Mensaje de error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Nombre del ítem */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Nombre del ítem *
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={itemName}
              onChange={(e) => {
                setItemName(e.target.value);
                setError(null);
              }}
              placeholder="Ej: Sofá cama, Mesa plegable..."
              required
              maxLength={120}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </div>

          {/* Checkbox para variantes */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasVariant}
                onChange={(e) => {
                  setHasVariant(e.target.checked);
                  if (!e.target.checked) {
                    setSelectedVariantKey("");
                  }
                  setError(null);
                }}
                className="w-4 h-4 text-neutral-900 border-neutral-300 rounded focus:ring-2 focus:ring-neutral-300"
              />
              <span className="text-sm font-medium text-neutral-700">
                Este ítem tiene variantes
              </span>
            </label>
          </div>

          {/* Selector de tipo de variante */}
          {hasVariant && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Tipo de variante *
              </label>
              <select
                value={selectedVariantKey}
                onChange={(e) => {
                  setSelectedVariantKey(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 bg-white"
              >
                <option value="">Selecciona un tipo...</option>
                {availableVariants.map((variant) => (
                  <option key={variant.key} value={variant.key}>
                    {variant.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Grupos de variantes Tenant (solo cuando se edita un ítem existente) */}
          {item.id && item.id.trim() && (
            <div className="pt-4 border-t border-neutral-200">
              <ItemVariantGroupsSection
                itemId={item.id}
                onUpdate={onSave}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-base font-medium text-neutral-700 hover:bg-neutral-50 transition active:scale-[0.99] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-base font-medium hover:bg-neutral-800 transition active:scale-[0.99] disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

