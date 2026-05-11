// app/host/menu/page.tsx
import Link from "next/link";
import { requireHostUser } from "@/lib/auth/requireUser";
import { getOrCreateDefaultOwner } from "@/lib/users";
import PageContainer from "@/lib/ui/PageContainer";
import PageHeader from "@/lib/ui/PageHeader";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";

interface MenuItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export default async function MenuPage() {
  // Construir hrefs con returnTo para que las páginas destino puedan volver
  const returnTo = "/host/menu";
  
  // Obtener información del usuario actual
  const user = await requireHostUser();
  let userName = "Usuario";
  let userEmail = "usuario@ejemplo.com";
  
  if (user.tenantId) {
    try {
      const owner = await getOrCreateDefaultOwner(user.tenantId);
      userName = owner.name || owner.email.split("@")[0] || "Usuario";
      userEmail = owner.email;
    } catch (error) {
      // Si falla, usar valores por defecto
    }
  }
  
  const userInitial = userName.charAt(0).toUpperCase();
  
  const menuItems: MenuItem[] = [
    {
      href: "/host/properties",
      label: "Propiedades",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      href: "/host/workgroups",
      label: "Grupos de trabajo",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      href: "/host/inventory",
      label: "Inventario",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      href: "/host/tareas-pro",
      label: "Tareas",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      href: "/host/catalog/variant-groups",
      label: "Grupos de variantes",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
    },
    {
      href: "/host/locks",
      label: "Cerraduras",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
    },
    {
      href: "/host/settings",
      label: "Ajustes",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];


  return (
    <PageContainer spacing="none">
      {/* Header sin botón back en móvil */}
      <div className="sm:hidden">
        <PageHeader title="Menú" showBack={false} />
      </div>
      <div className="hidden sm:block">
        <PageHeader title="Menú" showBack backHref="/host/hoy" />
      </div>

      <div className="mt-4 space-y-6">
        {/* Tarjeta de Perfil (solo móvil) */}
        <div className="sm:hidden">
          <Link
            href={`/host/account?returnTo=${encodeURIComponent(returnTo)}`}
            className="block rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="h-14 w-14 rounded-full bg-neutral-900 text-white flex items-center justify-center text-lg font-semibold shrink-0">
                {userInitial}
              </div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-neutral-900 truncate">
                  {userName}
                </h3>
                <p className="text-sm text-neutral-600 truncate mt-0.5">
                  {userEmail}
                </p>
              </div>
              {/* Chevron */}
              <svg
                className="w-5 h-5 text-neutral-400 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>
        </div>

        {/* Lista de opciones del menú (sin tarjetas, sin separadores, sin bordes) */}
        <div className="space-y-1">
          {menuItems.map((item, index) => {
            const itemHref = `${item.href}?returnTo=${encodeURIComponent(returnTo)}`;
            
            return (
              <ListRow
                key={`${item.label}-${index}`}
                href={itemHref}
                isLast={true}
                className="border-b-0 py-3.5 rounded-lg"
                ariaLabel={item.label}
              >
                {/* Ícono */}
                <div className="text-neutral-600 shrink-0">
                  {item.icon}
                </div>
                {/* Label */}
                <div className="min-w-0 flex-1">
                  <span className="text-base font-medium text-neutral-900">
                    {item.label}
                  </span>
                </div>
                {/* Chevron */}
                <svg
                  className="w-5 h-5 text-neutral-400 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </ListRow>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}

