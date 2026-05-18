"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

type EmptyStateWithGuideProps = {
  storageKey: string;
  title: string;
  description: string;
  children: ReactNode;
  fallbackAction?: ReactNode;
};

export default function EmptyStateWithGuide({
  storageKey,
  title,
  description,
  children,
  fallbackAction,
}: EmptyStateWithGuideProps) {
  const dismissed = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("hausdame:onboarding-storage", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("hausdame:onboarding-storage", onStoreChange);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );

  function dismissGuide() {
    try {
      window.localStorage.setItem(storageKey, "1");
      window.dispatchEvent(new Event("hausdame:onboarding-storage"));
    } catch {
      // localStorage can be unavailable in private or restricted contexts.
    }
  }

  if (dismissed) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-center">
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-neutral-600">
          {description}
        </p>
        {fallbackAction && <div className="mt-4 flex justify-center">{fallbackAction}</div>}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={dismissGuide}
          className="min-h-[36px] shrink-0 rounded-lg px-3 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
          aria-label="Ocultar guía de inicio"
        >
          Omitir
        </button>
      </div>
      {children}
    </section>
  );
}
