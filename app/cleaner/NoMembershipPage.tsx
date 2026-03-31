// app/cleaner/NoMembershipPage.tsx
// Contrato canónico: docs/contracts/CLEANER_EMPTY_STATES_V1.md
"use client";

import Link from "next/link";

export default function NoMembershipPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-neutral-800 mb-4">
            ¡Bienvenido a Hausdame!
          </h1>
          <p className="text-neutral-700 mb-4">
            Para empezar a ver y aceptar limpiezas, necesitas unirte a un equipo de trabajo.
            Un Host debe enviarte una invitación para que puedas acceder a las limpiezas disponibles de sus propiedades.
          </p>
          <p className="text-neutral-600 text-sm mb-6">
            Cuando aceptes una invitación, las limpiezas se mostrarán en tu calendario.
            Mientras tanto, puedes explorar la plataforma y familiarizarte con el flujo de trabajo.
          </p>
          <div>
            <Link
              href="/cleaner"
              className="inline-block w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Entendido
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

