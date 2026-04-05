"use client";

import { useState, useRef } from "react";
import { updateProfileAction } from "./actions";

export default function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const formData = new FormData(formRef.current!);
    const result = await updateProfileAction(formData);

    if (result.success) {
      setStatus("success");
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Error al guardar");
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Nombre
        </label>
        <input
          name="name"
          defaultValue={initialName}
          placeholder="Tu nombre"
          onChange={() => setStatus("idle")}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Correo electrónico
        </label>
        <input
          value={email}
          readOnly
          className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-base bg-neutral-50 text-neutral-500 cursor-not-allowed"
        />
        <p className="text-xs text-neutral-400 mt-1">
          El correo no se puede cambiar en este momento.
        </p>
      </div>

      {status === "success" && (
        <p className="text-sm text-emerald-600 font-medium">
          Cambios guardados correctamente.
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
        {status === "loading" ? "Guardando..." : "Guardar cambios"}
      </button>
    </form>
  );
}
