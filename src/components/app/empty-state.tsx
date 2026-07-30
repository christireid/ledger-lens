import type { ReactNode } from "react";

/** EmptyState — §04.6 + §03.5: true-empty | filtered-empty | degraded. Typographic, no illustrations (§04.8). */
export function EmptyState({
  variant,
  title,
  description,
  action,
}: {
  variant: "true-empty" | "filtered-empty" | "degraded";
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center"
      data-variant={variant}
    >
      <p className="text-base font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
