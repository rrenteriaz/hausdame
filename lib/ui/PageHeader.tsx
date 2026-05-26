"use client";

import { useEffect } from "react";
import BackChevron from "./BackChevron";
import { useMobileHeader } from "./MobileHeaderContext";

interface PageHeaderProps {
  title: React.ReactNode;
  /** Texto alternativo para la barra superior móvil cuando title es un nodo JSX. */
  mobileTitle?: string;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  backHref?: string;
  rightActions?: React.ReactNode;
  className?: string;
  variant?: "default" | "compact";
}

export default function PageHeader({
  title,
  mobileTitle,
  subtitle,
  showBack = false,
  backHref,
  rightActions,
  className = "",
  variant = "default",
}: PageHeaderProps) {
  const { setTitle, setBackHref, hasProvider, breakpoint } = useMobileHeader();

  // Inyectar el título en la barra superior móvil del layout.
  // Prioridad: mobileTitle (string explícito) > title si es string > null.
  useEffect(() => {
    if (!hasProvider) return;
    const resolved = mobileTitle ?? (typeof title === "string" ? title : null);
    setTitle(resolved);
    return () => setTitle(null);
  }, [title, mobileTitle, setTitle, hasProvider]);

  // Inyectar backHref para que la barra móvil muestre el botón volver.
  useEffect(() => {
    if (!hasProvider) return;
    setBackHref(showBack ? (backHref ?? null) : null);
    return () => setBackHref(null);
  }, [showBack, backHref, setBackHref, hasProvider]);

  const titleSize = variant === "compact" ? "text-xl" : "text-2xl";
  const subtitleMargin = variant === "compact" ? "mt-1" : "mt-2";
  const spacingClass = variant === "compact" ? "space-y-1" : "space-y-2";

  // En mobile, el título se muestra en la barra superior del layout.
  // Ocultarlo aquí evita duplicarlo. El breakpoint depende del layout
  // (Host: lg, Cleaner: sm).
  const titleHideOnMobile = hasProvider
    ? breakpoint === "lg"
      ? "hidden lg:block"
      : "hidden sm:block"
    : "";

  return (
    <header className={`${spacingClass} ${className}`}>
      {/* Fila 1: Título y acciones */}
      <div className="flex items-start justify-between gap-3">
        {/* Izquierda: BackChevron + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showBack && (
            <div className={`shrink-0 -ml-2 ${titleHideOnMobile}`}>
              <BackChevron href={backHref} />
            </div>
          )}
          <h1 className={`${titleSize} font-semibold tracking-tight text-neutral-900 min-w-0 truncate ${titleHideOnMobile}`}>
            {title}
          </h1>
        </div>

        {/* Derecha: Acciones */}
        {rightActions && (
          <div className="shrink-0">
            {rightActions}
          </div>
        )}
      </div>

      {/* Fila 2: Subtítulo */}
      {subtitle && (
        <div className={subtitleMargin}>
          {typeof subtitle === "string" ? (
            <p className="text-base text-neutral-600 leading-relaxed">
              {subtitle}
            </p>
          ) : (
            <div className="text-base text-neutral-600 leading-relaxed">
              {subtitle}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
