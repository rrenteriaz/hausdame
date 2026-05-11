// app/host/settings/page.tsx
import Page from "@/lib/ui/Page";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";
import PWAInstallSection from "@/components/pwa/PWAInstallSection";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const returnTo = safeReturnTo(params?.returnTo, "/host/menu");

  return (
    <Page title="Ajustes" showBack backHref={returnTo}>
      <div className="space-y-4">
        <PWAInstallSection />

        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">
            Ajustes (próximamente)
          </h2>
          <p className="text-base text-neutral-600">
            Aquí podrás configurar las preferencias de tu cuenta.
          </p>
        </div>
      </div>
    </Page>
  );
}

