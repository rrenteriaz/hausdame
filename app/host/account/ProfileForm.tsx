"use client";

import { useState } from "react";
import { updateProfileAction } from "./actions";

// Divide un nombre completo en sus tres partes de forma heurística.
// Ej: "Juan García López" → ["Juan", "García", "López"]
function splitFullName(full: string): { nombre: string; paterno: string; materno: string } {
  const parts = full.trim().split(/\s+/);
  return {
    nombre: parts[0] ?? "",
    paterno: parts[1] ?? "",
    materno: parts.slice(2).join(" "),
  };
}

export default function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [modalOpen, setModalOpen] = useState(false);
  const [nombre, setNombre] = useState(() => splitFullName(initialName).nombre);
  const [paterno, setPaterno] = useState(() => splitFullName(initialName).paterno);
  const [materno, setMaterno] = useState(() => splitFullName(initialName).materno);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const openModal = () => {
    // Re-sincronizar campos con el nombre actual al abrir
    const parts = splitFullName(displayName);
    setNombre(parts.nombre);
    setPaterno(parts.paterno);
    setMaterno(parts.materno);
    setStatus("idle");
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    const trimNombre = nombre.trim();
    if (!trimNombre) {
      setStatus("error");
      setErrorMsg("El nombre es requerido");
      return;
    }

    const fullName = [trimNombre, paterno.trim(), materno.trim()]
      .filter(Boolean)
      .join(" ");

    setStatus("loading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("name", fullName);
    const result = await updateProfileAction(formData);

    if (result.success) {
      setDisplayName(fullName);
      setStatus("success");
      setModalOpen(false);
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Error al guardar");
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Campo nombre — solo lectura, tap abre modal */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Nombre completo
          </label>
          <button
            type="button"
            onClick={openModal}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base bg-white text-left flex items-center justify-between hover:border-neutral-400 transition"
          >
            <span className={displayName ? "text-neutral-900" : "text-neutral-400"}>
              {displayName || "Toca para ingresar tu nombre"}
            </span>
            <svg className="w-4 h-4 text-neutral-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
            </svg>
          </button>
        </div>

        {/* Correo — solo lectura */}
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
      </div>

      {/* Modal de nombre completo */}
      {modalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => !status.startsWith("loading") && setModalOpen(false)}
          />

          {/* Panel */}
          <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center">
            <div className="w-full sm:max-w-md bg-white rounded-t-2xl shadow-2xl px-5 pt-4 pb-8 space-y-5">
              {/* Handle */}
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto" />

              <h3 className="text-base font-semibold text-neutral-900">Nombre completo</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">
                    Nombre(s) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => { setNombre(e.target.value); setStatus("idle"); }}
                    placeholder="Ej. Juan"
                    autoFocus
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">
                    Apellido paterno
                  </label>
                  <input
                    type="text"
                    value={paterno}
                    onChange={(e) => { setPaterno(e.target.value); setStatus("idle"); }}
                    placeholder="Ej. García"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">
                    Apellido materno
                  </label>
                  <input
                    type="text"
                    value={materno}
                    onChange={(e) => { setMaterno(e.target.value); setStatus("idle"); }}
                    placeholder="Ej. López"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white"
                  />
                </div>

                {/* Vista previa */}
                {(nombre.trim() || paterno.trim() || materno.trim()) && (
                  <p className="text-xs text-neutral-400">
                    Vista previa:{" "}
                    <span className="font-medium text-neutral-700">
                      {[nombre.trim(), paterno.trim(), materno.trim()].filter(Boolean).join(" ")}
                    </span>
                  </p>
                )}

                {status === "error" && (
                  <p className="text-sm text-red-600">{errorMsg}</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={status === "loading"}
                  className="flex-1 rounded-xl border border-neutral-200 bg-white text-neutral-700 py-3 text-sm font-semibold hover:bg-neutral-50 transition disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={status === "loading" || !nombre.trim()}
                  className="flex-1 rounded-xl bg-black text-white py-3 text-sm font-semibold hover:bg-neutral-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {status === "loading" ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
