"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

// §03.7: toasts bottom-right, max 3 stacked, 6 s default.
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      visibleToasts={3}
      duration={6000}
      toastOptions={{
        classNames: {
          toast: "border bg-card text-card-foreground shadow-md",
        },
      }}
    />
  );
}
