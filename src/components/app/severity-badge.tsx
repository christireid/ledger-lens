import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

/** SeverityBadge — §04.6: severity → token + label + glyph; never color-only. */
const SEVERITY_STYLES: Record<string, { className: string; label: string; glyph: string }> = {
  high: { className: "bg-critical/10 text-critical border-critical/30", label: "High", glyph: "▲" },
  medium: { className: "bg-warning/10 text-warning border-warning/30", label: "Medium", glyph: "◆" },
  low: { className: "bg-info/10 text-info border-info/30", label: "Low", glyph: "●" },
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low!;
  return (
    <Badge variant="outline" className={cn(style.className, className)}>
      <span aria-hidden>{style.glyph}</span>
      {style.label}
    </Badge>
  );
}
