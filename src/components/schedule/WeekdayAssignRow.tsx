"use client";

import { InlineEdit } from "@/components/ui/InlineEdit";
import type { SprintSchedule, WeekdayKey } from "@/lib/types";

const WEEKDAYS: { key: WeekdayKey; label: string }[] = [
  { key: "tuesday", label: "火" },
  { key: "wednesday", label: "水" },
  { key: "thursday", label: "木" },
  { key: "friday", label: "金" },
  { key: "monday", label: "月" },
];

type WeekdayAssignRowProps = {
  schedule: SprintSchedule;
  onUpdateDay: (day: WeekdayKey, name: string) => void;
};

export function WeekdayAssignRow({ schedule, onUpdateDay }: WeekdayAssignRowProps) {
  return (
    <section className="flex w-full items-stretch gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
      {WEEKDAYS.map(({ key, label }) => (
        <div
          key={key}
          className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1.5 shadow-sm"
        >
          <span className="text-xs font-bold text-gray-800">{label}</span>
          <InlineEdit
            value={schedule[key]}
            onChange={(name) => onUpdateDay(key, name)}
            className="w-full whitespace-nowrap rounded border-2 border-blue-400 px-1 py-1.5 text-center text-xs font-medium text-gray-900"
            inputClassName="py-1.5 text-xs text-center"
            placeholder="担当"
          />
        </div>
      ))}
    </section>
  );
}
