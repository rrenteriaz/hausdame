"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: { email: string; nickname: string | null };
}

export default function MenuDrawer({ isOpen, onClose, user }: MenuDrawerProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Controlar ciclo de vida (mounted/animateIn)
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimateIn(true);
        });
      });
    } else {
      setAnimateIn(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setMounted(false);
      }, 300);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  // Cerrar al hacer click fuera
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleMenuNav = (href: string) => {
    router.push(href);
    onClose();
  };

  const displayName = (user.nickname || user.email).trim();
  const secondaryText = user.nickname ? user.email : "";
  const initial = (displayName || "U").charAt(0).toUpperCase();

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={handleOverlayClick}
        style={{
          opacity: animateIn ? 1 : 0,
          transitionDuration: "300ms",
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="relative w-1/3 h-full bg-white shadow-2xl transform transition-transform ease-out rounded-tl-2xl rounded-bl-2xl"
        style={{
          transform: animateIn ? "translateX(0)" : "translateX(100%)",
          transitionDuration: "300ms",
          willChange: "transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-xl font-semibold text-neutral-900">Menú</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 transition rounded-full hover:bg-neutral-100"
            aria-label="Cerrar menú"
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

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-73px)]">
          <div className="px-6 py-4 space-y-1">
            <button
              type="button"
              onClick={() => handleMenuNav("/host/account")}
              className="w-full rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 hover:bg-neutral-50 transition text-left mb-2"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-neutral-900 text-white flex items-center justify-center text-lg font-semibold shrink-0">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-neutral-900 truncate">
                    {displayName}
                  </p>
                  {secondaryText ? (
                    <p className="text-sm text-neutral-600 truncate mt-0.5">{secondaryText}</p>
                  ) : null}
                </div>
                <svg
                  className="w-5 h-5 text-neutral-400 shrink-0"
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
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleMenuNav("/host/properties")}
              className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
            >
              Propiedades
            </button>
            <button
              type="button"
              onClick={() => handleMenuNav("/host/workgroups")}
              className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
            >
              Grupos de trabajo
            </button>
            <button
              type="button"
              onClick={() => handleMenuNav("/host/inventory")}
              className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
            >
              Inventario
            </button>
            <button
              type="button"
              onClick={() => handleMenuNav("/host/tareas-pro")}
              className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
            >
              Tareas
            </button>
            <button
              type="button"
              onClick={() => handleMenuNav("/host/locks")}
              className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
            >
              Cerraduras
            </button>
            <button
              type="button"
              onClick={() => handleMenuNav("/host/settings")}
              className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
            >
              Ajustes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

