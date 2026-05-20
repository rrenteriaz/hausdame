import Link from "next/link";

type CleanerEmptyStateVariant =
  | "waiting-invitation"
  | "connected-no-properties"
  | "no-cleanings-today"
  | "joined";

const copyByVariant: Record<
  CleanerEmptyStateVariant,
  {
    eyebrow: string;
    title: string;
    description: string;
    secondary?: string;
    href?: string;
    cta?: string;
  }
> = {
  "waiting-invitation": {
    eyebrow: "Esperando invitación",
    title: "Aún no estás conectado a un Host",
    description:
      "Pídele al Host que te envíe un enlace de invitación. Cuando lo aceptes, verás aquí tus propiedades y limpiezas.",
    secondary:
      "Si ya tienes un enlace, ábrelo desde el mensaje que recibiste para conectar tu cuenta.",
    href: "/cleaner/profile",
    cta: "Editar perfil",
  },
  "connected-no-properties": {
    eyebrow: "Conexión pendiente",
    title: "Tu equipo ya existe, pero aún no tiene propiedades",
    description:
      "Cuando el Host asigne propiedades a tu equipo, las limpiezas disponibles aparecerán en tu panel.",
    secondary: "No necesitas hacer nada más por ahora.",
    href: "/cleaner/teams",
    cta: "Ver equipos",
  },
  "no-cleanings-today": {
    eyebrow: "Hoy",
    title: "No tienes limpiezas para hoy",
    description:
      "Tus propiedades ya están conectadas. Revisa próximas limpiezas o espera nuevas asignaciones del Host.",
    href: "/cleaner/cleanings/all?scope=upcoming",
    cta: "Ver próximas",
  },
  joined: {
    eyebrow: "Invitación aceptada",
    title: "Ya estás conectado al grupo de trabajo",
    description:
      "Cuando el Host publique o asigne limpiezas, aparecerán en tu panel de Cleaner.",
    href: "/cleaner",
    cta: "Ir a Hoy",
  },
};

export default function CleanerEmptyStateCard({
  variant,
  className = "",
}: {
  variant: CleanerEmptyStateVariant;
  className?: string;
}) {
  const copy = copyByVariant[variant];

  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {copy.eyebrow}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-neutral-950">{copy.title}</h2>
      <p className="mt-2 text-base leading-relaxed text-neutral-600">
        {copy.description}
      </p>
      {copy.secondary && (
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          {copy.secondary}
        </p>
      )}
      {copy.href && copy.cta && (
        <div className="mt-5">
          <Link
            href={copy.href}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 py-2.5 text-base font-medium text-white transition hover:bg-neutral-800 sm:w-auto"
          >
            {copy.cta}
          </Link>
        </div>
      )}
    </div>
  );
}
