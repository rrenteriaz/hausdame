"use client";

/**
 * Nuevo wizard de creación de inventario (UX-first, orientado a limpieza)
 * Flujo: ITEM → AREA → ATTENTION → CONFIRM
 * 
 * Características:
 * - No pide categoría (se infiere automáticamente)
 * - Nivel de atención preseleccionado (inferido)
 * - Flujo rápido y poco tedioso
 * - Layout adaptativo (mobile full-screen, web drawer)
 */

import { useState, useEffect, useRef, useTransition, useId } from "react";
import { useRouter } from "next/navigation";
import {
  createInventoryLineAction,
  searchGlobalCatalogItemsAction,
  ensureTenantCatalogItemFromGlobalAction,
  getFrequentItemsAction,
  getPropertyZones,
  checkDuplicateInventoryLineAction,
  createPropertyZoneAction,
} from "@/app/host/inventory/actions";
import {
  OPERATIONAL_CATEGORY_OPTIONS,
} from "@/lib/inventory-zone-labels";
import { inferZoneCategory } from "@/lib/zones/inferZoneCategory";
import type { PropertyZoneOperationalCategory } from "@prisma/client";
import { InventoryPriority } from "@prisma/client";
import { inferInventoryData, type AttentionLevel } from "@/lib/inventory-inference";
import { isBedSizeVariantable } from "@/lib/inventory-suggestions";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { normalizeName, normalizeVariantValue } from "@/lib/inventory-normalize";
import { CANONICAL_VARIANT_GROUPS } from "@/lib/inventory-canonical-variants";

interface AddInventoryItemWizardProps {
  propertyId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (itemName: string, area: string, attentionLevel: AttentionLevel) => void;
}

interface Toast {
  id: string;
  message: string;
  type?: "success" | "error" | "info";
}

type WizardStep = "ITEM" | "AREA" | "ATTENTION" | "CONFIRM";

interface CatalogItem {
  id: string;
  name: string;
  category?: string; // Opcional para items del CG
  defaultCategory?: string | null; // Para items del CG
  defaultVariantKey?: string | null;
  defaultVariantLabel?: string | null;
  defaultVariantOptions?: any;
  nameNormalized?: string; // Para items del CG
}

export default function AddInventoryItemWizard({
  propertyId,
  isOpen,
  onClose,
  onSuccess,
}: AddInventoryItemWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Estado del wizard
  const [step, setStep] = useState<WizardStep>("ITEM");
  const [lastUsedZoneId, setLastUsedZoneId] = useState<string>("");
  const [persistedZoneId, setPersistedZoneId] = useState<string>(""); // Zona persistida para "Agregar otro"

  // Estado del formulario
  const [itemName, setItemName] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedGlobalCatalogItemId, setSelectedGlobalCatalogItemId] = useState<string | null>(null); // ID del item del CG seleccionado
  const [selectedItemVariantKey, setSelectedItemVariantKey] = useState<string | null>(null); // Para items del catálogo con variante
  const [propertyZoneId, setPropertyZoneId] = useState(""); // Phase 7: zone id (primary)
  const [zoneName, setZoneName] = useState(""); // display name derivado de la zona
  const [attentionLevel, setAttentionLevel] = useState<AttentionLevel>("LOW");
  const [inferredCategory, setInferredCategory] = useState<string>("OTHER");
  const [inferredHint, setInferredHint] = useState<string>("");
  const [variantValue, setVariantValue] = useState<string>(""); // Valor de variante seleccionado (ej: "individual", "matrimonial")

  // Estado de búsqueda y catálogo
  const [searchTerm, setSearchTerm] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [frequentItems, setFrequentItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [propertyZones, setPropertyZones] = useState<{ id: string; name: string; sortOrder: number | null; operationalCategory: PropertyZoneOperationalCategory | null }[]>([]); // Phase 7

  // Phase 12: inline zone creation sub-form
  const [showNewZoneForm, setShowNewZoneForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneCategory, setNewZoneCategory] = useState<PropertyZoneOperationalCategory | "">("");
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const [isCreatingZone, setIsCreatingZone] = useState(false);
  const [newZoneError, setNewZoneError] = useState<string | null>(null);

  // Ref para evitar respuestas fuera de orden
  const requestIdRef = useRef(0);
  
  // Cache persistente en memoria para búsquedas recientes
  const searchCacheRef = useRef(new Map<string, CatalogItem[]>());
  
  // Ref para mantener últimos resultados visibles (evitar lista vacía durante carga)
  const lastShownResultsRef = useRef<CatalogItem[]>([]);

  // Estado de toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  const baseId = useId();

  // Helper para mostrar toast (se cierra automáticamente después de 3 segundos)
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    let toastId: string;
    setToasts((prev) => {
      toastId = `${baseId}-${prev.length}`;
      return [...prev, { id: toastId, message, type }];
    });
    // Auto-remover después de 3 segundos (toastId asignado sincrónicamente en el updater)
    setTimeout(() => removeToast(toastId!), 3000);
  };

  // Helper para remover toast
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Phase 7: Cargar zonas OPERATIONAL al abrir
  useEffect(() => {
    if (isOpen) {
      getPropertyZones(propertyId).then((zones) => {
        setPropertyZones(zones);
      });

      // Cargar items frecuentes
      getFrequentItemsAction().then((items) => {
        // Ordenar alfabéticamente respetando casing exacto
        const sorted = (items as CatalogItem[]).sort((a, b) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" })
        );
        setFrequentItems(sorted);
      });
    }
  }, [isOpen, propertyId]);

  // Búsqueda en catálogo cuando cambia searchTerm
  useEffect(() => {
    if (!isOpen) return;

    const trimmedSearch = searchTerm.trim();
    const normalizedSearch = trimmedSearch.length > 0 ? normalizeName(trimmedSearch) : "";

    // Debounce adaptativo: más rápido para términos largos
    const debounceDelay = trimmedSearch.length >= 3 ? 120 : 250;

    const timeoutId = setTimeout(() => {
      if (trimmedSearch.length > 0) {
        // Verificar cache primero
        if (searchCacheRef.current.has(normalizedSearch)) {
          const cachedItems = searchCacheRef.current.get(normalizedSearch)!;
          setCatalogItems(cachedItems);
          lastShownResultsRef.current = cachedItems;
          setLoadingCatalog(false);
          // Refrescar en background sin bloquear UI
          requestIdRef.current += 1;
          const currentRequestId = requestIdRef.current;
          
          searchGlobalCatalogItemsAction(trimmedSearch)
            .then((items) => {
              // Solo actualizar si esta es la última solicitud
              if (currentRequestId === requestIdRef.current) {
                // Mapear items del CG al formato CatalogItem
                const mappedItems: CatalogItem[] = items.map((item: any) => ({
                  id: item.id,
                  name: item.name,
                  defaultCategory: item.defaultCategory,
                  nameNormalized: item.nameNormalized,
                  defaultVariantKey: null, // Los items del CG no tienen variantes por defecto en V1
                  defaultVariantLabel: null,
                  defaultVariantOptions: null,
                }));
                const sorted = mappedItems.sort((a, b) =>
                  a.name.localeCompare(b.name, "es", { sensitivity: "base" })
                );
                setCatalogItems(sorted);
                lastShownResultsRef.current = sorted;
                // Actualizar cache
                searchCacheRef.current.set(normalizedSearch, sorted);
                // Limitar tamaño del cache (mantener solo últimas 50 búsquedas)
                if (searchCacheRef.current.size > 50) {
                  const firstKey = searchCacheRef.current.keys().next().value as string | undefined;
                  if (firstKey) {
                    searchCacheRef.current.delete(firstKey);
                  }
                }
              }
            })
            .catch(() => {
              // Ignorar errores en refresh de cache
            });
        } else {
          // No hay cache, hacer búsqueda normal
          setLoadingCatalog(true);
          requestIdRef.current += 1;
          const currentRequestId = requestIdRef.current;
          
          searchGlobalCatalogItemsAction(trimmedSearch)
            .then((items) => {
              // Solo actualizar si esta es la última solicitud
              if (currentRequestId === requestIdRef.current) {
                // Mapear items del CG al formato CatalogItem
                const mappedItems: CatalogItem[] = items.map((item: any) => ({
                  id: item.id,
                  name: item.name,
                  defaultCategory: item.defaultCategory,
                  nameNormalized: item.nameNormalized,
                  defaultVariantKey: null, // Los items del CG no tienen variantes por defecto en V1
                  defaultVariantLabel: null,
                  defaultVariantOptions: null,
                }));
                const sorted = mappedItems.sort((a, b) =>
                  a.name.localeCompare(b.name, "es", { sensitivity: "base" })
                );
                setCatalogItems(sorted);
                lastShownResultsRef.current = sorted;
                setLoadingCatalog(false);
                // Guardar en cache
                searchCacheRef.current.set(normalizedSearch, sorted);
                // Limitar tamaño del cache
                if (searchCacheRef.current.size > 50) {
                  const firstKey = searchCacheRef.current.keys().next().value as string | undefined;
                  if (firstKey) {
                    searchCacheRef.current.delete(firstKey);
                  }
                }
              }
            })
            .catch(() => {
              if (currentRequestId === requestIdRef.current) {
                setLoadingCatalog(false);
              }
            });
        }
      } else {
        // Búsqueda vacía: limpiar resultados
        setCatalogItems([]);
        lastShownResultsRef.current = [];
        setLoadingCatalog(false);
      }
    }, debounceDelay);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, isOpen]);

  // Inferir atención y categoría cuando cambia itemName
  // NOTA: La inferencia solo se usa para mostrar hints visuales, NO para cambiar el nivel de atención seleccionado
  // El nivel de atención por defecto es "LOW" y solo cambia si el usuario lo selecciona explícitamente
  useEffect(() => {
    if (itemName.trim().length > 0) {
      const inference = inferInventoryData(itemName);
      // NO sobrescribir attentionLevel con la inferencia - mantener "LOW" por defecto
      // setAttentionLevel(inference.attentionLevel); // Comentado: mantener LOW por defecto
      setInferredCategory(inference.category);
      setInferredHint(inference.hint || "");
    }
  }, [itemName]);

  // Autofocus en input de búsqueda cuando se abre el modal
  useEffect(() => {
    if (isOpen && step === "ITEM" && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, step]);

  // Resetear estado al cerrar (pero mantener área persistida)
  const handleClose = () => {
    setStep("ITEM");
    setItemName("");
    setSelectedItemId(null);
    setSearchTerm("");
    // Phase 7: restore persisted zone
    const restoredId = persistedZoneId || lastUsedZoneId || "";
    setPropertyZoneId(restoredId);
    setZoneName(propertyZones.find((z) => z.id === restoredId)?.name ?? "");
    setAttentionLevel("LOW");
    onClose();
  };

  // Resetear para "Agregar otro" (mantiene zona)
  const handleAddAnother = () => {
    setStep("ITEM");
    setItemName("");
    setSelectedItemId(null);
    setSelectedGlobalCatalogItemId(null);
    setSelectedItemVariantKey(null);
    setVariantValue("");
    setSearchTerm("");
    setAttentionLevel("LOW");
    // Phase 7: mantener zona persistida
    const restoredId = persistedZoneId || lastUsedZoneId || "";
    setPropertyZoneId(restoredId);
    setZoneName(propertyZones.find((z) => z.id === restoredId)?.name ?? "");

    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Paso 1: Seleccionar item
  const handleItemSelect = (item: CatalogItem | null, customName?: string) => {
    // Resetear todo cuando se cambia el item/nombre
    setPropertyZoneId("");
    setZoneName("");
    setVariantValue("");
    setSelectedItemVariantKey(null);
    setAttentionLevel("LOW");
    
    if (item) {
      // Si el item viene del CG (tiene nameNormalized), guardar su ID del CG
      if (item.nameNormalized) {
        setSelectedGlobalCatalogItemId(item.id);
        setSelectedItemId(null); // Aún no tenemos el InventoryItem tenant
      } else {
        // Item del tenant (legacy)
        setSelectedItemId(item.id);
        setSelectedGlobalCatalogItemId(null);
      }
      setItemName(item.name);
      // Si el item tiene defaultVariantKey, configurarlo
      if (item.defaultVariantKey) {
        setSelectedItemVariantKey(item.defaultVariantKey);
      } else {
        setSelectedItemVariantKey(null);
      }
    } else if (customName) {
      setSelectedItemId(null);
      setSelectedGlobalCatalogItemId(null);
      setItemName(customName.trim());
      setSelectedItemVariantKey(null);
    }

    // Avanzar automáticamente al paso AREA
    setStep("AREA");
  };
  
  // Navegación hacia atrás
  const handleBack = () => {
    if (step === "AREA") {
      setStep("ITEM");
      // Phase 7: resetear zona al volver
      setPropertyZoneId("");
      setZoneName("");
      setVariantValue("");
    } else if (step === "ATTENTION") {
      setStep("AREA");
    }
  };

  // Paso 2: Seleccionar zona (Phase 7)
  const handleAreaSelect = (zoneId: string, name: string) => {
    setPropertyZoneId(zoneId);
    setZoneName(name);
    setLastUsedZoneId(zoneId);
    setPersistedZoneId(zoneId);
    // El avance a ATTENTION se maneja en el onClick del botón de zona
  };

  // Phase 12: crear zona inline desde el AREA step
  const handleCreateZone = async () => {
    const trimmed = newZoneName.trim();
    if (!trimmed) { setNewZoneError("El nombre es obligatorio"); return; }
    setNewZoneError(null);
    setIsCreatingZone(true);
    try {
      const zone = await createPropertyZoneAction(propertyId, trimmed, newZoneCategory || null);
      setPropertyZones((prev) => [...prev, zone]);
      handleAreaSelect(zone.id, zone.name);
      setShowNewZoneForm(false);
      setNewZoneName("");
      setNewZoneCategory("");
      setCategoryManuallySet(false);
      // Auto-advance if zone is the only requirement (not variantable or variant already set)
      const wizardVariantGroupOnCreate = selectedItemVariantKey
        ? (CANONICAL_VARIANT_GROUPS.find((g) => g.key === selectedItemVariantKey) ?? null)
        : (isBedSizeVariantable(itemName, selectedItemVariantKey)
            ? (CANONICAL_VARIANT_GROUPS.find((g) => g.key === "bed_size") ?? null)
            : null);
      if (!wizardVariantGroupOnCreate || variantValue) {
        setStep("ATTENTION");
      }
    } catch (err) {
      setNewZoneError(err instanceof Error ? err.message : "Error al crear el área");
    } finally {
      setIsCreatingZone(false);
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

  // Paso 3: Confirmar y crear
  const handleConfirm = async () => {
    if (!itemName.trim() || !propertyZoneId) {
      return;
    }

    const inference = inferInventoryData(itemName);

    startTransition(async () => {
      try {
        // Paso 1: Si hay selectedGlobalCatalogItemId, hacer lazy copy primero
        let finalItemId: string | null = selectedItemId;
        
        if (selectedGlobalCatalogItemId) {
          try {
            const result = await ensureTenantCatalogItemFromGlobalAction(selectedGlobalCatalogItemId);
            finalItemId = result.id;
            // Actualizar estado para futuras referencias
            setSelectedItemId(finalItemId);
            setSelectedGlobalCatalogItemId(null);
          } catch (error: any) {
            console.error("Error al asegurar item del CG:", error);
            showToast(error?.message || "Error al procesar el ítem del catálogo", "error");
            return;
          }
        }

        // Paso 2: Preparar FormData
        const formData = new FormData();
        formData.set("propertyId", propertyId);
        formData.set("propertyZoneId", propertyZoneId); // Phase 7: zone as primary
        formData.set("category", inference.category);
        formData.set("priority", attentionLevel); // Usar el priority seleccionado por el usuario, no el inferido
        formData.set("expectedQty", "1");
        formData.set("condition", "USED_LT_1Y");

        if (finalItemId) {
          formData.set("itemId", finalItemId);
        } else {
          formData.set("itemName", itemName);
        }

        // Agregar variante si aplica — V1.5: soporte para todos los grupos canónicos
        const wizardVariantGroup = selectedItemVariantKey
          ? (CANONICAL_VARIANT_GROUPS.find((g) => g.key === selectedItemVariantKey) ?? null)
          : (isBedSizeVariantable(itemName, selectedItemVariantKey)
              ? (CANONICAL_VARIANT_GROUPS.find((g) => g.key === "bed_size") ?? null)
              : null);
        if (wizardVariantGroup && variantValue) {
          formData.set("variantKey", wizardVariantGroup.key);
          formData.set("variantValue", variantValue); // opt.value (etiqueta de display)
        }

        // Paso 3: Validar duplicados ANTES de crear
        const duplicateCheck = await checkDuplicateInventoryLineAction(formData);
        
        if (duplicateCheck?.exists) {
          // Duplicado detectado: mostrar mensaje y navegar a línea existente
          const variantText = duplicateCheck.variantText || "";
          const message = `Este ítem ya existe en esta área con esas variantes${variantText}. Solo modifica la cantidad.`;
          showToast(message, "error");
          
          // Navegar a la línea existente si tenemos el ID
          if (duplicateCheck.lineId) {
            // Opción 1: Navegar a la página de inventario con scroll a la línea
            router.push(`/host/properties/${propertyId}/inventory?highlight=${duplicateCheck.lineId}`);
            // Opción 2: Cerrar el wizard y dejar que el usuario vea la línea resaltada
            handleClose();
          } else {
            // Si no tenemos lineId, solo mostrar mensaje y mantener el wizard abierto
            // El usuario puede modificar el área o variantes
          }
          return;
        }

        // Paso 4: No hay duplicado, crear la línea
        await createInventoryLineAction(formData);

        // Éxito: mostrar toast con resumen
        const attentionLabel =
          attentionLevel === "HIGH"
            ? "Alta"
            : attentionLevel === "LOW"
            ? "Baja"
            : "Media";
        const toastMessage = `${itemName} · ${zoneName} · ${attentionLabel}`;
        showToast(toastMessage, "success");

        // Callback de éxito
        if (onSuccess) {
          onSuccess(itemName, zoneName, attentionLevel);
        }

        // Mostrar opciones: "Agregar otro" o "Terminar"
        setStep("CONFIRM");
        // Preservar posición de scroll antes del refresh
        const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
        router.refresh();
        // Restaurar scroll después de que el DOM se actualice
        if (typeof window !== "undefined") {
          const restoreScroll = () => window.scrollTo(0, scrollY);
          setTimeout(restoreScroll, 0);
          setTimeout(restoreScroll, 100);
        }
      } catch (error: any) {
        console.error("Error al crear item:", error);
        showToast(error?.message || "Ocurrió un error al crear el item", "error");
      }
    });
  };

  // Renderizar paso actual
  const renderStep = () => {
    switch (step) {
      case "ITEM":
        // Filtrar items usando normalización sin acentos
        const trimmedSearch = searchTerm.trim();
        const searchNormalized = trimmedSearch.length > 0 ? normalizeName(trimmedSearch) : "";
        
        // Filtrar frequentItems si hay búsqueda
        // IMPORTANTE: Filtrar TODOS los frequentItems usando normalizeName en ambos lados
        const filteredFrequentItems = trimmedSearch.length > 0
          ? frequentItems.filter(item => {
              const itemKey = normalizeName(item.name);
              // Usar includes para coincidencias parciales
              return itemKey.includes(searchNormalized);
            })
          : frequentItems;
        
        // Filtrar catalogItems usando normalización sin acentos
        // IMPORTANTE: Filtrar TODOS los catalogItems que vienen del backend,
        // incluso si el backend ya filtró, porque puede haber items con nameNormalized con acentos
        const filteredCatalogItems = trimmedSearch.length > 0
          ? catalogItems.filter(item => {
              const itemKey = normalizeName(item.name);
              // Usar includes para coincidencias parciales
              return itemKey.includes(searchNormalized);
            })
          : [];
        
        // Deduplicar resultados por nombre canónico (normalizeName)
        // Priorizar frequentItems sobre catalogItems
        const mergedResultsMap = new Map<string, CatalogItem>();
        
        // Insertar primero frequentItems (prioridad)
        for (const item of filteredFrequentItems) {
          const key = normalizeName(item.name);
          mergedResultsMap.set(key, item);
        }
        
        // Luego insertar catalogItems solo si no existe
        for (const item of filteredCatalogItems) {
          const key = normalizeName(item.name);
          if (!mergedResultsMap.has(key)) {
            mergedResultsMap.set(key, item);
          }
        }
        
        // Convertir Map a array y ordenar alfabéticamente
        const mergedResults = Array.from(mergedResultsMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" })
        );
        
        // Mantener últimos resultados visibles mientras carga (evitar lista vacía)
        // Si está cargando y no hay resultados mergeados, usar los últimos resultados mostrados
        const shownCatalog =
          loadingCatalog && mergedResults.length === 0
            ? lastShownResultsRef.current.filter(item => {
                // Filtrar también los últimos resultados con el nuevo término de búsqueda
                if (trimmedSearch.length === 0) return false;
                const itemKey = normalizeName(item.name);
                return itemKey.includes(searchNormalized);
              })
            : mergedResults;
        
        // Actualizar ref con los resultados mostrados cuando hay resultados nuevos
        // Esto asegura que siempre tengamos los últimos resultados válidos para mostrar
        if (mergedResults.length > 0) {
          lastShownResultsRef.current = mergedResults;
        } else if (!loadingCatalog && shownCatalog.length > 0) {
          // Si no está cargando y tenemos resultados mostrados (de lastShownResultsRef), mantenerlos
          lastShownResultsRef.current = shownCatalog;
        }
        
        // Verificar si hay matches (por prefix/contains normalizado)
        const hasMatches = shownCatalog.length > 0;
        
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">¿Qué ítem quieres agregar?</h2>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar o escribir ítem…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                autoFocus
              />
            </div>

            {/* Lista de resultados */}
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {/* Indicador de búsqueda sutil (no bloquea la lista) */}
              {loadingCatalog && shownCatalog.length === 0 && (
                <div className="text-center py-4 text-neutral-500 text-sm">Buscando…</div>
              )}
              {loadingCatalog && shownCatalog.length > 0 && (
                <div className="text-xs text-neutral-400 text-center py-1">Buscando…</div>
              )}

              {!loadingCatalog && searchTerm.trim().length === 0 && frequentItems.length > 0 && (
                <>
                  <p className="text-sm text-neutral-500 mb-2">Ítems frecuentes</p>
                  {frequentItems.map((item) => {
                    const inference = inferInventoryData(item.name);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemSelect(item)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition text-left"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900">{item.name}</div>
                          {inference.hint && (
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {inference.hint}
                            </div>
                          )}
                        </div>
                        <div
                          className={`w-3 h-3 rounded-full ${
                            inference.attentionLevel === "HIGH"
                              ? "bg-red-500"
                              : inference.attentionLevel === "LOW"
                              ? "bg-green-500"
                              : "bg-yellow-500"
                          }`}
                        />
                      </button>
                    );
                  })}
                </>
              )}

              {/* Mostrar resultados mergeados cuando hay búsqueda (una sola lista sin duplicados) */}
              {searchTerm.trim().length > 0 && shownCatalog.length > 0 && (
                <>
                  <p className="text-sm text-neutral-500 mb-2">Resultados</p>
                  {shownCatalog.map((item) => {
                    const inference = inferInventoryData(item.name);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemSelect(item)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition text-left"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900">{item.name}</div>
                          {inference.hint && (
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {inference.hint}
                            </div>
                          )}
                        </div>
                        <div
                          className={`w-3 h-3 rounded-full ${
                            inference.attentionLevel === "HIGH"
                              ? "bg-red-500"
                              : inference.attentionLevel === "LOW"
                              ? "bg-green-500"
                              : "bg-yellow-500"
                          }`}
                        />
                      </button>
                    );
                  })}
                </>
              )}

              {/* Mostrar "Crear nuevo" solo si NO hay matches (ni por contains ni por startsWith) */}
              {!loadingCatalog &&
                searchTerm.trim().length > 0 &&
                !hasMatches && (
                  <button
                    onClick={() => handleItemSelect(null, searchTerm)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 border border-neutral-200 transition"
                  >
                    <span className="text-xl">➕</span>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-neutral-900">
                        Crear "{searchTerm}"
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Atención inferida · Categoría inferida
                      </div>
                    </div>
                  </button>
                )}
            </div>
          </div>
        );

      case "AREA": {
        // Phase 7: zonas desde PropertyZone (sorted by sortOrder)
        // V1.5: soporte para todos los grupos canónicos
        const wizardVariantGroup = selectedItemVariantKey
          ? (CANONICAL_VARIANT_GROUPS.find((g) => g.key === selectedItemVariantKey) ?? null)
          : (isBedSizeVariantable(itemName, selectedItemVariantKey)
              ? (CANONICAL_VARIANT_GROUPS.find((g) => g.key === "bed_size") ?? null)
              : null);
        const isVariantable = !!wizardVariantGroup;

        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">¿En qué área está?</h2>
              <p className="text-sm text-neutral-500 mb-4">
                Selecciona el área donde se encuentra este ítem
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {propertyZones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => {
                    handleAreaSelect(zone.id, zone.name);
                    if (isVariantable && !variantValue) {
                      return;
                    }
                    if (!isVariantable || variantValue) {
                      setStep("ATTENTION");
                    }
                  }}
                  className={`p-4 rounded-lg border-2 transition ${
                    propertyZoneId === zone.id
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  {zone.name}
                </button>
              ))}
            </div>

            {/* Phase 12: Crear nueva zona inline */}
            {!showNewZoneForm ? (
              <button
                type="button"
                onClick={() => { setShowNewZoneForm(true); setNewZoneError(null); }}
                className="w-full p-3 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition text-sm font-medium"
              >
                + Nueva área
              </button>
            ) : (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-neutral-800">Nueva área</p>
                <input
                  type="text"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateZone(); if (e.key === "Escape") setShowNewZoneForm(false); }}
                  placeholder="Ej. Baño principal"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                />
                <div>
                  <select
                    value={newZoneCategory}
                    onChange={(e) => {
                      setCategoryManuallySet(true);
                      setNewZoneCategory(e.target.value as PropertyZoneOperationalCategory | "");
                    }}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
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
                  <button
                    type="button"
                    onClick={handleCreateZone}
                    disabled={isCreatingZone}
                    className="flex-1 py-2 text-sm font-medium bg-neutral-900 text-white rounded-lg disabled:opacity-50 transition"
                  >
                    {isCreatingZone ? "Guardando..." : "Crear área"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewZoneForm(false); setNewZoneName(""); setNewZoneCategory(""); setCategoryManuallySet(false); setNewZoneError(null); }}
                    className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Selector de variante — V1.5: soporte para todos los grupos canónicos */}
            {isVariantable && wizardVariantGroup && (
              <div className="space-y-2 pt-4 border-t border-neutral-200">
                <label className="text-sm font-medium text-neutral-700">
                  {wizardVariantGroup.label} *
                </label>
                <p className="text-xs text-neutral-500 mb-2">
                  Selecciona antes de continuar
                </p>
                <div className="flex flex-wrap gap-2">
                  {wizardVariantGroup.options.map((opt) => {
                    const isSelected = normalizeVariantValue(variantValue) === opt.valueNormalized;
                    return (
                      <button
                        key={opt.valueNormalized}
                        type="button"
                        onClick={() => {
                          setVariantValue(opt.value);
                          if (propertyZoneId) {
                            setStep("ATTENTION");
                          }
                        }}
                        className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                          isSelected
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        {opt.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Botón Atrás - Estilo secundario */}
            <button
              onClick={handleBack}
              className="w-full py-3 px-4 text-neutral-600 hover:text-neutral-900 font-medium transition"
            >
              ← Atrás
            </button>
          </div>
        );
      }

      case "ATTENTION":
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Nivel de atención</h2>
              <p className="text-sm text-neutral-500 mb-4">
                Esto ayuda al cleaner a saber qué revisar primero
              </p>
            </div>

            <div className="space-y-3">
              {(
                [
                  {
                    level: "HIGH" as AttentionLevel,
                    label: "Alta",
                    description: "Se pierde o se rompe con facilidad",
                    color: "red",
                  },
                  {
                    level: "MEDIUM" as AttentionLevel,
                    label: "Media",
                    description: "Puede dañarse o fallar",
                    color: "yellow",
                  },
                  {
                    level: "LOW" as AttentionLevel,
                    label: "Baja",
                    description: "Rara vez cambia",
                    color: "green",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.level}
                  onClick={() => setAttentionLevel(option.level)}
                  className={`w-full p-4 rounded-lg border-2 transition text-left ${
                    attentionLevel === option.level
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full ${
                        option.color === "red"
                          ? "bg-red-500"
                          : option.color === "green"
                          ? "bg-green-500"
                          : "bg-yellow-500"
                      }`}
                    />
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm opacity-80">{option.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 py-3 px-4 text-neutral-600 hover:text-neutral-900 font-medium transition"
              >
                ← Atrás
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending || !itemName.trim() || !propertyZoneId}
                className="flex-1 py-3 px-4 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isPending ? "Creando…" : "Agregar ítem"}
              </button>
            </div>
          </div>
        );

      case "CONFIRM":
        const attentionLabelConfirm =
          attentionLevel === "HIGH"
            ? "Alta"
            : attentionLevel === "LOW"
            ? "Baja"
            : "Media";
        return (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="text-4xl mb-4 text-green-500">✓</div>
              <h2 className="text-xl font-semibold mb-2">Ítem agregado</h2>
              <p className="text-sm text-neutral-500">
                {itemName} · {zoneName} · {attentionLabelConfirm}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleAddAnother}
                className="w-full py-3 px-4 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 transition"
              >
                Agregar otro
              </button>
              <button
                onClick={handleClose}
                className="w-full py-3 px-4 bg-white border-2 border-neutral-300 text-neutral-700 rounded-lg font-medium hover:bg-neutral-50 transition"
              >
                Terminar
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  // Layout: mobile full-screen, web drawer
  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agregar ítem</h1>
        <button
          onClick={handleClose}
          className="text-neutral-500 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {(["ITEM", "AREA", "ATTENTION"] as WizardStep[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-neutral-900 text-white"
                  : idx <
                    (["ITEM", "AREA", "ATTENTION"] as WizardStep[]).indexOf(step)
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-200 text-neutral-500"
              }`}
            >
              {idx + 1}
            </div>
            {idx < 2 && (
              <div
                className={`h-1 w-8 ${
                  idx <
                  (["ITEM", "AREA", "ATTENTION"] as WizardStep[]).indexOf(step)
                    ? "bg-neutral-900"
                    : "bg-neutral-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {renderStep()}
    </div>
  );

  return (
    <>
      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[60] space-y-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-6 py-3 rounded-lg shadow-lg text-white transition-all duration-300 pointer-events-auto ${
                toast.type === "success"
                  ? "bg-green-500"
                  : toast.type === "error"
                  ? "bg-red-500"
                  : "bg-blue-500"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      {isMobile ? (
        // Mobile: full-screen overlay
        <div className="fixed inset-0 z-50 bg-white p-6 overflow-y-auto">
          {content}
        </div>
      ) : (
        // Web: drawer lateral
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />

          {/* Drawer */}
          <div className="relative bg-white w-full max-w-md h-full shadow-xl p-6 overflow-y-auto">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

