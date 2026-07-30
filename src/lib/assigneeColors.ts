export const ASSIGNEE_COLOR_PALETTE = [
  {
    id: "red",
    bgClass: "bg-red-200",
    textClass: "text-red-900",
  },
  {
    id: "lime",
    bgClass: "bg-lime-200",
    textClass: "text-lime-900",
  },
  {
    id: "sky",
    bgClass: "bg-sky-200",
    textClass: "text-sky-900",
  },
  {
    id: "yellow",
    bgClass: "bg-yellow-200",
    textClass: "text-yellow-900",
  },
  {
    id: "pink",
    bgClass: "bg-pink-200",
    textClass: "text-pink-900",
  },
  {
    id: "mint",
    bgClass: "bg-emerald-200",
    textClass: "text-emerald-900",
  },
  {
    id: "blue",
    bgClass: "bg-blue-200",
    textClass: "text-blue-900",
  },
  {
    id: "gray",
    bgClass: "bg-gray-300",
    textClass: "text-gray-900",
  },
  {
    id: "purple",
    bgClass: "bg-indigo-600",
    textClass: "text-indigo-50",
  },
  {
    id: "darkGreen",
    bgClass: "bg-green-800",
    textClass: "text-green-50",
  },
  {
    id: "darkBlue",
    bgClass: "bg-blue-700",
    textClass: "text-blue-50",
  },
  {
    id: "darkGray",
    bgClass: "bg-neutral-800",
    textClass: "text-neutral-50",
  },
  {
    id: "black",
    bgClass: "bg-black",
    textClass: "text-white",
  },
] as const;

export type AssigneeColorId = (typeof ASSIGNEE_COLOR_PALETTE)[number]["id"];

const ASSIGNEE_COLOR_ID_SET = new Set<string>(
  ASSIGNEE_COLOR_PALETTE.map((c) => c.id),
);

export function isAssigneeColorId(x: unknown): x is AssigneeColorId {
  return typeof x === "string" && ASSIGNEE_COLOR_ID_SET.has(x);
}

export function getAssigneeColorById(
  id: AssigneeColorId,
): (typeof ASSIGNEE_COLOR_PALETTE)[number] {
  return ASSIGNEE_COLOR_PALETTE.find((c) => c.id === id) ?? ASSIGNEE_COLOR_PALETTE[0];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getFallbackAssigneeColorId(name: string): AssigneeColorId {
  const trimmed = name.trim();
  if (!trimmed) return "gray";
  const idx = hashString(trimmed) % ASSIGNEE_COLOR_PALETTE.length;
  return ASSIGNEE_COLOR_PALETTE[idx].id;
}

