"use client";

import { useDroppable } from "@dnd-kit/core";
type DroppableZoneProps = {
  id: string;
  children: React.ReactNode;
  className?: string;
  isEmpty?: boolean;
};

export function DroppableZone({
  id,
  children,
  className = "",
  isEmpty,
}: DroppableZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex min-h-[120px] flex-1 flex-col gap-2 rounded border border-dashed p-2 transition-colors",
        isOver ? "border-blue-400 bg-blue-50/60" : "border-gray-300 bg-gray-50/50",
        isEmpty ? "min-h-[80px]" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
