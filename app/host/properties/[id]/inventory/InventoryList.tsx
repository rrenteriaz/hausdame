"use client";

import { useState } from "react";
import ListContainer from "@/lib/ui/ListContainer";
import {
  editInventoryCache,
  type EditData,
} from "@/lib/client/editInventoryCache";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { InventoryLineWithItem } from "@/lib/inventory";
import { getCategoryLabel, getVariantLabel } from "@/lib/inventory-suggestions";
import EditInventoryItemButton from "./EditInventoryItemButton";
import DeleteInventoryItemButton from "./DeleteInventoryItemButton";
import ViewInventoryItemModal from "./ViewInventoryItemModal";
import ViewInventoryReportModal from "./ViewInventoryReportModal";
import AddInventoryItemModal from "./AddInventoryItemModal";
import AddItemPhotosModal from "./AddItemPhotosModal";

export type ReportForLine = {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  status: string;
  createdAt: Date;
  createdBy: { name: string | null; email: string } | null;
};

interface InventoryListProps {
  lines: InventoryLineWithItem[];
  propertyId: string;
  itemThumbsMap: Map<string, Array<string | null>>;
  reportsByLineId?: Map<string, ReportForLine>;
}

export default function InventoryList({
  lines,
  propertyId,
  itemThumbsMap,
  reportsByLineId = new Map(),
}: InventoryListProps) {
  const [selectedLine, setSelectedLine] = useState<InventoryLineWithItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [initialEditData, setInitialEditData] = useState<EditData | null>(null);
  const [isPhotosModalOpen, setIsPhotosModalOpen] = useState(false);
  const [photosItemId, setPhotosItemId] = useState<string | null>(null);
  const [photosItemName, setPhotosItemName] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportForLine | null>(null);
  const [selectedReportItemName, setSelectedReportItemName] = useState<string>("");

  const handleLineClick = (line: InventoryLineWithItem, e: React.MouseEvent) => {
    // Si el click viene de un botón (editar/eliminar/fotos), no abrir el modal
    // NOTA TÉCNICA: Si se agregan nuevos elementos interactivos en el futuro (links, inputs, etc.),
    // deben usar button o stopPropagation() para evitar que el click se propague al handler de línea.
    const target = e.target as HTMLElement;
    const clickedButton = target.closest("button");
    if (clickedButton) {
      return;
    }
    
    setSelectedLine(line);
    setIsModalOpen(true);
  };

  return (
    <>
      <ListContainer>
        {lines.map((line, index) => {
          const itemThumbs = itemThumbsMap.get(line.item.id) || [null, null, null];
          const firstThumb = itemThumbs[0];

          return (
            <div
              key={line.id}
              onClick={(e) => handleLineClick(line, e)}
              className={`
                flex items-center gap-3
                py-3 px-3 sm:px-4
                ${index !== lines.length - 1 ? "border-b border-neutral-200" : ""}
                hover:bg-neutral-50
                active:opacity-95
                focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-inset
                transition-colors
                cursor-pointer
              `}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleLineClick(line, e as any);
                }
              }}
              aria-label={`${line.item.name} en ${line.area}`}
            >
              <ListThumb src={firstThumb} alt={line.item.name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-medium text-neutral-900">
                    {line.item.name}
                    {line.variantKey && line.variantValue && (
                      <span className="text-neutral-500 font-normal">
                        {" — "}
                        {getVariantLabel(line.variantKey, line.variantValue)}
                      </span>
                    )}
                  </h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotosItemId(line.item.id);
                      setPhotosItemName(line.item.name);
                      setIsPhotosModalOpen(true);
                    }}
                    className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors rounded"
                    aria-label={itemThumbs.some(thumb => thumb !== null) ? "Gestionar fotos" : "Agregar fotos"}
                    title={itemThumbs.some(thumb => thumb !== null) ? "Gestionar fotos" : "Agregar fotos"}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-neutral-500">
                    Cantidad: {line.expectedQty}
                  </p>
                  <span className="text-xs text-neutral-400">·</span>
                  <p className="text-xs text-neutral-500">
                    {getCategoryLabel(line.item.category)}
                  </p>
                  {reportsByLineId.has(line.id) && (
                    <>
                      <span className="text-xs text-neutral-400">·</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReport(reportsByLineId.get(line.id)!);
                          setSelectedReportItemName(line.item.name);
                          setReportModalOpen(true);
                        }}
                        className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium hover:bg-amber-200 transition"
                      >
                        Incidencia reportada
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <EditInventoryItemButton
                  lineId={line.id}
                  propertyId={propertyId}
                />
                <DeleteInventoryItemButton
                  lineId={line.id}
                  propertyId={propertyId}
                  itemName={line.item.name}
                />
              </div>
            </div>
          );
        })}
      </ListContainer>

      {selectedLine && (
        <ViewInventoryItemModal
          line={selectedLine}
          propertyId={propertyId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedLine(null);
          }}
          onEdit={async () => {
            if (!selectedLine) return;
            const cached = editInventoryCache.get(propertyId, selectedLine.id);
            if (cached) {
              setEditLineId(selectedLine.id);
              setInitialEditData(cached);
              setIsEditModalOpen(true);
              return;
            }
            try {
              const data = await editInventoryCache.prefetch(propertyId, selectedLine.id);
              if (data?.line) {
                setEditLineId(selectedLine.id);
                setInitialEditData(data);
                setIsEditModalOpen(true);
              }
            } catch {
              // Silenciar fallo de carga
            }
          }}
        />
      )}

      {isEditModalOpen && editLineId && (
        <AddInventoryItemModal
          propertyId={propertyId}
          lineId={editLineId}
          initialEditData={initialEditData}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditLineId(null);
            setInitialEditData(null);
          }}
          onCacheInvalidate={() =>
            editLineId && editInventoryCache.invalidate(propertyId, editLineId)
          }
        />
      )}

      {isPhotosModalOpen && photosItemId && (
        <AddItemPhotosModal
          isOpen={isPhotosModalOpen}
          itemId={photosItemId}
          itemName={photosItemName || undefined}
          onClose={() => {
            setIsPhotosModalOpen(false);
            setPhotosItemId(null);
            setPhotosItemName(null);
          }}
        />
      )}

      <ViewInventoryReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedReport(null);
          setSelectedReportItemName("");
        }}
        report={selectedReport}
        itemName={selectedReportItemName}
      />
    </>
  );
}

