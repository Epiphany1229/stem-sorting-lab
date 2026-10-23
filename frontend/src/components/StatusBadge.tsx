import { BilingualText } from "../i18n/BilingualText";
import { cn } from "../lib/utils";
import type { PageStatus } from "../navigation";

interface StatusBadgeProps {
  status: PageStatus;
  className?: string;
}

/**
 * 页面/功能状态徽标：圆点 + 颜色 + 双语文字，不单靠颜色传达信息。
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isAvailable = status === "available";

  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1",
        isAvailable ? "border-success/35 bg-success-soft" : "border-compare/40 bg-compare-soft",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-full", isAvailable ? "bg-success" : "bg-compare")}
      />
      <BilingualText tkey={isAvailable ? "status.available" : "status.inDevelopment"} size="xs" />
    </span>
  );
}
