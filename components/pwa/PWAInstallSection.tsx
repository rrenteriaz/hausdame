'use client';

import { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * Sección "Instalar Hausdame" para páginas de Ajustes/Perfil.
 *
 * - standalone  → no se muestra (ya instalada).
 * - android     → botón que dispara el prompt nativo.
 * - ios         → botón que abre modal con instrucciones manuales.
 * - unsupported → mensaje informativo.
 * - loading     → no renderiza nada (evita flicker de hidratación).
 */
export default function PWAInstallSection() {
  const { status, triggerInstall } = usePWAInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Ocultar completamente si ya está instalada o aún cargando
  if (status === 'loading' || status === 'standalone') return null;

  const handleAndroidInstall = async () => {
    setInstalling(true);
    await triggerInstall();
    setInstalling(false);
  };

  return (
    <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">Instalar Hausdame</p>
            <p className="text-xs text-neutral-500 mt-0.5 leading-snug">
              Agrega Hausdame a tu pantalla de inicio y úsala como app.
            </p>
          </div>

          {status === 'android' && (
            <button
              type="button"
              onClick={handleAndroidInstall}
              disabled={installing}
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-50"
            >
              {installing ? 'Instalando…' : 'Instalar'}
            </button>
          )}

          {status === 'ios' && (
            <button
              type="button"
              onClick={() => setIosModalOpen(true)}
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:scale-[0.98] transition"
            >
              Instalar
            </button>
          )}

          {status === 'unsupported' && (
            <span className="shrink-0 text-xs text-neutral-400">No disponible</span>
          )}
        </div>

        {status === 'unsupported' && (
          <p className="mt-2 text-xs text-neutral-400 leading-snug">
            Tu navegador no permite instalar la app desde este botón. Puedes agregarla desde el menú del navegador.
          </p>
        )}
      </section>

      {/* Modal instrucciones iOS */}
      {iosModalOpen && (
        <IOSInstallModal onClose={() => setIosModalOpen(false)} />
      )}
    </>
  );
}

function IOSInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[61] flex items-end justify-center p-4 sm:items-center">
        <div
          className="w-full max-w-sm rounded-2xl bg-white p-6 space-y-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Instrucciones para instalar en iPhone"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-neutral-900">Instalar en iPhone</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1 text-neutral-400 hover:text-neutral-700 transition rounded-full hover:bg-neutral-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Pasos */}
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
              <p className="text-sm text-neutral-700 pt-0.5">
                En Safari, toca el botón{' '}
                <strong className="text-neutral-900">Compartir</strong>{' '}
                <ShareIcon />{' '}en la barra inferior.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
              <p className="text-sm text-neutral-700 pt-0.5">
                Desplázate hacia abajo y toca{' '}
                <strong className="text-neutral-900">Agregar a pantalla de inicio</strong>.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
              <p className="text-sm text-neutral-700 pt-0.5">
                Confirma tocando <strong className="text-neutral-900">Agregar</strong>.
              </p>
            </li>
          </ol>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </>
  );
}

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className="inline-block align-middle"
      aria-hidden="true"
    >
      <path
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
