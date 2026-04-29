// lib/ui/ListThumb.tsx
import Image from "next/image";

interface ListThumbProps {
  src?: string | null;
  alt?: string;
  size?: number;
}

/**
 * Thumbnail para listas row.
 * Muestra imagen si existe, o fallback con ícono Hausdame.
 */
export default function ListThumb({ src, alt = "", size = 56 }: ListThumbProps) {
  const fallbackSize = size;

  if (src) {
    return (
      <div
        className="shrink-0 rounded-md overflow-hidden bg-neutral-100"
        style={{ width: size, height: size }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Fallback: ícono Hausdame (H en círculo)
  return (
    <div
      className="shrink-0 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-400"
      style={{ width: fallbackSize, height: fallbackSize }}
      aria-hidden="true"
    >
      <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center">
        <span className="text-xs font-semibold text-neutral-500">H</span>
      </div>
    </div>
  );
}

