// app/cleaner/onboarding/page.tsx
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import Page from "@/lib/ui/Page";

export default async function CleanerOnboardingPage() {
  const user = await getCurrentUser();

  // Si no hay user, redirigir a login (el middleware ya debería haberlo manejado)
  if (!user || user.role !== "CLEANER") {
    redirect("/login");
  }

  return (
    <Page
      title="Completa tu registro"
      containerClassName="pt-6"
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-xl font-bold text-neutral-800 mb-3">
            Bienvenido a Hausdame
          </h2>
          <p className="text-base text-neutral-700 mb-4">
            Para ver y gestionar limpiezas necesitas unirte a un equipo de trabajo.
            Un Host debe enviarte una invitación para que puedas acceder a las limpiezas disponibles de sus propiedades.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/cleaner/marketplace"
            className="block w-full rounded-xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-medium text-neutral-900">
                  Explorar marketplace
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Busca oportunidades de trabajo disponibles
                </p>
              </div>
              <span className="text-neutral-400">→</span>
            </div>
          </Link>

          <Link
            href="/cleaner/profile"
            className="block w-full rounded-xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-medium text-neutral-900">
                  Editar perfil
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Completa tu información personal
                </p>
              </div>
              <span className="text-neutral-400">→</span>
            </div>
          </Link>
        </div>
      </div>
    </Page>
  );
}

