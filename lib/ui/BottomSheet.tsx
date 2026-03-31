"use client";

import { useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeight?: string;
  zIndex?: string;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = "90vh",
  zIndex = "z-50",
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Controlar ciclo de vida: mounted y animateIn
  useEffect(() => {
    if (isOpen) {
      // Abrir: montar primero, luego animar
      setMounted(true);
      // Usar requestAnimationFrame para asegurar que el navegador pinte el estado inicial
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimateIn(true);
        });
      });
    } else {
      // Cerrar: primero animar hacia fuera, luego desmontar
      setAnimateIn(false);
      // Limpiar timeout anterior si existe
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Esperar a que termine la animación antes de desmontar
      timeoutRef.current = setTimeout(() => {
        setMounted(false);
      }, 300); // Misma duración que la animación
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (mounted) {
      // Prevenir scroll del body cuando el sheet está montado
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [mounted]);

  // Cerrar al hacer click fuera
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Cerrar con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mounted) {
        onClose();
      }
    };

    if (mounted) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end justify-center`}
      onClick={handleOverlayClick}
    >
      {/* Overlay con animación - ligado a animateIn */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        style={{
          opacity: animateIn ? 1 : 0,
          transitionDuration: "300ms",
        }}
      />

      {/* Bottom Sheet - siempre inicia con translateY(100%), luego anima a translateY(0) */}
      <div
        ref={sheetRef}
        className="relative w-full sm:w-[700px] sm:mx-auto bg-white shadow-2xl transform transition-transform ease-out rounded-t-2xl"
        style={{
          maxHeight: isMobile ? maxHeight : "80vh",
          transform: animateIn ? "translateY(0)" : "translateY(100%)",
          transitionDuration: "300ms",
          willChange: "transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar - solo en móvil */}
        {isMobile && (
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-neutral-300 rounded-full" />
          </div>
        )}

        {/* Header */}
        <div className="px-6 pt-6 sm:pt-8 pb-4 border-b border-neutral-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
              {subtitle && (
                <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 transition rounded-full hover:bg-neutral-100"
              aria-label="Cerrar"
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
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight} - 100px)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

