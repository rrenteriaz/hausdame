"use client";

import React from "react";

interface SubmitConfirmButtonProps {
  children: React.ReactNode;
  className?: string;
  confirmMessage?: string;
}

/**
 * Un botón de submit que pide confirmación nativa antes de proceder.
 * Diseñado para ser usado dentro de Server Components sin romper la serialización,
 * ya que encapsula el manejador de eventos en este componente cliente.
 */
export function SubmitConfirmButton({
  children,
  className,
  confirmMessage = "¿Estás seguro?",
}: SubmitConfirmButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(confirmMessage)) {
      e.preventDefault();
    }
  };

  return (
    <button type="submit" className={className} onClick={handleClick}>
      {children}
    </button>
  );
}
