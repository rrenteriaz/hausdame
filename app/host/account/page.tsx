// app/host/account/page.tsx
import { requireHostUser } from "@/lib/auth/requireUser";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";
import Page from "@/lib/ui/Page";
import ProfileForm from "./ProfileForm";
import ChangePasswordForm from "./ChangePasswordForm";
import LogoutButton from "./LogoutButton";

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const resolvedParams = searchParams ? await searchParams : {};
  const returnTo = safeReturnTo(resolvedParams.returnTo, "/host/menu");

  return (
    <Page title="Perfil" showBack backHref={returnTo}>
      <div className="space-y-4">
        {/* Información personal */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">
            Información personal
          </h2>
          <ProfileForm initialName={user.name ?? ""} email={user.email} />
        </section>

        {/* Seguridad */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">
            Seguridad
          </h2>
          <ChangePasswordForm />
        </section>

        {/* Cerrar sesión */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <LogoutButton />
        </section>
      </div>
    </Page>
  );
}
