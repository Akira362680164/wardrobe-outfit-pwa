import type { ButtonHTMLAttributes, ReactNode } from "react";
import { OnlineButtonSpinner } from "@/components/online/online-button-spinner";

interface AsyncActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  icon?: ReactNode;
  tone?: "primary" | "danger" | "neutral";
}

const toneClass = {
  primary: "bg-denim text-white",
  danger: "bg-red-600 text-white",
  neutral: "border border-ink/10 bg-white text-ink/65",
};

export function AsyncActionButton({ label, loadingLabel = label, loading = false, icon, tone = "primary", className, disabled, ...props }: AsyncActionButtonProps) {
  return <button type="button" {...props} disabled={disabled || loading} aria-busy={loading} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${toneClass[tone]} ${className ?? ""}`}>{loading ? <OnlineButtonSpinner /> : icon}{loading ? loadingLabel : label}</button>;
}
