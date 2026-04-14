"use client";

import { useState, useEffect, useRef, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  createInventoryLineAction,
  updateInventoryLineAction,
  getCatalogByCategory,
  getPropertyZones,
  getInventoryLineForEditAction,
  getInventoryLineSiblingsAction,
  getInventoryItemVariantGroupAction,
  getInventoryItemVariantGroupsAction,
  updateInventoryItemVariantGroupAction,
  addInventoryItemVariantGroupAction,
  createInventoryItemAction,
  deleteInventoryItemAction,
  checkDuplicateInventoryLineAction,
  createPropertyZoneAction,
} from "@/app/host/inventory/actions";
import {
  OPERATIONAL_CATEGORY_OPTIONS,
} from "@/lib/inventory-zone-labels";
import { inferZoneCategory } from "@/lib/zones/inferZoneCategory";
import {
  InventoryCategory,
  InventoryCondition,
  InventoryPriority,
  PropertyZoneOperationalCategory,
} from "@/lib/inventory-constants";
import {
  INVENTORY_SUGGESTIONS,
  getCategoryLabel,
  getVariantLabel,
  BED_SIZE_VARIANT,
  getAllowedCategoriesForArea,
  isBedSizeVariantable,
  type InventorySuggestion,
} from "@/lib/inventory-suggestions";
import { normalizeName, normalizeVariantValue } from "@/lib/inventory-normalize";
import CreateCustomItemModal from "./CreateCustomItemModal";
import EditCatalogItemModal from "./EditCatalogItemModal";
import InventoryItemImageSlots from "./InventoryItemImageSlots";
import InventoryLineImageSlots from "./InventoryLineImageSlots";
import { getInventoryItemThumbsAction } from "@/app/host/inventory/actions";
import { getInventoryLineImageThumbsAction } from "@/app/host/inventory/line-image-actions";
import AddItemPhotosModal from "./AddItemPhotosModal";
import DuplicateItemWarningModal from "./DuplicateItemWarningModal";
import CreateVariantGroupModal from "./CreateVariantGroupModal";
import EditVariantGroupModal from "./EditVariantGroupModal";
import AddVariantGroupPickerModal from "./AddVariantGroupPickerModal";
import { CANONICAL_VARIANT_GROUPS } from "@/lib/inventory-canonical-variants";

type EditData = Awaited<ReturnType<typeof getInventoryLineForEditAction>>;

interface AddInventoryItemModalProps {
  propertyId: string;
  lineId?: string; // Si se proporciona, el modal está en modo edición
  initialEditData?: EditData | null; // Datos ya cargados (variantes incluidas) — evita "Cargando variantes..."
  onClose?: () => void; // Callback opcional para cuando se cierra
  onCacheInvalidate?: () => void; // Tras mutaciones (variantes, update) para invalidar cache
}

type WizardStep = "AREA" | "CATEGORY" | "ITEM" | "DETAILS";

// Helper function para verificar si la categoría es válida
function isValidCategory(category: InventoryCategory | ""): category is InventoryCategory {
  return category !== "";
}

export default function AddInventoryItemModal({
  propertyId,
  lineId,
  initialEditData,
  onClose,
  onCacheInvalidate,
}: AddInventoryItemModalProps) {
  const isEditMode = !!lineId;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAllCatalogItems, setShowAllCatalogItems] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const variantSelectRef = useRef<HTMLSelectElement>(null);
  const areaInputRef = useRef<HTMLInputElement>(null);

  // Estado del wizard
  const [step, setStep] = useState<WizardStep>("AREA");
  const [keepAddingInSameArea, setKeepAddingInSameArea] = useState(true);

  // Estado del formulario — Phase 7: zone replaces area
  const [propertyZoneId, setPropertyZoneId] = useState("");
  const [zoneName, setZoneName] = useState(""); // display name derivado de la zona
  const [category, setCategory] = useState<InventoryCategory | "">("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [customItemName, setCustomItemName] = useState("");
  const [expectedQty, setExpectedQty] = useState(1);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Estado de Condition y Priority
  const [condition, setCondition] = useState<InventoryCondition>("USED_LT_1Y" as InventoryCondition);
  const [priority, setPriority] = useState<InventoryPriority>("MEDIUM" as InventoryPriority);
  
  // Estado de variantes
  const [variantKey, setVariantKey] = useState<string | null>(null);
  const [variantValue, setVariantValue] = useState<string>("");
  const [selectedSuggestion, setSelectedSuggestion] = useState<InventorySuggestion | null>(null);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<{
    id: string;
    name: string;
    defaultVariantKey: string | null;
    defaultVariantLabel?: string | null;
    defaultVariantOptions?: any;
  } | null>(null);
  
  // Estado del modal de crear item personalizado
  const [isCreateCustomItemModalOpen, setIsCreateCustomItemModalOpen] = useState(false);
  
  // Estado del modal de editar item del catálogo
  const [isEditCatalogItemModalOpen, setIsEditCatalogItemModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<{ 
    id: string; 
    name: string; 
    defaultVariantKey: string | null;
    defaultVariantLabel?: string | null;
    defaultVariantOptions?: any;
  } | null>(null);
  
  // Estado para modo edición de chips del catálogo
  const [isCatalogEditMode, setIsCatalogEditMode] = useState(false);

  // Estado para thumbs de imágenes del item
  const [itemThumbs, setItemThumbs] = useState<Array<string | null>>([null, null, null]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);

  // Estado para el nombre del item en modo edición (para mostrar en el título)
  const [editingItemName, setEditingItemName] = useState<string | null>(null);

  // Estado para el flujo de agregar fotos después de crear
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);
  const [createdItemName, setCreatedItemName] = useState<string | null>(null);
  const [showAddPhotosModal, setShowAddPhotosModal] = useState(false);
  const [showDuplicateWarningModal, setShowDuplicateWarningModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    itemName: string;
    area: string;
    variantText?: string;
    quantity?: number;
  } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  // Variantes (solo modo edición) — grupo en InventoryItem + líneas activas en área
  const [siblings, setSiblings] = useState<
    Array<{
      id: string;
      expectedQty: number;
      variantKey: string | null;
      variantValue: string | null;
      variantValueNormalized: string | null;
      isActive: boolean;
    }>
  >([]);
  const [variantGroup, setVariantGroup] = useState<{
    key: string;
    label: string | null;
    options: Array<{ value: string; valueNormalized: string }>;
  } | null>(null);
  const [variantGroups, setVariantGroups] = useState<
    Array<{ key: string; label: string | null; options: Array<{ value: string; valueNormalized: string }> }>
  >([]);
  const [hasVariantsToggle, setHasVariantsToggle] = useState(false);
  const [variantEnabled, setVariantEnabled] = useState(false); // V1.5: toggle para modo creación
  const [showCreateVariantGroupModal, setShowCreateVariantGroupModal] = useState(false);
  const [showAddVariantGroupPickerModal, setShowAddVariantGroupPickerModal] = useState(false);
  const [showEditVariantGroupModal, setShowEditVariantGroupModal] = useState(false);
  const [isLoadingForEdit, setIsLoadingForEdit] = useState(false);
  const [pendingVariantNormalized, setPendingVariantNormalized] = useState<string | null>(null);

  // editStage: state machine para sección variantes en modo edición
  type VariantEditStage = "loading" | "no_group" | "has_group" | null;
  const editStage: VariantEditStage = useMemo(() => {
    if (isLoadingForEdit) return "loading";
    if (!hasVariantsToggle) return null;
    if (variantGroup && variantGroup.options.length >= 2) return "has_group";
    return "no_group";
  }, [isLoadingForEdit, hasVariantsToggle, variantGroup]);

  // Phase 7: zonas OPERATIONAL de la propiedad
  const [propertyZones, setPropertyZones] = useState<{ id: string; name: string; sortOrder: number | null; operationalCategory: PropertyZoneOperationalCategory | null }[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);

  // Phase 12: inline zone creation sub-form
  const [showNewZoneForm, setShowNewZoneForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneCategory, setNewZoneCategory] = useState<PropertyZoneOperationalCategory | "">("");
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const [isCreatingZone, setIsCreatingZone] = useState(false);
  const [newZoneError, setNewZoneError] = useState<string | null>(null);

  // Catálogo existente por categoría (cacheado por categoría)
  const [catalogCache, setCatalogCache] = useState<
    Record<InventoryCategory, Array<{ 
      id: string; 
      name: string; 
      defaultVariantKey: string | null;
      defaultVariantLabel?: string | null;
      defaultVariantOptions?: any;
    }>>
  >({} as Record<InventoryCategory, Array<{ 
    id: string; 
    name: string; 
    defaultVariantKey: string | null;
    defaultVariantLabel?: string | null;
    defaultVariantOptions?: any;
  }>>);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Phase 7: Cargar zonas OPERATIONAL cuando se abre el modal
  useEffect(() => {
    if (isOpen && propertyZones.length === 0) {
      setLoadingAreas(true);
      getPropertyZones(propertyId)
        .then((zones) => {
          setPropertyZones(zones);
        })
        .catch((error) => {
          console.error("Error loading zones:", error);
        })
        .finally(() => {
          setLoadingAreas(false);
        });
    }
  }, [isOpen, propertyId, propertyZones.length]);

  // Cargar catálogo cuando cambia la categoría (on-demand)
  useEffect(() => {
    if (isValidCategory(category) && !catalogCache[category]) {
      setLoadingCatalog(true);
      getCatalogByCategory(category)
        .then((items) => {
          // Ordenar alfabéticamente respetando casing exacto
          const sorted = items.sort((a, b) =>
            a.name.localeCompare(b.name, "es", { sensitivity: "base" })
          );
          setCatalogCache((prev) => ({
            ...prev,
            [category]: sorted,
          }));
        })
        .catch((error) => {
          console.error("Error loading catalog:", error);
        })
        .finally(() => {
          setLoadingCatalog(false);
        });
    }
  }, [category, catalogCache]);

  // Phase 7: Cargar catálogo de categorías permitidas para la zona cuando hay zona seleccionada
  useEffect(() => {
    if (zoneName && zoneName.trim().length > 0) {
      const allowedCategories = getAllowedCategoriesForArea(zoneName);
      if (allowedCategories && allowedCategories.length > 0) {
        // Cargar catálogo de todas las categorías permitidas que aún no estén en cache
        const categoriesToLoad = allowedCategories.filter(
          (cat) => isValidCategory(cat) && !catalogCache[cat]
        );

        if (categoriesToLoad.length > 0) {
          setLoadingCatalog(true);
          Promise.all(
            categoriesToLoad.map((cat) =>
              getCatalogByCategory(cat)
                .then((items) => {
                  // Ordenar alfabéticamente respetando casing exacto
                  const sorted = items.sort((a, b) =>
                    a.name.localeCompare(b.name, "es", { sensitivity: "base" })
                  );
                  setCatalogCache((prev) => ({
                    ...prev,
                    [cat]: sorted,
                  }));
                })
                .catch((error) => {
                  console.error(`Error loading catalog for category ${cat}:`, error);
                })
            )
          )
            .finally(() => {
              setLoadingCatalog(false);
            });
        }
      }
    }
  }, [zoneName, catalogCache]);

  // Obtener items del catálogo: 
  // - Si showAllCatalogItems está OFF: mostrar solo categoría seleccionada (comportamiento original)
  // - Si showAllCatalogItems está ON: mostrar items de todas las categorías permitidas para el área (si hay área) o todo el catálogo
  const catalogItems = (() => {
    // Si el toggle está OFF, mostrar solo la categoría seleccionada (comportamiento original)
    if (!showAllCatalogItems) {
      return isValidCategory(category) ? catalogCache[category] || [] : [];
    }

    // Si el toggle está ON, mostrar items filtrados por zona (si hay zona)
    if (zoneName && zoneName.trim().length > 0) {
      const allowedCategories = getAllowedCategoriesForArea(zoneName);
      if (allowedCategories && allowedCategories.length > 0) {
        // Combinar items de todas las categorías permitidas para el área
        const allItems: Array<{
          id: string;
          name: string;
          defaultVariantKey: string | null;
          defaultVariantLabel?: string | null;
          defaultVariantOptions?: any;
        }> = [];

        allowedCategories.forEach((cat) => {
          if (isValidCategory(cat) && catalogCache[cat]) {
            allItems.push(...catalogCache[cat]);
          }
        });

        // Eliminar duplicados por ID (por si acaso)
        const uniqueItems = Array.from(
          new Map(allItems.map((item) => [item.id, item])).values()
        );

        return uniqueItems;
      }
    }

    // Si no hay área o no hay categorías permitidas, mostrar solo categoría seleccionada
    return isValidCategory(category) ? catalogCache[category] || [] : [];
  })();

  // Phase 7: zona display — propertyZones ya viene ordenado por sortOrder desde el servidor

  const handleOpen = () => {
    setIsOpen(true);
    if (isEditMode && lineId) {
      // Cargar datos del item para edición
      loadItemForEdit(lineId);
    } else {
      setStep("AREA");
      resetForm();
    }
  };

  const applyEditData = (data: NonNullable<EditData>) => {
    const line = data.line;
    const { siblings: loadedSiblings, variantGroup: loadedGroup, variantGroups: loadedGroups } = data;
    setEditingItemName(line.item.name);
    // Phase 7: set zone from line
    const lineTypedZone = line as { propertyZoneId?: string | null; propertyZone?: { name: string } | null };
    setPropertyZoneId(lineTypedZone.propertyZoneId ?? "");
    setZoneName(lineTypedZone.propertyZone?.name ?? line.area);
    setCategory(line.item.category);
    setSelectedItemId(line.item.id);
    setCustomItemName("");
    setExpectedQty(line.expectedQty);
    setBrand(line.brand || "");
    setModel(line.model || "");
    setSerialNumber(line.serialNumber || "");
    setColor(line.color || "");
    setSize(line.size || "");
    setNotes(line.notes || "");
    setCondition(line.condition || ("USED_LT_1Y" as InventoryCondition));
    setPriority(line.priority || ("MEDIUM" as InventoryPriority));

    setLoadingThumbs(true);
    // Fase 11: en modo edición cargar imágenes de la línea (con fallback al item)
    getInventoryLineImageThumbsAction(line.id)
      .then((thumbs) => setItemThumbs(thumbs))
      .catch(() => setItemThumbs([null, null, null]))
      .finally(() => setLoadingThumbs(false));

    let finalVariantKey = line.variantKey || null;
    let finalVariantValue = line.variantValue || "";
    if (!finalVariantKey && !finalVariantValue && line.size) {
      const sizeNormalized = line.size.trim().toLowerCase();
      const matchingOption = BED_SIZE_VARIANT.variantOptions.find(
        (opt) =>
          opt.label.toLowerCase() === sizeNormalized || opt.value === sizeNormalized
      );
      if (matchingOption && isBedSizeVariantable(line.item.name, line.item.defaultVariantKey)) {
        finalVariantKey = "bed_size";
        finalVariantValue = matchingOption.value;
        setSize("");
      }
    }
    if (finalVariantKey === "bed_size" && finalVariantValue) {
      const variantValueLower = finalVariantValue.toLowerCase();
      const matchingOption = BED_SIZE_VARIANT.variantOptions.find(
        (opt) =>
          opt.value === variantValueLower ||
          opt.value === finalVariantValue ||
          opt.label.toLowerCase() === variantValueLower ||
          opt.label.toLowerCase() === finalVariantValue.toLowerCase()
      );
      finalVariantValue = matchingOption?.value ?? variantValueLower;
    }
    setVariantKey(finalVariantKey);
    setVariantValue(finalVariantValue);
    setSelectedSuggestion(null);

    setSiblings(loadedSiblings);
    setVariantGroups(loadedGroups ?? []);
    setVariantGroup(
      loadedGroup?.key && loadedGroup?.options
        ? { key: loadedGroup.key, label: loadedGroup.label ?? null, options: loadedGroup.options }
        : null
    );
    if (
      loadedGroup?.key &&
      line.variantKey === loadedGroup.key &&
      line.variantValue
    ) {
      const lineTyped = line as { variantValueNormalized?: string };
      setPendingVariantNormalized(
        lineTyped.variantValueNormalized ?? normalizeVariantValue(line.variantValue)
      );
    } else {
      setPendingVariantNormalized(null);
    }
    setHasVariantsToggle(
      !!(
        (loadedGroup?.key && loadedGroup?.options) ||
        loadedSiblings.some((s) => s.variantKey != null && s.variantValue != null)
      )
    );

    const itemCategory = line.item.category;
    if (itemCategory) {
      setCatalogCache((prev) => {
        const existingItems = prev[itemCategory] || [];
        if (existingItems.find((item) => item.id === line.item.id)) return prev;
        return {
          ...prev,
          [itemCategory]: [
            ...existingItems,
            {
              id: line.item.id,
              name: line.item.name,
              defaultVariantKey: line.item.defaultVariantKey,
            },
          ].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
        };
      });
    }

    setStep("DETAILS");
  };

  const loadItemForEdit = async (id: string) => {
    setIsLoadingForEdit(true);
    try {
      const data = await getInventoryLineForEditAction(id, propertyId);
      if (!data?.line) return;
      applyEditData(data);
    } catch (error) {
      console.error("Error loading item for edit:", error);
      setError("No se pudo cargar el item para editar");
    } finally {
      setIsLoadingForEdit(false);
    }
  };

  const resetForm = () => {
    setPropertyZoneId("");
    setZoneName("");
    setCategory("");
    setSelectedItemId("");
    setCustomItemName("");
    setExpectedQty(1);
    setShowAdvanced(false);
    setBrand("");
    setModel("");
    setSerialNumber("");
    setColor("");
    setSize("");
    setNotes("");
    setSearchTerm("");
    setError(null);
    setVariantKey(null);
    setVariantValue("");
    setSelectedSuggestion(null);
    setSelectedCatalogItem(null);
    setIsCatalogEditMode(false); // Salir del modo edición al resetear
    setShowAllCatalogItems(false); // Resetear toggle de mostrar todo
    setItemThumbs([null, null, null]); // Resetear thumbs
    setLoadingThumbs(false);
    setEditingItemName(null); // Resetear nombre del item en edición
    setCreatedItemId(null); // Resetear itemId creado
    setCreatedItemName(null); // Resetear nombre del item creado
    setShowAddPhotosModal(false); // Cerrar modal de agregar fotos
    setCondition("USED_LT_1Y" as InventoryCondition);
    setPriority("MEDIUM" as InventoryPriority);
        setSiblings([]);
    setVariantGroup(null);
    setVariantGroups([]);
    setHasVariantsToggle(false);
    setVariantEnabled(false);
    setShowCreateVariantGroupModal(false);
    setShowEditVariantGroupModal(false);
    setPendingVariantNormalized(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetForm();
    setStep("AREA");
    setKeepAddingInSameArea(true);
    onClose?.();
  };

  // Navegación del wizard
  const goToStep = (newStep: WizardStep) => {
    setError(null);
    setStep(newStep);
  };

  const handleNext = () => {
    // Validaciones por paso
    if (step === "AREA") {
      if (!propertyZoneId) {
        setError("Selecciona un área");
        return;
      }
      goToStep("CATEGORY");
    } else if (step === "CATEGORY") {
      if (!isValidCategory(category)) {
        setError("Selecciona una categoría");
        return;
      }
      goToStep("ITEM");
    } else if (step === "ITEM") {
      if (!selectedItemId && !customItemName.trim()) {
        setError("Selecciona un ítem o ingresa un nombre");
        return;
      }
      goToStep("DETAILS");
    }
  };

  const handleBack = () => {
    // En modo edición solo existe DETAILS; no hay pasos previos con contenido
    if (isEditMode) return;
    if (step === "CATEGORY") {
      goToStep("AREA");
    } else if (step === "ITEM") {
      goToStep("CATEGORY");
    } else if (step === "DETAILS") {
      goToStep("ITEM");
    }
  };

  // Inferencia automática de categoría al escribir el nombre del área
  useEffect(() => {
    if (!newZoneName.trim()) {
      setNewZoneCategory("");
      setCategoryManuallySet(false);
      return;
    }
    if (!categoryManuallySet) {
      setNewZoneCategory(inferZoneCategory(newZoneName) ?? "");
    }
  }, [newZoneName, categoryManuallySet]);

  // Phase 12: crear zona inline desde el AREA step
  const handleCreateZone = async () => {
    const trimmed = newZoneName.trim();
    if (!trimmed) { setNewZoneError("El nombre es obligatorio"); return; }
    setNewZoneError(null);
    setIsCreatingZone(true);
    try {
      const zone = await createPropertyZoneAction(propertyId, trimmed, newZoneCategory || null);
      setPropertyZones((prev) => [...prev, zone]);
      setPropertyZoneId(zone.id);
      setZoneName(zone.name);
      setShowNewZoneForm(false);
      setNewZoneName("");
      setNewZoneCategory("");
      setCategoryManuallySet(false);
      setTimeout(() => goToStep("CATEGORY"), 100);
    } catch (err) {
      setNewZoneError(err instanceof Error ? err.message : "Error al crear el área");
    } finally {
      setIsCreatingZone(false);
    }
  };

  const handleCategoryClick = (cat: InventoryCategory) => {
    setCategory(cat);
    setSelectedItemId("");
    setCustomItemName("");
    setVariantKey(null);
    setVariantValue("");
    setSelectedSuggestion(null);
    setSelectedCatalogItem(null);
    setIsCatalogEditMode(false); // Salir del modo edición al cambiar de categoría
    setItemThumbs([null, null, null]); // Resetear thumbs al cambiar categoría
    goToStep("ITEM");
  };

  const handleSuggestionClick = (suggestion: InventorySuggestion) => {
    setSelectedItemId("");
    setCustomItemName(suggestion.name);
    setSelectedSuggestion(suggestion);
    setSearchTerm(""); // Limpiar búsqueda al avanzar
    setItemThumbs([null, null, null]); // Resetear thumbs al seleccionar sugerencia
    
    // Configurar variante si la sugerencia la requiere
    if (suggestion.variantKey && suggestion.variantOptions) {
      setVariantEnabled(true);
      setVariantKey(suggestion.variantKey);
      setVariantValue("");
    } else {
      setVariantEnabled(false);
      setVariantKey(null);
      setVariantValue("");
    }
    
    // Avanzar a detalles automáticamente
    goToStep("DETAILS");
  };

  const handleCatalogItemClick = (item: { 
    id: string; 
    name: string; 
    defaultVariantKey: string | null;
    defaultVariantLabel?: string | null;
    defaultVariantOptions?: any;
  }) => {
    console.log("Item del catálogo seleccionado:", item);
    setSelectedItemId(item.id);
    setCustomItemName("");
    setSelectedSuggestion(null);
    setSelectedCatalogItem(item); // Guardar el item completo para acceder a sus variantes

    // Cargar thumbs del item seleccionado
    setLoadingThumbs(true);
    getInventoryItemThumbsAction(item.id)
      .then((thumbs) => {
        setItemThumbs(thumbs);
      })
      .catch((error) => {
        console.error("Error loading item thumbs:", error);
        setItemThumbs([null, null, null]);
      })
      .finally(() => {
        setLoadingThumbs(false);
      });
    setSearchTerm(""); // Limpiar búsqueda al avanzar
    
    // Si el item del catálogo tiene defaultVariantKey, configurar variante
    if (item.defaultVariantKey) {
      console.log("Item tiene variante:", item.defaultVariantKey, "Opciones:", item.defaultVariantOptions);
      setVariantEnabled(true);
      setVariantKey(item.defaultVariantKey);
      setVariantValue("");
    } else {
      setVariantEnabled(false);
      setVariantKey(null);
      setVariantValue("");
    }
    
    // Avanzar a detalles automáticamente
    goToStep("DETAILS");
  };


  const handleCatalogItemEditSave = () => {
    // Recargar el catálogo para reflejar los cambios
    if (isValidCategory(category)) {
      setCatalogCache((prev) => ({
        ...prev,
        [category]: [], // Limpiar cache para forzar recarga
      }));
      getCatalogByCategory(category)
        .then((items) => {
          setCatalogCache((prev) => ({
            ...prev,
            [category]: items,
          }));
        })
        .catch((error) => {
          console.error("Error reloading catalog:", error);
        });
    }
  };

  const handleCustomItem = () => {
    // Abrir modal para crear item personalizado
    setIsCreateCustomItemModalOpen(true);
  };

  const handleCustomItemSave = async (data: { name: string; variantKey: string | null; variantLabel: string | null }) => {
    if (!isValidCategory(category)) {
      setError("Debes seleccionar una categoría primero");
      return;
    }

    try {
      // Crear el item en el catálogo inmediatamente
      const formData = new FormData();
      formData.set("category", category);
      formData.set("itemName", data.name);
      if (data.variantKey) {
        formData.set("variantKey", data.variantKey);
      }

      const createdItem = await createInventoryItemAction(formData);

      // Actualizar estado con el item creado
      setSelectedItemId(createdItem.id);
      setCustomItemName(""); // Limpiar customItemName para usar itemId
      setSelectedSuggestion(null);
      
      // Recargar el catálogo completo para asegurar que incluya todos los campos (incluyendo variantes personalizadas)
      handleCatalogItemEditSave();
      
      // Configurar variante si se seleccionó
      if (data.variantKey) {
        setVariantEnabled(true);
        setVariantKey(data.variantKey);
        setVariantValue(""); // El usuario seleccionará el valor en el paso DETAILS
        
        // Crear una sugerencia temporal para manejar las opciones de variante
        if (data.variantKey === "bed_size") {
          setSelectedSuggestion({
            name: data.name,
            variantKey: data.variantKey,
            variantLabel: data.variantLabel || "Tamaño de cama",
            variantOptions: BED_SIZE_VARIANT.variantOptions,
          });
        }
      } else {
        setVariantKey(null);
        setVariantValue("");
      }
      
      // Limpiar búsqueda al avanzar
      setSearchTerm("");
      
      // Avanzar a detalles automáticamente
      goToStep("DETAILS");
    } catch (error: any) {
      console.error("Error al crear item personalizado:", error);
      setError(error?.message || "Ocurrió un error al crear el item. Por favor, intenta de nuevo.");
    }
  };

  // Determinar si se requiere variante (variantEnabled con grupo seleccionado en CREATE, o toggle ON con grupo en EDIT)
  const requiresVariant = variantKey !== null;
  const variantLabel = (() => {
    if (variantKey === "bed_size") return BED_SIZE_VARIANT.variantLabel;
    const canonicalGroup = CANONICAL_VARIANT_GROUPS.find((g) => g.key === variantKey);
    if (canonicalGroup) return canonicalGroup.label;
    return selectedCatalogItem?.defaultVariantLabel || selectedSuggestion?.variantLabel || "Variante";
  })();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Validación completa antes de enviar — Phase 7: zone required
    if (!propertyZoneId) {
      setError("El área es obligatoria");
      return;
    }

    if (!isValidCategory(category)) {
      setError("La categoría es obligatoria");
      return;
    }

    if (!selectedItemId && !customItemName.trim()) {
      setError("Debes seleccionar un ítem o ingresar un nombre");
      return;
    }

    if (customItemName && customItemName.trim().length > 120) {
      setError("El nombre del ítem no puede tener más de 120 caracteres");
      return;
    }

    if (expectedQty <= 0 || isNaN(expectedQty)) {
      setError("La cantidad debe ser mayor a 0");
      return;
    }

    // Validar variante si es requerida
    if (requiresVariant && !variantValue) {
      setError(`Selecciona ${variantLabel.toLowerCase()}`);
      return;
    }

    if (isEditMode && hasVariantsToggle && variantKey && !variantValue) {
      setError(
        "Selecciona una opción antes de guardar, o desactiva el toggle de variante."
      );
      return;
    }

    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    
    // Asegurar que itemId o itemName estén en el FormData
    if (selectedItemId) {
      formData.set("itemId", selectedItemId);
    } else if (customItemName.trim()) {
      formData.set("itemName", customItemName.trim());
    }
    
    // Agregar campos de variante al formData
    if (variantKey && variantValue) {
      formData.set("variantKey", variantKey);
      formData.set("variantValue", variantValue);
      if (selectedSuggestion?.variantKey && !selectedItemId) {
        formData.set("defaultVariantKey", selectedSuggestion.variantKey);
      }
    }
    // Modo edición: variante se persiste al Actualizar (patrón Colcha para todos los grupos)
    if (isEditMode && variantGroup?.key && pendingVariantNormalized) {
      const opt = variantGroup.options.find(
        (o) => o.valueNormalized === pendingVariantNormalized
      );
      formData.set("variantKey", variantGroup.key);
      formData.set("variantValue", opt?.value ?? pendingVariantNormalized);
    }
    // Si el usuario desmarcó "Este ítem tiene variantes", limpiar variante de la línea y del ítem
    if (isEditMode && !hasVariantsToggle && selectedItemId) {
      formData.set("clearVariant", "true");
      formData.set("variantKey", "");
      formData.set("variantValue", "");
    }

    startTransition(async () => {
      try {
        // Detectar si se va a crear un nuevo item (cuando se usa customItemName)
        const willCreateNewItem = !isEditMode && !selectedItemId && customItemName.trim() !== "";
        
        if (isEditMode && lineId) {
          // Modo edición
          formData.set("lineId", lineId);
          await updateInventoryLineAction(formData);
          onCacheInvalidate?.();
          handleClose();
          router.refresh();
        } else {
          // Modo creación - Verificar duplicados primero (tanto para items existentes como nuevos)
          console.log("[AddInventoryItemModal] Verificando duplicados antes de crear...");
          const duplicateCheck = await checkDuplicateInventoryLineAction(formData);
          console.log("[AddInventoryItemModal] Resultado de verificación de duplicados:", duplicateCheck);
          
          if (duplicateCheck && duplicateCheck.exists) {
            console.log("[AddInventoryItemModal] Duplicado detectado, mostrando modal de advertencia");
            // Guardar información del duplicado y el formData pendiente
            setDuplicateInfo({
              itemName: duplicateCheck.itemName || customItemName || selectedCatalogItem?.name || "este item",
              area: zoneName, // Phase 7: display zone name
              variantText: duplicateCheck.variantText,
              quantity: duplicateCheck.quantity,
            });
            setPendingFormData(formData);
            setShowDuplicateWarningModal(true);
            return; // Salir sin crear
          }
          
          console.log("[AddInventoryItemModal] No hay duplicado, creando item normalmente");
          // Si no hay duplicado o el usuario confirmó, crear normalmente
          const result = await createInventoryLineAction(formData);
          
          console.log("[AddInventoryItemModal] Resultado de createInventoryLineAction:", result);
          
          // Si se creó un nuevo item, recargar el catálogo
          if (willCreateNewItem && category) {
            handleCatalogItemEditSave();
          }
          
          // Guardar itemId y nombre para el modal de confirmación de fotos (siempre, independientemente de keepAddingInSameArea)
          console.log("[AddInventoryItemModal] Resultado completo:", result);
          console.log("[AddInventoryItemModal] Verificando result?.itemId:", result?.itemId);
          console.log("[AddInventoryItemModal] Tipo de result:", typeof result);
          
          // Verificar que result existe y tiene itemId
          if (result && typeof result === 'object' && 'itemId' in result && result.itemId) {
            console.log("[AddInventoryItemModal] Abriendo modal de confirmación de fotos con itemId:", result.itemId);
            setCreatedItemId(result.itemId);
            setCreatedItemName(result.itemName || null);
            
            if (keepAddingInSameArea) {
              // Modo batch: limpiar solo item y variante, mantener área y categoría
              setSelectedItemId("");
              setCustomItemName("");
              setVariantKey(null);
              setVariantValue("");
              setSelectedSuggestion(null);
              setSelectedCatalogItem(null);
              setExpectedQty(1);
              setShowAdvanced(false);
              setBrand("");
              setModel("");
              setSerialNumber("");
              setColor("");
              setSize("");
              setNotes("");
              setSearchTerm("");
              setError(null);
              goToStep("ITEM");
              // Mantener el modal principal abierto, solo mostrar el modal de confirmación de fotos encima
              // No refrescar todavía, esperar la respuesta del modal de fotos
            } else {
              setIsOpen(false); // Ocultar el modal principal solo si no está en modo batch
            }
            
            // Cerrar modal y refrescar
            router.refresh();
            if (!keepAddingInSameArea) {
              handleClose();
            }
          } else {
            console.log("[AddInventoryItemModal] No hay itemId válido, cerrando normalmente. Result:", result);
            
            if (keepAddingInSameArea) {
              // Modo batch: limpiar solo item y variante, mantener área y categoría
              setSelectedItemId("");
              setCustomItemName("");
              setVariantKey(null);
              setVariantValue("");
              setSelectedSuggestion(null);
              setSelectedCatalogItem(null);
              setExpectedQty(1);
              setShowAdvanced(false);
              setBrand("");
              setModel("");
              setSerialNumber("");
              setColor("");
              setSize("");
              setNotes("");
              setSearchTerm("");
              setError(null);
              goToStep("ITEM");
              router.refresh();
            } else {
              // Si no hay resultado, cerrar normalmente
              handleClose();
              router.refresh();
            }
          }
        }
      } catch (error: any) {
        console.error(`Error al ${isEditMode ? "actualizar" : "crear"} item de inventario:`, error);
        if (error?.message) {
          // Si el error indica que el item ya existe, mostrar modal de advertencia
          if (error.message.includes("ya existe en el área")) {
            console.log("[AddInventoryItemModal] Error de duplicado detectado, intentando obtener información del duplicado");
            // Extraer información del error para mostrar en el modal
            const areaMatch = error.message.match(/área "([^"]+)"/);
            const variantMatch = error.message.match(/ítem(.*?) ya existe/);
            
            // Intentar obtener información del duplicado
            try {
              const duplicateCheck = await checkDuplicateInventoryLineAction(formData);
              console.log("[AddInventoryItemModal] Resultado de verificación de duplicado en catch:", duplicateCheck);
              if (duplicateCheck && duplicateCheck.exists) {
                console.log("[AddInventoryItemModal] Mostrando modal de advertencia de duplicado");
                setDuplicateInfo({
                  itemName: duplicateCheck.itemName || customItemName || selectedCatalogItem?.name || "este item",
                  area: areaMatch ? areaMatch[1] : zoneName,
                  variantText: duplicateCheck.variantText,
                  quantity: duplicateCheck.quantity,
                });
                setPendingFormData(formData);
                setShowDuplicateWarningModal(true);
                setError(null); // Limpiar cualquier error previo
                return; // Salir sin mostrar error
              }
            } catch (checkError) {
              console.error("[AddInventoryItemModal] Error al verificar duplicado:", checkError);
            }
            
            // Si no se pudo obtener información del duplicado, mostrar error normal
            setError(error.message + " Busca el item en la lista y haz clic en el botón de editar para modificar su cantidad.");
          } else {
            setError(error.message);
          }
        } else {
          setError(`Ocurrió un error al ${isEditMode ? "actualizar" : "crear"} el item. Por favor, intenta de nuevo.`);
        }
      }
    });
  };

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

  const suggestions =
    isValidCategory(category)
      ? INVENTORY_SUGGESTIONS[category]
      : [];

  const isCustomItem = !selectedItemId && customItemName !== "";

  // Obtener el nombre del item seleccionado para mostrar en el resumen
  const getSelectedItemName = () => {
    // En modo edición, usar el nombre guardado directamente
    if (isEditMode && editingItemName) {
      return editingItemName;
    }
    if (selectedItemId) {
      const catalogItem = catalogItems.find((item) => item.id === selectedItemId);
      if (catalogItem) {
        return catalogItem.name;
      }
    }
    if (customItemName) {
      return customItemName;
    }
    if (selectedSuggestion) {
      return selectedSuggestion.name;
    }
    return "";
  };

  const selectedItemName = getSelectedItemName();

  // Filtrar sugerencias y catálogo por búsqueda
  const filteredSuggestions = searchTerm
    ? suggestions.filter((s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : suggestions;

  const filteredCatalogItems = searchTerm
    ? catalogItems.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : catalogItems;

  const canProceed = () => {
    if (step === "AREA") return !!propertyZoneId; // Phase 7: zone required
    if (step === "CATEGORY") return category !== "";
    if (step === "ITEM") return selectedItemId !== "" || customItemName.trim().length > 0;
    if (step === "DETAILS") {
      // V1.5: EDIT con toggle ON y grupo seleccionado requiere valor
      if (isEditMode && hasVariantsToggle && variantKey && !variantValue) {
        return false;
      }
      return (
        !!propertyZoneId && // Phase 7: zone required
        category !== "" &&
        (selectedItemId !== "" || customItemName.trim().length > 0) &&
        expectedQty > 0 &&
        (!requiresVariant || variantValue !== "")
      );
    }
    return false;
  };

  // Si está en modo edición, abrir automáticamente cuando se monta y cargar datos
  useEffect(() => {
    if (isEditMode && !isOpen && lineId) {
      setIsOpen(true);
      if (initialEditData?.line) {
        // Datos prefetch: aplicar de inmediato, sin "Cargando variantes..."
        applyEditData(initialEditData);
        setIsLoadingForEdit(false);
      } else {
        setStep("DETAILS");
        loadItemForEdit(lineId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, lineId, initialEditData]);

  const handleCreateVariantGroup = async (payload: {
    key: string;
    label?: string | null;
    options: Array<{ value: string }>;
  }) => {
    await addInventoryItemVariantGroupAction(selectedItemId, payload);
    const groups = await getInventoryItemVariantGroupsAction(selectedItemId);
    setVariantGroups(groups);
    const g = groups.find((x) => x.key === variantGroup?.key) ?? groups[0];
    setVariantGroup(
      g?.key && g?.options
        ? { key: g.key, label: g.label ?? null, options: g.options }
        : null
    );
    setShowCreateVariantGroupModal(false);
    onCacheInvalidate?.();
    router.refresh();
  };

  const handleEditVariantGroup = async (payload: {
    key: string;
    label?: string | null;
    options: Array<{ value: string }>;
  }) => {
    await updateInventoryItemVariantGroupAction(selectedItemId, payload);
    const groups = await getInventoryItemVariantGroupsAction(selectedItemId);
    setVariantGroups(groups);
    const g = groups.find((x) => x.key === variantGroup?.key) ?? groups[0];
    setVariantGroup(
      g?.key && g?.options
        ? { key: g.key, label: g.label ?? null, options: g.options }
        : null
    );
    setShowEditVariantGroupModal(false);
    onCacheInvalidate?.();
    router.refresh();
  };

  return (
    <>
      {showAddVariantGroupPickerModal &&
        isEditMode &&
        selectedItemId &&
        editingItemName && (
          <AddVariantGroupPickerModal
            itemId={selectedItemId}
            itemName={editingItemName}
            existingGroupKeys={variantGroups.map((g) => g.key)}
            onClose={() => setShowAddVariantGroupPickerModal(false)}
            onAttach={async () => {
              const groups = await getInventoryItemVariantGroupsAction(selectedItemId);
              setVariantGroups(groups);
              const g = groups[0];
              setVariantGroup(
                g?.key && g?.options
                  ? { key: g.key, label: g.label ?? null, options: g.options }
                  : null
              );
              onCacheInvalidate?.();
              router.refresh();
            }}
          />
        )}
      {showCreateVariantGroupModal && isEditMode && editingItemName && (
        <CreateVariantGroupModal
          itemName={editingItemName}
          isBedSizeVariantable={isBedSizeVariantable(editingItemName)}
          onClose={() => setShowCreateVariantGroupModal(false)}
          onSave={handleCreateVariantGroup}
        />
      )}
      {showEditVariantGroupModal &&
        isEditMode &&
        editingItemName &&
        variantGroup && (
          <EditVariantGroupModal
            itemName={editingItemName}
            variantGroup={variantGroup}
            onClose={() => setShowEditVariantGroupModal(false)}
            onSave={handleEditVariantGroup}
          />
        )}
      {/* Botón para abrir el modal (solo si no está en modo edición) */}
      {!isEditMode && (
        <button
          type="button"
          onClick={handleOpen}
          className="w-full sm:w-auto sm:min-w-[140px] rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
        >
          Agregar ítem
        </button>
      )}

      {/* Modal */}
      {isOpen && !showAddPhotosModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleClose();
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <form ref={formRef} onSubmit={handleSubmit}>
              <input type="hidden" name="propertyId" value={propertyId} />

              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-2">
                  <h2 className="text-lg font-semibold text-neutral-900">
                    {isEditMode ? "Editar ítem" : "Agregar ítem"}
                  </h2>
                  {isEditMode && selectedItemName && (
                    <p className="text-sm text-neutral-600 truncate mt-0.5">
                      {selectedItemName}
                    </p>
                  )}
                </div>
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
              <div className="p-4 space-y-4">
                {/* Mensaje de error */}
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {/* Paso 1: Área (solo en modo creación, no en edición) — Phase 7: zones */}
                {!isEditMode && step === "AREA" ? (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-3">
                      Área / Ubicación *
                    </label>
                    {loadingAreas && (
                      <p className="text-xs text-neutral-500 mb-2">Cargando áreas...</p>
                    )}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {propertyZones.map((zone) => (
                        <button
                          key={zone.id}
                          type="button"
                          onClick={() => {
                            setPropertyZoneId(zone.id);
                            setZoneName(zone.name);
                            setTimeout(() => {
                              goToStep("CATEGORY");
                            }, 100);
                          }}
                          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                            propertyZoneId === zone.id
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                          }`}
                        >
                          {zone.name}
                        </button>
                      ))}
                    </div>
                    {/* Phase 12: crear nueva zona inline */}
                    {!showNewZoneForm ? (
                      <button
                        type="button"
                        onClick={() => { setShowNewZoneForm(true); setNewZoneError(null); }}
                        className="w-full rounded-lg border-2 border-dashed border-neutral-300 py-2 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition"
                      >
                        + Nueva área
                      </button>
                    ) : (
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2 mt-2">
                        <p className="text-xs font-semibold text-neutral-800">Nueva área</p>
                        <input
                          type="text"
                          value={newZoneName}
                          onChange={(e) => setNewZoneName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCreateZone(); if (e.key === "Escape") setShowNewZoneForm(false); }}
                          placeholder="Ej. Baño principal"
                          autoFocus
                          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                        />
                        <div>
                          <select
                            value={newZoneCategory}
                            onChange={(e) => {
                              setCategoryManuallySet(true);
                              setNewZoneCategory(e.target.value as PropertyZoneOperationalCategory | "");
                            }}
                            className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white"
                          >
                            <option value="">Categoría (opcional)</option>
                            {OPERATIONAL_CATEGORY_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          {!categoryManuallySet && newZoneCategory && (
                            <p className="text-xs text-neutral-400 mt-1">Sugerida según el nombre del área</p>
                          )}
                        </div>
                        {newZoneError && <p className="text-xs text-red-600">{newZoneError}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateZone} disabled={isCreatingZone}
                            className="flex-1 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded-lg disabled:opacity-50 transition">
                            {isCreatingZone ? "Guardando..." : "Crear área"}
                          </button>
                          <button type="button" onClick={() => { setShowNewZoneForm(false); setNewZoneName(""); setNewZoneCategory(""); setCategoryManuallySet(false); setNewZoneError(null); }}
                            className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                    {propertyZoneId && <input type="hidden" name="propertyZoneId" value={propertyZoneId} />}
                  </div>
                ) : (
                  propertyZoneId && <input type="hidden" name="propertyZoneId" value={propertyZoneId} />
                )}

                {/* Paso 2: Categoría (solo en modo creación) */}
                {!isEditMode && step === "CATEGORY" && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-3">
                      Categoría *
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Object.values(InventoryCategory).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleCategoryClick(cat)}
                          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                            category === cat
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                          }`}
                        >
                          {getCategoryLabel(cat)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paso 3: Ítem (solo en modo creación) */}
                {!isEditMode && step === "ITEM" && isValidCategory(category) && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Ítem *
                    </label>

                    {/* Búsqueda en modal */}
                    <div className="mb-3">
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                      />
                    </div>

                    {/* Ya en tu catálogo */}
                    {catalogItems.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <p className="text-xs text-neutral-500">
                              Ya en tu catálogo:
                            </p>
                            {/* Toggle para mostrar todo el catálogo */}
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={showAllCatalogItems}
                                onChange={(e) => setShowAllCatalogItems(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-neutral-300 text-black focus:ring-neutral-300"
                              />
                              <span className="text-xs text-neutral-600">
                                Mostrar todo el catálogo
                              </span>
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsCatalogEditMode(!isCatalogEditMode)}
                            className="text-neutral-500 hover:text-neutral-900 transition-colors p-1"
                            aria-label={isCatalogEditMode ? "Salir de edición" : "Editar catálogo"}
                          >
                            {isCatalogEditMode ? (
                              <svg
                                className="w-4 h-4"
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
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {filteredCatalogItems.map((item) => (
                            <div
                              key={item.id}
                              className={`relative inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition ${
                                selectedItemId === item.id && !isCatalogEditMode
                                  ? "bg-neutral-900 text-white border-neutral-900"
                                  : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                              }`}
                            >
                              {isCatalogEditMode ? (
                                <>
                                  <span className="text-xs">{item.name}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setItemToEdit({
                                        id: item.id,
                                        name: item.name,
                                        defaultVariantKey: item.defaultVariantKey,
                                        defaultVariantLabel: item.defaultVariantLabel || undefined,
                                        defaultVariantOptions: item.defaultVariantOptions || undefined,
                                      });
                                      setIsEditCatalogItemModalOpen(true);
                                    }}
                                    className="text-neutral-500 hover:text-neutral-900 transition-colors p-0.5"
                                    aria-label="Editar item"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (confirm(`¿Eliminar "${item.name}" del catálogo?`)) {
                                        try {
                                          console.log("[AddInventoryItemModal] Iniciando eliminación de item:", {
                                            itemId: item.id,
                                            itemName: item.name,
                                            category: category,
                                            timestamp: new Date().toISOString(),
                                          });

                                          const formData = new FormData();
                                          formData.set("itemId", item.id);
                                          
                                          await deleteInventoryItemAction(formData);
                                          
                                          console.log("[AddInventoryItemModal] Eliminación exitosa, actualizando cache local");
                                          
                                          // Actualizar cache local inmediatamente removiendo el item eliminado
                                          if (isValidCategory(category)) {
                                            setCatalogCache((prev) => ({
                                              ...prev,
                                              [category]: (prev[category] || []).filter((i) => i.id !== item.id),
                                            }));
                                          }
                                          
                                          // Si el item eliminado estaba seleccionado, limpiar selección
                                          if (selectedItemId === item.id) {
                                            setSelectedItemId("");
                                            setSelectedCatalogItem(null);
                                          }
                                          
                                          console.log("[AddInventoryItemModal] Cache actualizado, item removido del catálogo");
                                        } catch (error: any) {
                                          console.error("[AddInventoryItemModal] Error al eliminar item:", {
                                            itemId: item.id,
                                            errorMessage: error?.message,
                                            error: error,
                                          });
                                          // Mostrar error completo al usuario
                                          alert(error?.message || "Ocurrió un error al eliminar el item. Por favor, intenta de nuevo.");
                                        }
                                      }
                                    }}
                                    className="text-neutral-500 hover:text-red-600 transition-colors p-0.5"
                                    aria-label="Eliminar item"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCatalogItemClick(item)}
                                  className="text-left"
                                >
                                  {item.name}
                                </button>
                              )}
                            </div>
                          ))}
                          {loadingCatalog && (
                            <span className="text-xs text-neutral-500 px-3 py-1.5">
                              Cargando...
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sugerencias */}
                    {filteredSuggestions.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-neutral-500">
                            Sugerencias:
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsCatalogEditMode(!isCatalogEditMode)}
                            className="text-neutral-500 hover:text-neutral-900 transition-colors p-1"
                            aria-label={isCatalogEditMode ? "Salir de edición" : "Editar sugerencias"}
                          >
                            {isCatalogEditMode ? (
                              <svg
                                className="w-4 h-4"
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
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {filteredSuggestions.map((suggestion) => (
                            <div
                              key={suggestion.name}
                              className={`relative inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition ${
                                customItemName === suggestion.name && !isCatalogEditMode
                                  ? "bg-neutral-900 text-white border-neutral-900"
                                  : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                              }`}
                            >
                              {isCatalogEditMode ? (
                                <>
                                  <span className="text-xs">{suggestion.name}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Convertir sugerencia en item del catálogo para editar
                                      setItemToEdit({
                                        id: "", // No tiene ID porque es una sugerencia
                                        name: suggestion.name,
                                        defaultVariantKey: suggestion.variantKey || null,
                                      });
                                      setIsEditCatalogItemModalOpen(true);
                                    }}
                                    className="text-neutral-500 hover:text-neutral-900 transition-colors p-0.5"
                                    aria-label="Editar sugerencia"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Las sugerencias son hardcodeadas, no se pueden eliminar
                                      // Pero podemos mostrar un mensaje
                                      alert("Las sugerencias predeterminadas no se pueden eliminar. Puedes crear un item personalizado con 'Otro...'");
                                    }}
                                    className="text-neutral-400 cursor-not-allowed p-0.5"
                                    aria-label="No se puede eliminar sugerencia predeterminada"
                                    disabled
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSuggestionClick(suggestion)}
                                  className="text-left"
                                >
                                  {suggestion.name}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Opción "Otro" */}
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={handleCustomItem}
                        className={`px-3 py-1.5 rounded-full text-sm border transition ${
                          isCustomItem && customItemName === ""
                            ? "bg-neutral-900 text-white border-neutral-900"
                            : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                        }`}
                      >
                        Otro...
                      </button>
                    </div>

                    {/* Input para nombre personalizado */}
                    {(isCustomItem || customItemName !== "") && (
                      <input
                        type="text"
                        name="itemName"
                        value={customItemName}
                        onChange={(e) => setCustomItemName(e.target.value)}
                        placeholder="Nombre del ítem"
                        required={!selectedItemId}
                        maxLength={120}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                      />
                    )}

                    {/* Campo oculto para itemId si se selecciona del catálogo */}
                    {selectedItemId && (
                      <input
                        type="hidden"
                        name="itemId"
                        value={selectedItemId}
                      />
                    )}
                  </div>
                )}

                {/* Paso 4: Detalles */}
                {step === "DETAILS" && (
                  <div className="space-y-4">
                    {/* Resumen de lo capturado (solo en modo creación) */}
                    {!isEditMode && (
                      <div className="bg-neutral-50 rounded-lg p-3 space-y-2 border border-neutral-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-500">Área:</span>
                          <span className="text-sm font-medium text-neutral-900">{zoneName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-500">Categoría:</span>
                          <span className="text-sm font-medium text-neutral-900">
                            {category ? getCategoryLabel(category) : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-500">Ítem:</span>
                          <span className="text-sm font-medium text-neutral-900">
                            {selectedItemName}
                            {variantValue && variantKey && (
                              <span className="text-neutral-600">
                                {" — "}
                                {getVariantLabel(variantKey, variantValue)}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Área (solo en modo edición) — Phase 7: zones */}
                    {isEditMode && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-3">
                          Área / Ubicación *
                        </label>
                        {loadingAreas && (
                          <p className="text-xs text-neutral-500 mb-2">Cargando áreas...</p>
                        )}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {propertyZones.map((zone) => (
                            <button
                              key={zone.id}
                              type="button"
                              onClick={() => {
                                setPropertyZoneId(zone.id);
                                setZoneName(zone.name);
                              }}
                              className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                                propertyZoneId === zone.id
                                  ? "bg-neutral-900 text-white border-neutral-900"
                                  : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                              }`}
                            >
                              {zone.name}
                            </button>
                          ))}
                        </div>
                        {/* Phase 12: crear nueva zona inline (edit mode) */}
                        {!showNewZoneForm ? (
                          <button type="button" onClick={() => { setShowNewZoneForm(true); setNewZoneError(null); }}
                            className="w-full rounded-lg border-2 border-dashed border-neutral-300 py-2 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition mb-2">
                            + Nueva área
                          </button>
                        ) : (
                          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2 mb-2">
                            <p className="text-xs font-semibold text-neutral-800">Nueva área</p>
                            <input type="text" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleCreateZone(); if (e.key === "Escape") setShowNewZoneForm(false); }}
                              placeholder="Ej. Baño principal" autoFocus
                              className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                            <div>
                              <select value={newZoneCategory} onChange={(e) => {
                                  setCategoryManuallySet(true);
                                  setNewZoneCategory(e.target.value as PropertyZoneOperationalCategory | "");
                                }}
                                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
                                <option value="">Categoría (opcional)</option>
                                {OPERATIONAL_CATEGORY_OPTIONS.map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                              {!categoryManuallySet && newZoneCategory && (
                                <p className="text-xs text-neutral-400 mt-1">Sugerida según el nombre del área</p>
                              )}
                            </div>
                            {newZoneError && <p className="text-xs text-red-600">{newZoneError}</p>}
                            <div className="flex gap-2">
                              <button type="button" onClick={handleCreateZone} disabled={isCreatingZone}
                                className="flex-1 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded-lg disabled:opacity-50 transition">
                                {isCreatingZone ? "Guardando..." : "Crear área"}
                              </button>
                              <button type="button" onClick={() => { setShowNewZoneForm(false); setNewZoneName(""); setNewZoneCategory(""); setCategoryManuallySet(false); setNewZoneError(null); }}
                                className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                        {propertyZoneId && <input type="hidden" name="propertyZoneId" value={propertyZoneId} />}
                      </div>
                    )}

                    {/* Cantidad esperada (stepper visible para todos) */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-2">
                          Cantidad esperada *
                        </label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (expectedQty > 1) {
                                setExpectedQty(expectedQty - 1);
                              }
                            }}
                            disabled={expectedQty <= 1}
                            className="w-10 h-10 rounded-lg border border-neutral-300 flex items-center justify-center hover:bg-neutral-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                                d="M20 12H4"
                              />
                            </svg>
                          </button>
                          <input
                            type="number"
                            name="expectedQty"
                            value={expectedQty}
                            onChange={(e) => {
                              const value = parseInt(e.target.value, 10);
                              if (!isNaN(value) && value > 0) {
                                setExpectedQty(value);
                              } else if (e.target.value === "") {
                                setExpectedQty(1);
                              }
                            }}
                            min="1"
                            required={true}
                            className="w-20 text-center rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                          />
                          <button
                            type="button"
                            onClick={() => setExpectedQty(expectedQty + 1)}
                            className="w-10 h-10 rounded-lg border border-neutral-300 flex items-center justify-center hover:bg-neutral-50 transition"
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
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </button>
                        </div>
                    </div>

                    {/* Sección Variante — V1.5 (modo edición) */}
                    {isEditMode && (
                      <div className="pt-3 border-t border-neutral-200 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasVariantsToggle}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setHasVariantsToggle(checked);
                              if (!checked) {
                                setVariantKey(null);
                                setVariantValue("");
                                setVariantGroup(null);
                                setVariantGroups([]);
                                setPendingVariantNormalized(null);
                              }
                            }}
                            disabled={editStage === "loading"}
                            className="w-4 h-4 rounded border-neutral-300 text-black disabled:opacity-50"
                          />
                          <span className="text-sm font-medium text-neutral-700">
                            Este ítem tiene variante
                          </span>
                        </label>

                        {editStage === "loading" && (
                          <p className="text-xs text-neutral-500">Cargando variantes…</p>
                        )}

                        {hasVariantsToggle && editStage !== "loading" && (() => {
                          // Grupos disponibles para el picker: siempre los 3 canónicos +
                          // cualquier grupo custom de la BD (no canónico).
                          const pickerGroups = [
                            ...CANONICAL_VARIANT_GROUPS,
                            ...variantGroups.filter(
                              (g) => !CANONICAL_VARIANT_GROUPS.some((c) => c.key === g.key)
                            ),
                          ];
                          const selectedGrp = variantKey
                            ? (() => {
                                // Para grupos canónicos, siempre usar las opciones de CANONICAL_VARIANT_GROUPS
                                // para evitar mostrar opciones desactualizadas/incompletas de la BD.
                                const canonical = CANONICAL_VARIANT_GROUPS.find((g) => g.key === variantKey);
                                if (canonical) return canonical;
                                return pickerGroups.find((g) => g.key === variantKey) ?? null;
                              })()
                            : null;

                          return (
                            <div className="space-y-3">
                              {!selectedGrp && (
                                <div>
                                  <p className="text-xs text-neutral-500 mb-2">
                                    Selecciona el tipo de variante
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {pickerGroups.map((grp) => (
                                      <button
                                        key={grp.key}
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setVariantKey(grp.key);
                                          setVariantValue("");
                                          setPendingVariantNormalized(null);
                                          setVariantGroup({
                                            key: grp.key,
                                            label: grp.label ?? null,
                                            options: [...grp.options],
                                          });
                                        }}
                                        className="px-3 py-1.5 rounded-full text-sm border border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50 transition"
                                      >
                                        {grp.label ?? grp.key}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {selectedGrp && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-neutral-600">
                                      {selectedGrp.label ?? selectedGrp.key}
                                    </p>
                                    {pickerGroups.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setVariantKey(null);
                                          setVariantValue("");
                                          setPendingVariantNormalized(null);
                                        }}
                                        className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                                      >
                                        Cambiar
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedGrp.options.map((opt) => {
                                      const isSelected =
                                        normalizeVariantValue(variantValue) === opt.valueNormalized;
                                      return (
                                        <button
                                          key={opt.valueNormalized}
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setVariantKey(selectedGrp.key);
                                            setVariantValue(opt.value);
                                            setPendingVariantNormalized(opt.valueNormalized);
                                            setVariantGroup({
                                              key: selectedGrp.key,
                                              label: selectedGrp.label ?? null,
                                              options: [...selectedGrp.options],
                                            });
                                          }}
                                          className={`px-3 py-1.5 rounded-full text-sm border transition ${
                                            isSelected
                                              ? "border-neutral-900 bg-neutral-900 text-white"
                                              : "border-neutral-300 hover:bg-neutral-50 cursor-pointer"
                                          }`}
                                        >
                                          {opt.value}
                                          {isSelected ? " ✓" : ""}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {variantKey && !variantValue && (
                                    <p className="text-xs text-amber-700 mt-1.5">
                                      Selecciona una opción antes de guardar.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Sección Variante — V1.5 (modo creación) */}
                    {!isEditMode && (
                      <div className="pt-3 border-t border-neutral-200 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={variantEnabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setVariantEnabled(checked);
                              if (!checked) {
                                setVariantKey(null);
                                setVariantValue("");
                              }
                            }}
                            className="w-4 h-4 rounded border-neutral-300 text-black"
                          />
                          <span className="text-sm font-medium text-neutral-700">
                            Este ítem tiene variante
                          </span>
                        </label>

                        {variantEnabled && !variantKey && (
                          <div>
                            <p className="text-xs text-neutral-500 mb-2">
                              Selecciona el tipo de variante
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {CANONICAL_VARIANT_GROUPS.map((grp) => (
                                <button
                                  key={grp.key}
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setVariantKey(grp.key);
                                    setVariantValue("");
                                  }}
                                  className="px-3 py-1.5 rounded-full text-sm border border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50 transition"
                                >
                                  {grp.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {variantEnabled && variantKey && (() => {
                          const selectedGrp =
                            CANONICAL_VARIANT_GROUPS.find((g) => g.key === variantKey) ?? null;
                          if (!selectedGrp) return null;
                          return (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-neutral-600">
                                  {selectedGrp.label}
                                </p>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setVariantKey(null);
                                    setVariantValue("");
                                  }}
                                  className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                                >
                                  Cambiar
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {selectedGrp.options.map((opt) => {
                                  const isSelected =
                                    normalizeVariantValue(variantValue) === opt.valueNormalized;
                                  return (
                                    <button
                                      key={opt.valueNormalized}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setVariantValue(opt.value);
                                      }}
                                      className={`px-3 py-1.5 rounded-full text-sm border transition ${
                                        isSelected
                                          ? "border-neutral-900 bg-neutral-900 text-white"
                                          : "border-neutral-300 hover:bg-neutral-50 cursor-pointer"
                                      }`}
                                    >
                                      {opt.value}
                                      {isSelected ? " ✓" : ""}
                                    </button>
                                  );
                                })}
                              </div>
                              {variantKey && !variantValue && (
                                <p className="text-xs text-amber-700 mt-1.5">
                                  Selecciona una opción antes de guardar.
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Sección: Estado del item */}
                    <div className="pt-3 border-t border-neutral-200">
                      <label className="block text-sm font-medium text-neutral-700 mb-3">
                        Estado del item
                      </label>
                      
                      {/* Condición */}
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-neutral-600 mb-2">
                          Condición
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCondition("NEW" as InventoryCondition);
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                              String(condition) === "NEW"
                                ? "bg-neutral-900 text-white border-neutral-900"
                                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                            }`}
                          >
                            Nuevo
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCondition("USED_LT_1Y" as InventoryCondition);
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                              String(condition) === "USED_LT_1Y"
                                ? "bg-neutral-900 text-white border-neutral-900"
                                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                            }`}
                          >
                            Usado menos de 1 año
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCondition("USED_GT_1Y" as InventoryCondition);
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                              String(condition) === "USED_GT_1Y"
                                ? "bg-neutral-900 text-white border-neutral-900"
                                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                            }`}
                          >
                            Usado más de 1 año
                          </button>
                        </div>
                        <input type="hidden" name="condition" value={condition} />
                      </div>

                      {/* Prioridad */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-2">
                          Prioridad
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPriority("HIGH" as InventoryPriority);
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                              String(priority) === "HIGH"
                                ? "bg-neutral-900 text-white border-neutral-900"
                                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                            }`}
                          >
                            Alta
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPriority("MEDIUM" as InventoryPriority);
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                              String(priority) === "MEDIUM"
                                ? "bg-neutral-900 text-white border-neutral-900"
                                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                            }`}
                          >
                            Media
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPriority("LOW" as InventoryPriority);
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                              String(priority) === "LOW"
                                ? "bg-neutral-900 text-white border-neutral-900"
                                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                            }`}
                          >
                            Baja
                          </button>
                        </div>
                        <input type="hidden" name="priority" value={priority} />
                        <p className="text-xs text-neutral-500 mt-2">
                          Alta: Fácil de perder o dañar o Indispensable para la operación o valor alto<br />
                          Media: La operación continúa pero con deficiencias<br />
                          Baja: No afecta la operación
                        </p>
                      </div>
                    </div>

                    {/* Campos avanzados (colapsados) */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${
                            showAdvanced ? "rotate-90" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        Más detalles
                      </button>

                      {showAdvanced && (
                        <div className="mt-3 space-y-3 pl-6 border-l-2 border-neutral-200">
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Marca
                            </label>
                            <input
                              type="text"
                              name="brand"
                              value={brand}
                              onChange={(e) => setBrand(e.target.value)}
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Modelo
                            </label>
                            <input
                              type="text"
                              name="model"
                              value={model}
                              onChange={(e) => setModel(e.target.value)}
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Número de serie
                            </label>
                            <input
                              type="text"
                              name="serialNumber"
                              value={serialNumber}
                              onChange={(e) => setSerialNumber(e.target.value)}
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Color
                            </label>
                            <input
                              type="text"
                              name="color"
                              value={color}
                              onChange={(e) => setColor(e.target.value)}
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                            />
                          </div>
                          {/* Ocultar campo Tamaño si variantKey="bed_size" (para evitar duplicidad con variante) */}
                          {variantKey !== "bed_size" && (
                            <div>
                              <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Tamaño
                              </label>
                              <input
                                type="text"
                                name="size"
                                value={size}
                                onChange={(e) => setSize(e.target.value)}
                                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Notas
                            </label>
                            <textarea
                              name="notes"
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              rows={3}
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sección de Fotos (solo en modo edición) */}
                    {/* Fase 11: si hay lineId → imágenes por línea (fallback al item incluido) */}
                    {isEditMode && selectedItemId && (
                      <div className="pt-3 border-t border-neutral-200">
                        {loadingThumbs ? (
                          <p className="text-xs text-neutral-500">Cargando fotos...</p>
                        ) : lineId ? (
                          <InventoryLineImageSlots
                            lineId={lineId}
                            initialThumbs={itemThumbs}
                            onThumbsChange={setItemThumbs}
                          />
                        ) : (
                          <InventoryItemImageSlots
                            itemId={selectedItemId}
                            initialThumbs={itemThumbs}
                            onThumbsChange={setItemThumbs}
                          />
                        )}
                      </div>
                    )}

                    {/* Toggle "Seguir agregando en esta área" (solo en modo creación) */}
                    {!isEditMode && (
                      <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                        <input
                          type="checkbox"
                          id="keepAdding"
                          checked={keepAddingInSameArea}
                          onChange={(e) => setKeepAddingInSameArea(e.target.checked)}
                          className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-neutral-300"
                        />
                        <label htmlFor="keepAdding" className="text-sm text-neutral-700 cursor-pointer">
                          Seguir agregando en esta área
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Campos ocultos siempre presentes */}
                {selectedItemId && (
                  <input type="hidden" name="itemId" value={selectedItemId} />
                )}
                {customItemName && customItemName.trim() && (
                  <input type="hidden" name="itemName" value={customItemName} />
                )}
                {category && (
                  <input type="hidden" name="category" value={category} />
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {step !== "AREA" && !isEditMode && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="px-4 py-2 text-base font-medium text-neutral-700 hover:text-neutral-900 transition"
                    >
                      Atrás
                    </button>
                  )}
                  {step === "DETAILS" && keepAddingInSameArea && !isEditMode && (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-base font-medium text-neutral-700 hover:text-neutral-900 transition"
                    >
                      Listo
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step !== "DETAILS" && (
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!canProceed()}
                      className="px-4 py-2 rounded-lg bg-black text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                  )}
                  {step === "DETAILS" && (
                    <button
                      type="submit"
                      disabled={isPending || !canProceed()}
                      className="px-4 py-2 rounded-lg bg-black text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPending ? (isEditMode ? "Actualizando..." : "Guardando...") : (isEditMode ? "Actualizar" : "Guardar")}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para crear item personalizado */}
      <CreateCustomItemModal
        isOpen={isCreateCustomItemModalOpen}
        onClose={() => setIsCreateCustomItemModalOpen(false)}
        onSave={handleCustomItemSave}
        category={category || ""}
      />

      {/* Modal para editar item del catálogo */}
      {itemToEdit && (
        <EditCatalogItemModal
          isOpen={isEditCatalogItemModalOpen}
          onClose={() => {
            setIsEditCatalogItemModalOpen(false);
            setItemToEdit(null);
          }}
          onSave={handleCatalogItemEditSave}
          item={itemToEdit}
          category={category || undefined}
        />
      )}

      {/* Modal para agregar fotos */}
      {createdItemId && (
        <AddItemPhotosModal
          isOpen={showAddPhotosModal}
          itemId={createdItemId}
          itemName={createdItemName || undefined}
          onClose={() => {
            setShowAddPhotosModal(false);
            setCreatedItemId(null);
            setCreatedItemName(null);
            
            // Si keepAddingInSameArea está marcado, mantener el modal abierto y refrescar
            if (keepAddingInSameArea) {
              router.refresh();
            } else {
              // Si no, cerrar completamente
              handleClose();
              router.refresh();
            }
          }}
        />
      )}

      {/* Modal de advertencia de duplicado */}
      {duplicateInfo && (
        <DuplicateItemWarningModal
          isOpen={showDuplicateWarningModal}
          itemName={duplicateInfo.itemName}
          area={duplicateInfo.area}
          variantText={duplicateInfo.variantText}
          existingQuantity={duplicateInfo.quantity}
          onConfirm={async () => {
            setShowDuplicateWarningModal(false);
            
            if (pendingFormData) {
              // Agregar flag para permitir duplicado
              pendingFormData.set("allowDuplicate", "true");
              console.log("[AddInventoryItemModal] Confirmando duplicado, allowDuplicate=true");
              
              try {
                // Detectar si se va a crear un nuevo item
                const willCreateNewItem = !isEditMode && !selectedItemId && customItemName.trim() !== "";
                
                console.log("[AddInventoryItemModal] Llamando a createInventoryLineAction con allowDuplicate=true");
                const result = await createInventoryLineAction(pendingFormData);
                console.log("[AddInventoryItemModal] Resultado de createInventoryLineAction:", result);
                
                // Si se creó un nuevo item, recargar el catálogo
                if (willCreateNewItem && category) {
                  handleCatalogItemEditSave();
                }
                
                // Continuar con el flujo normal de fotos
                if (result && typeof result === 'object' && 'itemId' in result && result.itemId) {
                  setCreatedItemId(result.itemId);
                  setCreatedItemName(result.itemName || null);
                  
                  if (keepAddingInSameArea) {
                    // Limpiar formulario
                    setSelectedItemId("");
                    setCustomItemName("");
                    setVariantKey(null);
                    setVariantValue("");
                    setSelectedSuggestion(null);
                    setSelectedCatalogItem(null);
                    setExpectedQty(1);
                    setShowAdvanced(false);
                    setBrand("");
                    setModel("");
                    setSerialNumber("");
                    setColor("");
                    setSize("");
                    setNotes("");
                    setSearchTerm("");
                    setError(null);
                    goToStep("ITEM");
                  } else {
                    setIsOpen(false);
                  }
                  
                  router.refresh();
                  if (!keepAddingInSameArea) {
                    handleClose();
                  }
                } else {
                  if (keepAddingInSameArea) {
                    // Limpiar formulario
                    setSelectedItemId("");
                    setCustomItemName("");
                    setVariantKey(null);
                    setVariantValue("");
                    setSelectedSuggestion(null);
                    setSelectedCatalogItem(null);
                    setExpectedQty(1);
                    setShowAdvanced(false);
                    setBrand("");
                    setModel("");
                    setSerialNumber("");
                    setColor("");
                    setSize("");
                    setNotes("");
                    setSearchTerm("");
                    setError(null);
                    goToStep("ITEM");
                    router.refresh();
                  } else {
                    handleClose();
                    router.refresh();
                  }
                }
              } catch (error: any) {
                console.error("Error al crear item con duplicado permitido:", error);
                if (error?.message) {
                  setError(error.message);
                } else {
                  setError("Ocurrió un error al crear el item. Por favor, intenta de nuevo.");
                }
              }
            }
            
            // Limpiar estado
            setDuplicateInfo(null);
            setPendingFormData(null);
          }}
          onCancel={() => {
            setShowDuplicateWarningModal(false);
            setDuplicateInfo(null);
            setPendingFormData(null);
            setError(null);
          }}
        />
      )}
    </>
  );
}
