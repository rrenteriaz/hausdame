"use client";

import { ReactNode } from "react";
import PageContainer from "./PageContainer";
import PageHeader from "./PageHeader";

interface PageHeaderProps {
  title: React.ReactNode;
  mobileTitle?: string;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  backHref?: string;
  rightActions?: React.ReactNode;
  variant?: "default" | "compact";
}

interface PageProps extends PageHeaderProps {
  children: ReactNode;
  containerClassName?: string;
  containerSize?: "default" | "wide" | "full";
  containerSpacing?: "none" | "default" | "compact";
  containerAs?: "main" | "div";
  contentSpacing?: "default" | "compact";
}

/**
 * Componente compuesto que combina PageContainer y PageHeader.
 * 
 * Proporciona una API unificada para crear páginas consistentes:
 * - PageContainer con padding y max-width configurable
 * - PageHeader con título, subtítulo, botón volver, acciones
 * - Espaciado consistente entre header y contenido
 * 
 * Uso recomendado para la mayoría de páginas.
 * Para layouts especiales, usar PageContainer y PageHeader por separado.
 */
export default function Page({
  children,
  containerClassName = "",
  containerSize = "default",
  containerSpacing = "none",
  containerAs = "div",
  contentSpacing = "default",
  // PageHeader props
  title,
  mobileTitle,
  subtitle,
  showBack = false,
  backHref,
  rightActions,
  variant = "default",
}: PageProps) {
  // Espaciado entre PageHeader y contenido
  const contentMarginTop = contentSpacing === "compact" ? "mt-3" : "mt-4";

  return (
    <PageContainer
      className={containerClassName}
      size={containerSize}
      spacing={containerSpacing}
      as={containerAs}
    >
      {/* PageHeader */}
      {title && (
        <PageHeader
          title={title}
          mobileTitle={mobileTitle}
          subtitle={subtitle}
          showBack={showBack}
          backHref={backHref}
          rightActions={rightActions}
          variant={variant}
        />
      )}

      {/* Contenido con espaciado consistente */}
      <div className={contentMarginTop}>
        {children}
      </div>
    </PageContainer>
  );
}

