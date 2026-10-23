/**
 * cn：合并 Tailwind 类名（shadcn/ui 约定位置）。
 * Tailwind v4 不需要 tailwind.config.js，tailwind-merge 仍然负责消解冲突类。
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
