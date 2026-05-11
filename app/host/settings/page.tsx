// app/host/settings/page.tsx
import Link from "next/link";
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

        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide px-1 pb-1">
            Catálogo
          </p>
          <Link
            href="/host/catalog/variant-groups"
            className="flex items-center justify-between px-4 py-3.5 bg-white rounded-xl border border-neutral-200 hover:bg-neutral-50 transition"
          >
            <span className="text-sm font-medium text-neutral-900">Grupos de variantes</span>
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </Page>
  );
}

