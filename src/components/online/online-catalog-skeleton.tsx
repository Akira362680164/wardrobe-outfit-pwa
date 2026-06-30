function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink/[0.07] motion-reduce:animate-none ${className}`} />;
}

export function OnlineCatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="正在加载列表" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-ink/[0.05] bg-white/70">
          <Block className={`w-full rounded-none ${index % 3 === 1 ? "aspect-[4/5]" : "aspect-[3/4]"}`} />
          <div className="space-y-2 p-3">
            <Block className="h-3.5 w-3/4" />
            <Block className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
