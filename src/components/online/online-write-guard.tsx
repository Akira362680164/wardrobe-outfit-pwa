export function OnlineWriteGuard({
  busy,
  children,
  className,
}: {
  busy: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return <fieldset disabled={busy} aria-busy={busy} className={className}>{children}</fieldset>;
}
