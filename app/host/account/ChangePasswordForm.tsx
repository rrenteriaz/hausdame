"use client";

import { useState, useRef } from "react";
import { changePasswordAction } from "./actions";

export default function ChangePasswordForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(formRef.current!);

    const newPw = formData.get("newPassword") as string;
    const confirmPw = formData.get("confirmPassword") as string;
    if (newPw !== confirmPw) {
      setStatus("error");
      setErrorMsg("Las contraseñas no coinciden");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    const result = await changePasswordAction(formData);

    if (result.success) {
      setStatus("success");
      formRef.current?.reset();
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Error al cambiar contraseña");
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Nueva contraseña
        </label>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          onChange={() => setStatus("idle")}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
        />
        <p className="text-xs text-neutral-400 mt-1">Mínimo 8 caracteres.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Confirmar nueva contraseña
        </label>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          onChange={() => setStatus("idle")}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
        />
      </div>

      {status === "success" && (
        <p className="text-sm text-emerald-600 font-medium">
          Contraseña actualizada correctamente.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl bg-black text-white py-2.5 text-base font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {status === "loading" ? "Actualizando..." : "Cambiar contraseña"}
      </button>
    </form>
  );
}
