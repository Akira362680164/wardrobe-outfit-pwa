import type { ReactNode } from "react";

export function CatalogWaterfallGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}
