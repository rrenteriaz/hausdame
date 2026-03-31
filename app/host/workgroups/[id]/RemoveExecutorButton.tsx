// app/host/workgroups/[id]/RemoveExecutorButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleExecutorStatusAction } from "../actions-executors";

interface RemoveExecutorButtonProps {
  workGroupId: string;
  teamId: string;
}

export default function RemoveExecutorButton({ workGroupId, teamId }: RemoveExecutorButtonProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      const formData = new FormData();
      formData.set("workGroupId", workGroupId);
      formData.set("teamId", teamId);
      formData.set("newStatus", "INACTIVE");
      await toggleExecutorStatusAction(formData);
      router.refresh();
    } catch (err) {
      console.error("[RemoveExecutorButton] Error:", err);
      setIsRemoving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={isRemoving}
      className="text-sm text-red-600 hover:text-red-800 underline underline-offset-2 disabled:opacity-50 shrink-0"
    >
      {isRemoving ? "Quitando..." : "Quitar"}
    </button>
  );
}
