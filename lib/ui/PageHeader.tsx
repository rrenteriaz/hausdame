"use client";

import { useEffect } from "react";
import BackChevron from "./BackChevron";
import { useMobileHeader } from "./MobileHeaderContext";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  backHref?: string;
  rightActions?: React.ReactNode;
  className?: string;
  variant?: "default" | "compact";
}

export default function PageHeader({
  title,
  subtitle,
  showBack = false,
  backHref,
  rightActions,
  className = "",
  variant = "default",
}: PageHeaderProps) {
  const { setTitle, hasProvider, breakpoint } = useMobileHeader();

  // Inyectar el título en la barra superior móvil del layout.
  // Solo si hay provider activo y el título es un string.
  useEffect(() => {
    if (!hasProvider) return;
    setTitle(typeof title === "string" ? title : null);
    return () => setTitle(null);
  }, [title, setTitle, hasProvider]);

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
            <div className="shrink-0 -ml-2">
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
