const SWIMLANE_DRAG_PREFIX = "swimlane:";

export function makeSwimlaneDragId(itemId: string): string {
  return `${SWIMLANE_DRAG_PREFIX}${itemId}`;
}

export function parseSwimlaneDragId(id: string): string | null {
  if (!id.startsWith(SWIMLANE_DRAG_PREFIX)) return null;
  return id.slice(SWIMLANE_DRAG_PREFIX.length);
}
