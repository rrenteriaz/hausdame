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
            Aún no estás conectado a un Host
          </h1>
          <p className="text-neutral-700 mb-4">
            Pídele al Host que te envíe un enlace de invitación. Cuando lo aceptes,
            verás aquí tus propiedades y limpiezas.
          </p>
          <p className="text-neutral-600 text-sm mb-6">
            Si ya tienes un enlace, ábrelo desde el mensaje que recibiste para conectar tu cuenta.
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

