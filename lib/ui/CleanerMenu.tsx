"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { broadcastLogout } from "@/lib/auth/logoutBroadcast";
import BottomSheet from "./BottomSheet";

interface CleanerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: { email: string; nickname: string | null; fullName: string | null };
}

export default function CleanerMenu({ isOpen, onClose, user }: CleanerMenuProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detectar si es móvil
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Controlar ciclo de vida (mounted/animateIn)
  const [animateIn, setAnimateIn] = useState(false);
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

  const displayName = (user.nickname || user.fullName || user.email).trim();
  const secondaryText = user.nickname
    ? (user.fullName || user.email)
    : user.fullName
    ? user.email
    : user.email;
  const initial = (displayName || "U").charAt(0).toUpperCase();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        broadcastLogout();
        router.replace("/login");
        return;
      }

      let data: any = {};
      try {
        const text = await res.text();
        if (text.trim()) {
          data = JSON.parse(text);
        }
      } catch (parseError) {
        console.warn("[Logout] Error parseando respuesta:", parseError);
        broadcastLogout();
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        console.error("[Logout] Error:", data.error);
        setIsLoggingOut(false);
        return;
      }

      broadcastLogout();
      router.replace("/login");
    } catch (err) {
      console.error("[Logout] Error:", err);
      setIsLoggingOut(false);
    }
  };

  // En móvil, usar BottomSheet
  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title="Menú">
        <div className="px-4 pb-4 space-y-1">
          <button
            type="button"
            onClick={() => handleMenuNav("/cleaner/profile")}
            className="w-full rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 hover:bg-neutral-50 transition text-left"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-neutral-900 text-white flex items-center justify-center text-lg font-semibold shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-neutral-900 truncate">{displayName}</p>
                <p className="text-sm text-neutral-600 truncate mt-0.5">{secondaryText}</p>
              </div>
              <svg className="w-5 h-5 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleMenuNav("/cleaner/teams")}
            className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
          >
            Equipos
          </button>
          <div className="border-t border-neutral-200 my-2" />
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full px-4 py-3 text-left text-base text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
          </button>
        </div>
      </BottomSheet>
    );
  }

  // En desktop, usar Drawer lateral
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
              onClick={() => handleMenuNav("/cleaner/profile")}
              className="w-full rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 hover:bg-neutral-50 transition text-left mb-2"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-neutral-900 text-white flex items-center justify-center text-lg font-semibold shrink-0">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-neutral-900 truncate">{displayName}</p>
                  <p className="text-sm text-neutral-600 truncate mt-0.5">{secondaryText}</p>
                </div>
                <svg className="w-5 h-5 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleMenuNav("/cleaner/teams")}
              className="w-full px-4 py-3 text-left text-base text-neutral-900 hover:bg-neutral-50 rounded-lg transition"
            >
              Equipos
            </button>
            <div className="border-t border-neutral-200 my-2" />
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full px-4 py-3 text-left text-base text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

