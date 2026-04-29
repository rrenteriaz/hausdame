"use client";

/**
 * Wrapper client-side mínimo que aplica el scroll inicial al mes enfocado
 * y persiste la posición de scroll en sessionStorage para restaurarla al
 * volver desde el detalle de una reserva.
 */

import { useRef, useLayoutEffect, type ReactNode } from "react";

const STORAGE_KEY = "res-timeline-scroll-v1";

interface StoredScroll {
  x: number;
  /** scrollToOffsetPx activo cuando se guardó; permite detectar cambios de mes */
  base: number;
}

interface Props {
  children: ReactNode;
  /** Píxeles a scrollear horizontalmente al primer montaje (mes enfocado al borde izq). */
  scrollToOffsetPx: number;
}

export default function TimelineScrollContainer({
  children,
  scrollToOffsetPx,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Intentar restaurar posición guardada.
    // Solo se aplica si el `base` coincide con el offset del mes enfocado actual
    // (mismo URL de mes) — si el host cambió de mes, se ignora y se usa el nuevo offset.
    let restored = false;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored: StoredScroll = JSON.parse(raw);
        if (stored.base === scrollToOffsetPx && stored.x >= 0) {
          el.scrollLeft = stored.x;
          restored = true;
        }
      }
    } catch {
      // sessionStorage no disponible o datos corruptos
    }

    if (!restored && scrollToOffsetPx > 0) {
      el.scrollLeft = scrollToOffsetPx;
    }

    // Guardar posición en cada scroll (via rAF para no bloquear)
    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try {
          const stored: StoredScroll = { x: el.scrollLeft, base: scrollToOffsetPx };
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch {
          // ignorar fallos de escritura
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      className="overflow-x-auto overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-sm"
      style={{ WebkitOverflowScrolling: "touch", maxHeight: "calc(100vh - 220px)" }}
    >
      {children}
    </div>
  );
}
