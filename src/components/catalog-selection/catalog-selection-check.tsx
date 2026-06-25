import { Check } from "lucide-react";

export function CatalogSelectionCheck() {
  return (
    <span
      className="absolute top-[10px] right-[10px] z-10 grid h-7 w-7 place-items-center rounded-full bg-denim text-white shadow-sm"
      aria-hidden="true"
    >
      <Check size={14} />
    </span>
  );
}
