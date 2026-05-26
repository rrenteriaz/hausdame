"use client";

// lib/ui/MobileHeaderContext.tsx
// Permite que PageHeader inyecte el título de la página
// en la barra superior móvil del layout (Host / Cleaner).

import { createContext, useContext, useState, useCallback } from "react";

type Breakpoint = "sm" | "lg";

type MobileHeaderContextType = {
  title: string | null;
  setTitle: (title: string | null) => void;
  backHref: string | null;
  setBackHref: (href: string | null) => void;
  /** Breakpoint a partir del cual el header desktop toma el relevo.
   *  "sm" = Cleaner (640px+), "lg" = Host (1024px+). */
  breakpoint: Breakpoint;
  hasProvider: boolean;
};

const MobileHeaderContext = createContext<MobileHeaderContextType>({
  title: null,
  setTitle: () => {},
  backHref: null,
  setBackHref: () => {},
  breakpoint: "sm",
  hasProvider: false,
});

export function MobileHeaderProvider({
  children,
  breakpoint = "sm",
}: {
  children: React.ReactNode;
  breakpoint?: Breakpoint;
}) {
  const [title, setTitleState] = useState<string | null>(null);
  const [backHref, setBackHrefState] = useState<string | null>(null);
  const setTitle = useCallback((t: string | null) => setTitleState(t), []);
  const setBackHref = useCallback((href: string | null) => setBackHrefState(href), []);

  return (
    <MobileHeaderContext.Provider value={{ title, setTitle, backHref, setBackHref, breakpoint, hasProvider: true }}>
      {children}
    </MobileHeaderContext.Provider>
  );
}

export function useMobileHeader() {
  return useContext(MobileHeaderContext);
}
