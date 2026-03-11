// app/login/LoginClient.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  validateRedirect,
  AUTH_REDIRECT_PREFIXES,
} from "@/lib/auth/validateRedirect";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const safeRedirectParam = validateRedirect(redirectParam, [
    ...AUTH_REDIRECT_PREFIXES,
  ]);
  
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          identifier, 
          password,
          redirect: redirectParam || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error en el login");
        setLoading(false);
        return;
      }

      // Usar SOLO data.redirectTo (validado por el API). No usar redirectParam para navegar.
      let redirectTo = data.redirectTo || "/host/hoy";
      if (redirectTo.startsWith("/join/host")) {
        const url = new URL(redirectTo, window.location.origin);
        url.searchParams.set("auto", "1");
        redirectTo = url.pathname + url.search;
      }
      router.replace(redirectTo);
    } catch (err) {
      setError("Error de conexión");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-8">
          <div className="flex flex-col items-center gap-2 mb-6">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/hausdame_SinFondo2.png" alt="Hausdame" width={180} height={160} className="object-contain" />
            </Link>
            <h1 className="text-2xl font-bold text-center">Iniciar sesión</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-neutral-700 mb-1">
                Email o teléfono
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="usuario@ejemplo.com"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 pr-10 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 focus:outline-none focus:text-neutral-700"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </button>
          </form>

          {safeRedirectParam ? (
            <>
              <div className="mt-4 text-center text-sm text-neutral-500">
                <p>¿No tienes cuenta?</p>
              </div>
              <div className="mt-4">
                <Link
                  href={`/signup?redirect=${encodeURIComponent(safeRedirectParam)}`}
                  className="block w-full py-2 px-4 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 text-center font-medium"
                >
                  Crear cuenta
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-4 text-center text-sm text-neutral-500">
              <p>
                ¿No tienes cuenta?{" "}
                <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
                  Crear cuenta
                </Link>
              </p>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-neutral-500">
            <p>¿Necesitas ayuda? Contacta al administrador</p>
          </div>
        </div>
      </div>
    </div>
  );
}

