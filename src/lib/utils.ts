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

export function formatRelativeTime(date: Date | string): string {
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const targetTime = targetDate.getTime();

  if (Number.isNaN(targetTime)) return "今日の続き";

  const now = new Date();
  const diffMs = now.getTime() - targetTime;

  if (diffMs < 60 * 60 * 1000) return "さっきの続き";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTargetDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfTargetDay.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays <= 0) return "今日の続き";
  if (diffDays === 1) return "昨日の続き";
  if (diffDays <= 7) return `${diffDays}日前の続き`;

  return `${targetDate.getMonth() + 1}月${targetDate.getDate()}日の続き`;
}
