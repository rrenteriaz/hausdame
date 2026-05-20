"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NewWorkGroupModal from "./NewWorkGroupModal";

type WorkGroupPropertyOption = {
  id: string;
  name: string;
  shortName: string | null;
  address?: string | null;
};

type CreateWorkGroupFormProps = {
  initialOpen?: boolean;
  availableProperties?: WorkGroupPropertyOption[];
};

export default function CreateWorkGroupForm({
  initialOpen = false,
  availableProperties = [],
}: CreateWorkGroupFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consumedInitialOpen = useRef(false);
  const [isOpen, setIsOpen] = useState(initialOpen);

  useEffect(() => {
    if (!initialOpen || consumedInitialOpen.current) return;
    consumedInitialOpen.current = true;

    const params = new URLSearchParams(searchParams.toString());
    if (params.get("create") === "1") {
      params.delete("create");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }, [initialOpen, pathname, router, searchParams]);

  const handleSuccess = () => {
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full sm:w-auto sm:min-w-[140px] sm:max-w-xs rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
      >
        Crear grupo de trabajo
      </button>

      <NewWorkGroupModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
        availableProperties={availableProperties}
        guided
      />
    </>
  );
}

