import {
  ArrowDown,
  ArrowUp,
  ThumbsDown,
  ThumbsUp,
  BellRing,
  CandlestickChart,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileUp,
  Landmark,
  LayoutDashboard,
  List,
  Loader2,
  MessageSquareText,
  Moon,
  ScanSearch,
  Search,
  Settings,
  Sun,
  Triangle,
  X,
} from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * Icon vocabulary — §04.8 (fixed; new domain nouns must register here).
 * 20px default, 16px dense; stroke-width 1.75 globally.
 */
const withDefaults = (Icon: LucideIcon) => {
  const Component = (props: LucideProps) => <Icon strokeWidth={1.75} {...props} />;
  Component.displayName = Icon.displayName ?? "Icon";
  return Component;
};

export const Icons = {
  dashboard: withDefaults(LayoutDashboard),
  ledger: withDefaults(List),
  anomaly: withDefaults(ScanSearch),
  investigation: withDefaults(MessageSquareText),
  alert: withDefaults(BellRing),
  import: withDefaults(FileUp),
  accountBank: withDefaults(Landmark),
  accountBrokerage: withDefaults(CandlestickChart),
  accountCard: withDefaults(CreditCard),
  settings: withDefaults(Settings),
  search: withDefaults(Search),
  close: withDefaults(X),
  check: withDefaults(Check),
  chevronDown: withDefaults(ChevronDown),
  chevronRight: withDefaults(ChevronRight),
  spinner: withDefaults(Loader2),
  sun: withDefaults(Sun),
  moon: withDefaults(Moon),
  arrowUp: withDefaults(ArrowUp),
  arrowDown: withDefaults(ArrowDown),
  thumbsUp: withDefaults(ThumbsUp),
  thumbsDown: withDefaults(ThumbsDown),
  /** gain/loss direction glyphs (§04.8: triangle-up / triangle-down) */
  gain: (props: LucideProps) => <Triangle strokeWidth={1.75} fill="currentColor" {...props} />,
  loss: ({ className, ...props }: LucideProps) => (
    <Triangle strokeWidth={1.75} fill="currentColor" className={`rotate-180 ${className ?? ""}`} {...props} />
  ),
} as const;
