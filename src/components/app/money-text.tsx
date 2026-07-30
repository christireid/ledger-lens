import { Icons } from "@/components/app/icons";
import { cn } from "@/lib/utils/cn";

/**
 * MoneyText — §04.6: Intl.NumberFormat, mono font, sign convention prop.
 * Direction is never color-only (§04.3.2): sign/glyph always renders.
 */
export function MoneyText({
  value,
  currency = "USD",
  signConvention = "signed",
  showDirection = false,
  compact = false,
  className,
}: {
  value: string | null | undefined; // decimal string (wire format §16.2)
  currency?: string;
  signConvention?: "accounting" | "signed";
  showDirection?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (value == null) return <span className={cn("font-mono", className)}>—</span>;
  const num = Number(value);
  const negative = num < 0;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    ...(compact ? { notation: "compact" as const, maximumFractionDigits: 2 } : {}),
  });
  const abs = formatter.format(Math.abs(num));
  const text =
    signConvention === "accounting" && negative ? `(${abs})` : negative ? `-${abs}` : abs;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        showDirection && (negative ? "text-loss" : "text-gain"),
        className,
      )}
    >
      {showDirection &&
        (negative ? (
          <Icons.loss className="mr-0.5 inline h-2.5 w-2.5" aria-hidden />
        ) : (
          <Icons.gain className="mr-0.5 inline h-2.5 w-2.5" aria-hidden />
        ))}
      {text}
      {compact && <span className="sr-only">exact value {value}</span>}
    </span>
  );
}
