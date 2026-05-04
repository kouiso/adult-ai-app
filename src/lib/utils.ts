import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAvatarFallback(name: string): string {
  const chars = Array.from(name);
  if (chars.length === 0) return "?";
  if (chars.length <= 2) return name;
  return chars[0];
}
