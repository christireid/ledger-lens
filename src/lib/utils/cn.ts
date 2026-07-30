import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class composition — §04.4: cn() (clsx + tailwind-merge) everywhere. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
