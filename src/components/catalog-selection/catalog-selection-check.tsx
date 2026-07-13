import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { spring } from "@/lib/motion-tokens";

export function CatalogSelectionCheck() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.span
      className="absolute top-[10px] right-[10px] z-10 grid h-7 w-7 place-items-center rounded-full bg-denim text-white shadow-sm"
      aria-hidden="true"
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={prefersReducedMotion ? { duration: 0 } : spring.control}
    >
      <Check size={14} />
    </motion.span>
  );
}
