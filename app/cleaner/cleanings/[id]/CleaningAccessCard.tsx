"use client";

// app/cleaner/cleanings/[id]/CleaningAccessCard.tsx
import { useState } from "react";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencioso — el valor sigue siendo legible en pantalla
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 text-xs px-2.5 py-1 rounded-md border transition font-medium ${
        copied
          ? "border-green-300 bg-green-50 text-green-700"
          : "border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
      }`}
    >
      {copied ? "✓ Copiado" : "Copiar"}
    </button>
  );
}

function AccessField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-neutral-900 flex-1 break-all">{value}</p>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

interface CleaningAccessCardProps {
  wifiSsid?: string | null;
  wifiPassword?: string | null;
  accessCode?: string | null;
}

export default function CleaningAccessCard({
  wifiSsid,
  wifiPassword,
  accessCode,
}: CleaningAccessCardProps) {
  if (!wifiSsid && !wifiPassword && !accessCode) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-700 mb-3">
        Accesos rápidos
      </p>
      <div className="space-y-3">
        {wifiSsid && <AccessField label="Red Wi-Fi" value={wifiSsid} />}
        {wifiPassword && <AccessField label="Contraseña Wi-Fi" value={wifiPassword} />}
        {accessCode && <AccessField label="Clave de acceso" value={accessCode} />}
      </div>
    </section>
  );
}
