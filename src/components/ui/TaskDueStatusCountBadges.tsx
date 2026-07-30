type TaskDueStatusCountBadgesProps = {
  dueToday: number;
  overdue: number;
  className?: string;
};

export function TaskDueStatusCountBadges({
  dueToday,
  overdue,
  className,
}: TaskDueStatusCountBadgesProps) {
  if (dueToday === 0 && overdue === 0) return null;

  return (
    <div
      className={["flex flex-wrap items-center gap-1", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={[
        dueToday > 0 ? `本日中 ${dueToday}件` : null,
        overdue > 0 ? `期限切れ ${overdue}件` : null,
      ]
        .filter(Boolean)
        .join("、")}
    >
      {dueToday > 0 && (
        <span className="inline-flex rounded px-1.5 py-px text-[9px] font-bold leading-tight text-amber-800 ring-1 ring-amber-600 bg-amber-100 shadow-sm">
          本日 {dueToday}
        </span>
      )}
      {overdue > 0 && (
        <span className="inline-flex rounded px-1.5 py-px text-[9px] font-bold leading-tight text-red-800 ring-1 ring-red-600 bg-red-100 shadow-sm">
          期限切れ {overdue}
        </span>
      )}
    </div>
  );
}
