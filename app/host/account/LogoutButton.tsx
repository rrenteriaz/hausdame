"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { broadcastLogout } from "@/lib/auth/logoutBroadcast";

export default function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        broadcastLogout();
        router.replace("/login");
        return;
      }

      let data: any = {};
      try {
        const text = await res.text();
        if (text.trim()) data = JSON.parse(text);
      } catch {
        broadcastLogout();
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Error cerrando sesión");
        setIsLoggingOut(false);
        return;
      }

      broadcastLogout();
      router.replace("/login");
    } catch (err) {
      console.error("[Logout] Error:", err);
      setError("Error de conexión");
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="w-full text-left text-base text-red-600 hover:text-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </>
  );
}
