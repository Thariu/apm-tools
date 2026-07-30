"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlanningData } from "@/hooks/usePlanningData";
import {
  getAssigneeColorById,
  getFallbackAssigneeColorId,
  type AssigneeColorId,
} from "@/lib/assigneeColors";
import { BOARD_ORDER } from "@/lib/boardConfig";
import {
  buildDefaultBusinessDayIsos,
  formatBurndownDayLabel,
  formatBusinessDayRange,
} from "@/lib/burndown";
import {
  isRetroArchiveDue,
  isRetroSessionArchived,
  resolveRetroBusinessDayIsos,
} from "@/lib/retroArchive";
import {
  mergeNotesById,
  patchNoteInList,
  removeNoteFromList,
} from "@/lib/retroNotesMerge";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { AssigneeSinglePicker } from "@/components/ui/AssigneeSinglePicker";
import type {
  BoardId,
  RetroFramework,
  RetroFdlNote,
  RetroFdlTag,
  RetroHappinessNote,
  RetroHappinessScores,
  RetroNote,
  RetroSession,
  RetroThankYouNote,
} from "@/lib/types";
import {
  createRetroSession,
  createRetroThankYouNote,
  defaultRetroFdlData,
  defaultRetroHappinessData,
  createRetroHappinessNote,
  createRetroNote,
  deleteRecordKey,
  duplicateRetroHappinessNote,
  duplicateRetroThankYouNote,
  renameRecordKey,
} from "@/lib/retroDefaults";
import {
  buildHappinessCellLabels,
  deleteHappinessParticipantKey,
  happinessNoteHeight,
  happinessNoteWidth,
  HAPPINESS_NOTE_MAX_HEIGHT,
  HAPPINESS_NOTE_MAX_WIDTH,
  HAPPINESS_NOTE_MIN_HEIGHT,
  HAPPINESS_NOTE_MIN_WIDTH,
  groupHappinessNotesByAuthor,
  emptyRetroHappinessScores,
  isRetroHappinessScoresComplete,
  normalizeRetroHappinessData,
  patchHappinessParticipantScore,
  renameHappinessNoteAuthors,
  renameHappinessParticipantKey,
  resolveHappinessNoteSectionNames,
  retroHappinessActiveStorageKey,
} from "@/lib/retroHappiness";
import { fetchRetroFacilitationDoc } from "@/lib/firebase/planningRepository";
import { readCachedFacilitationParticipants } from "@/lib/retroFacilitationStorage";

type Props = {
  boardId: BoardId;
  sprintKey: string;
  /** 過去の振り返りなど、編集不可モード */
  readOnly?: boolean;
  /** 担当者（ファシリ）行を表示する（過去の振り返りでは false） */
  showFacilitationRow?: boolean;
};

type FrameworkOption = { id: RetroFramework; title: string; description: string };

function participantsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((name, i) => name === b[i]);
}

function tagsEqual(a: RetroFdlTag[], b: RetroFdlTag[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((t, i) => t === bs[i]);
}

/** 付箋に設定された担当者のみ（重複除去・出現順） */
function fdlNextActionParticipantsFromNotes(notes: RetroFdlNote[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    const n = note.author?.trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY, overflowX } = getComputedStyle(node);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowX === "auto" ||
      overflowX === "scroll"
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** 図キャンバスとスクロール領域の交差部分の中心を正規化座標 (0..1) で返す */
function visibleCenterInFdlCanvas(
  container: HTMLElement,
): { x: number; y: number } | null {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const scrollParent = findScrollParent(container);
  const viewRect = scrollParent
    ? scrollParent.getBoundingClientRect()
    : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };

  const visibleTop = Math.max(rect.top, viewRect.top);
  const visibleBottom = Math.min(rect.bottom, viewRect.bottom);
  const visibleLeft = Math.max(rect.left, viewRect.left);
  const visibleRight = Math.min(rect.right, viewRect.right);

  if (visibleBottom <= visibleTop || visibleRight <= visibleLeft) return null;

  const centerX = (visibleLeft + visibleRight) / 2;
  const centerY = (visibleTop + visibleBottom) / 2;

  return {
    x: clamp01((centerX - rect.left) / rect.width),
    y: clamp01((centerY - rect.top) / rect.height),
  };
}

const FDL_VIEWPORT_WIDTH_COMPACT = 0.8;

function fdlClientToNormalized(
  clientX: number,
  clientY: number,
  viewportRect: DOMRect,
): { x: number; y: number } {
  return {
    x: clamp01((clientX - viewportRect.left) / viewportRect.width),
    y: clamp01((clientY - viewportRect.top) / viewportRect.height),
  };
}

function fdlVisibleCenterNormalized(
  viewport: HTMLElement,
): { x: number; y: number } | null {
  const rect = viewport.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const scrollParent = findScrollParent(viewport);
  const viewRect = scrollParent
    ? scrollParent.getBoundingClientRect()
    : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };

  const visibleTop = Math.max(rect.top, viewRect.top);
  const visibleBottom = Math.min(rect.bottom, viewRect.bottom);
  const visibleLeft = Math.max(rect.left, viewRect.left);
  const visibleRight = Math.min(rect.right, viewRect.right);

  if (visibleBottom <= visibleTop || visibleRight <= visibleLeft) return null;

  const centerX = (visibleLeft + visibleRight) / 2;
  const centerY = (visibleTop + visibleBottom) / 2;
  return fdlClientToNormalized(centerX, centerY, rect);
}

/** 7〜8人×各4枚程度を想定した付箋サイズ（均等グリッド用にやや小さめ） */
const FDL_NOTE_DEFAULT_WIDTH = 100;
const FDL_NOTE_DEFAULT_HEIGHT = 80;
const FDL_NOTE_MIN_WIDTH = 80;
const FDL_NOTE_MAX_WIDTH = 520;
const FDL_NOTE_MIN_HEIGHT = 64;
const FDL_NOTE_MAX_HEIGHT = 420;

function clampNoteSize(v: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(max, v)));
}

function fdlNoteWidth(note: Pick<RetroFdlNote, "width">) {
  const w = typeof note.width === "number" ? note.width : FDL_NOTE_DEFAULT_WIDTH;
  return clampNoteSize(w, FDL_NOTE_MIN_WIDTH, FDL_NOTE_MAX_WIDTH);
}

function fdlNoteHeight(note: Pick<RetroFdlNote, "height">) {
  const h = typeof note.height === "number" ? note.height : FDL_NOTE_DEFAULT_HEIGHT;
  return clampNoteSize(h, FDL_NOTE_MIN_HEIGHT, FDL_NOTE_MAX_HEIGHT);
}

function withFdlNoteSize(note: RetroFdlNote): RetroFdlNote {
  return { ...note, width: fdlNoteWidth(note), height: fdlNoteHeight(note) };
}

function isFdlNoteDragHandle(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest("[data-fdl-drag-handle]");
}

function isFdlNoteResizeHandle(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest("[data-fdl-resize-handle]");
}

type FdlResizeAxis = "se" | "e" | "s";

function getFdlResizeAxis(target: EventTarget | null): FdlResizeAxis | null {
  if (!(target instanceof HTMLElement)) return null;
  const el = target.closest("[data-fdl-resize-handle]");
  if (!el) return null;
  const axis = el.getAttribute("data-resize-axis");
  if (axis === "e" || axis === "s" || axis === "se") return axis;
  return "se";
}

/** ベン図と同系色（付箋の枠・背景用） */
const FDL_AREA_STYLE = {
  fun: { border: "rgb(37,99,235)", bg: "rgb(239,246,255)", bgFill: "rgba(239, 246, 255, 0.62)" },
  done: { border: "rgb(220,38,38)", bg: "rgb(254,242,242)", bgFill: "rgba(254, 242, 242, 0.62)" },
  learn: { border: "rgb(22,163,74)", bg: "rgb(240,253,244)", bgFill: "rgba(240, 253, 244, 0.62)" },
} as const;

function fdlAreaPreset(tags: RetroFdlTag[]): { fill: string; border: string } {
  const sorted = [...tags].sort();
  const key = sorted.join(",");
  const F = FDL_AREA_STYLE.fun;
  const D = FDL_AREA_STYLE.done;
  const L = FDL_AREA_STYLE.learn;
  const presets: Record<string, { fill: string; border: string }> = {
    fun: { fill: F.bg, border: F.border },
    done: { fill: D.bg, border: D.border },
    learn: { fill: L.bg, border: L.border },
    "done,fun": {
      fill: `linear-gradient(135deg, ${F.bg} 0%, ${D.bg} 100%)`,
      border: `linear-gradient(135deg, ${F.border} 0%, ${D.border} 100%)`,
    },
    "fun,learn": {
      fill: `linear-gradient(135deg, ${F.bg} 0%, ${L.bg} 100%)`,
      border: `linear-gradient(135deg, ${F.border} 0%, ${L.border} 100%)`,
    },
    "done,learn": {
      fill: `linear-gradient(135deg, ${D.bg} 0%, ${L.bg} 100%)`,
      border: `linear-gradient(135deg, ${D.border} 0%, ${L.border} 100%)`,
    },
    "done,fun,learn": {
      fill: `linear-gradient(135deg, ${F.bg} 0%, ${D.bg} 50%, ${L.bg} 100%)`,
      border: `linear-gradient(135deg, ${F.border} 0%, ${D.border} 50%, ${L.border} 100%)`,
    },
  };
  return presets[key] ?? presets.fun;
}

const FDL_TAG_LABEL: Record<RetroFdlTag, string> = {
  fun: "FUN",
  done: "Done",
  learn: "Learn",
};

const FDL_TAG_DISPLAY_ORDER: RetroFdlTag[] = ["fun", "done", "learn"];

function fdlOverlapZoneLabel(tags: RetroFdlTag[]): string {
  return FDL_TAG_DISPLAY_ORDER.filter((t) => tags.includes(t))
    .map((t) => FDL_TAG_LABEL[t])
    .join("・");
}

type FdlZoneRect = { x0: number; y0: number; x1: number; y1: number };

/**
 * 3×3 グリッドの7マス（単独3＋重なり4）を同面積に配置したベン図
 * 上: FUN / 左下: Done / 右下: Learn
 */
const FDL_GRID = { margin: 0.015, cols: 3, rows: 3 } as const;

function fdlGridSize(): number {
  return (1 - 2 * FDL_GRID.margin) / FDL_GRID.cols;
}

function fdlGridCell(
  col: number,
  row: number,
): FdlZoneRect & { cols: number; rows: number } {
  const m = FDL_GRID.margin;
  const size = fdlGridSize();
  return {
    x0: m + col * size,
    y0: m + row * size,
    x1: m + (col + 1) * size,
    y1: m + (row + 1) * size,
    cols: 3,
    rows: 3,
  };
}

/** FUN 単独エリア: グリッド上段・全幅（上端はグリッド余白に揃える） */
function fdlFunExclusiveZone(): FdlZoneRect & { cols: number; rows: number } {
  const left = fdlGridCell(0, 0);
  const right = fdlGridCell(2, 0);
  return {
    x0: left.x0,
    y0: left.y0,
    x1: right.x1,
    y1: left.y1,
    cols: 3,
    rows: 3,
  };
}

const FDL_PLACEMENT = {
  fun: fdlFunExclusiveZone(),
  doneFun: fdlGridCell(0, 1),
  triple: fdlGridCell(1, 1),
  funLearn: fdlGridCell(2, 1),
  done: fdlGridCell(0, 2),
  doneLearn: fdlGridCell(1, 2),
  learn: fdlGridCell(2, 2),
} as const;

const FDL_BLOCKS = (() => {
  const m = FDL_GRID.margin;
  const s = fdlGridSize();
  const funTop = fdlGridCell(0, 0).y0;
  const funExclusiveBottom = fdlGridCell(0, 0).y1;
  const funLabelY = funTop + (funExclusiveBottom - funTop) / 2;
  return [
    {
      tag: "fun" as const,
      x0: m,
      y0: funTop,
      x1: 1 - m,
      y1: m + 2 * s,
      stroke: "rgb(37,99,235)",
      label: "FUN",
      labelX: m + 1.5 * s,
      labelY: funLabelY,
      labelClass: "text-2xl",
    },
    {
      tag: "done" as const,
      x0: m,
      y0: m + s,
      x1: m + 2 * s,
      y1: 1 - m,
      stroke: "rgb(220,38,38)",
      label: "Done",
      labelX: m + 0.5 * s,
      labelY: m + 2.5 * s,
      labelClass: "text-2xl",
    },
    {
      tag: "learn" as const,
      x0: m + s,
      y0: m + s,
      x1: 1 - m,
      y1: 1 - m,
      stroke: "rgb(22,163,74)",
      label: "Learn",
      labelX: m + 2.5 * s,
      labelY: m + 2.5 * s,
      labelClass: "text-2xl",
    },
  ] as const;
})();

const FDL_EXCLUSIVE_ZONES: { tags: RetroFdlTag[]; rect: FdlZoneRect }[] = [
  { tags: ["fun"], rect: FDL_PLACEMENT.fun },
  { tags: ["done"], rect: FDL_PLACEMENT.done },
  { tags: ["learn"], rect: FDL_PLACEMENT.learn },
];

const FDL_OVERLAP_ZONES: { tags: RetroFdlTag[]; rect: FdlZoneRect }[] = [
  { tags: ["done", "fun"], rect: FDL_PLACEMENT.doneFun },
  { tags: ["fun", "learn"], rect: FDL_PLACEMENT.funLearn },
  { tags: ["done", "learn"], rect: FDL_PLACEMENT.doneLearn },
  { tags: ["done", "fun", "learn"], rect: FDL_PLACEMENT.triple },
];

const FDL_ALL_ZONES: { tags: RetroFdlTag[]; rect: FdlZoneRect }[] = [
  ...FDL_OVERLAP_ZONES,
  ...FDL_EXCLUSIVE_ZONES,
];

function inFdlBlock(
  nx: number,
  ny: number,
  block: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return nx >= block.x0 && nx <= block.x1 && ny >= block.y0 && ny <= block.y1;
}

function computeFdlTagsForPos(
  nx: number,
  ny: number,
  fallback: RetroFdlTag[],
): RetroFdlTag[] {
  for (const zone of FDL_ALL_ZONES) {
    if (inFdlBlock(nx, ny, zone.rect)) return [...zone.tags];
  }
  const hits = FDL_BLOCKS.filter((b) => inFdlBlock(nx, ny, b)).map((b) => b.tag);
  return hits.length > 0 ? [...hits] : fallback;
}

/** 付箋の見た目（エリア色は図の背景で表現するため付箋は黄色固定） */
const FDL_NOTE_APPEARANCE = {
  backgroundColor: "rgb(254, 249, 195)",
  borderColor: "rgb(202, 138, 4)",
  borderWidth: 2,
  borderStyle: "solid" as const,
};

const THANK_YOU_NOTE_APPEARANCE = {
  backgroundColor: "rgb(254, 249, 195)",
  borderColor: "rgb(180, 83, 9)",
  borderWidth: 2,
  borderStyle: "solid" as const,
};

function fdlNoteAppearance(tags: RetroFdlTag[]): {
  ariaLabel: string;
  style: React.CSSProperties;
} {
  const sorted = [...tags].sort();
  const ariaLabel = `${sorted.map((t) => FDL_TAG_LABEL[t]).join("・")}エリアの付箋`;
  return {
    ariaLabel,
    style: { ...FDL_NOTE_APPEARANCE },
  };
}

function seededJitter(seed: number) {
  // 0..1 pseudo random (deterministic)
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function gridPosInRect(
  seed: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
  cols: number,
  rows: number,
): { x: number; y: number } {
  const slots = cols * rows;
  const idx = Math.floor(seededJitter(seed) * slots) % slots;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const cellW = (rect.x1 - rect.x0) / cols;
  const cellH = (rect.y1 - rect.y0) / rows;
  const x = rect.x0 + cellW * (col + 0.5);
  const y = rect.y0 + cellH * (row + 0.5);
  const jx = (seededJitter(seed + 1) - 0.5) * cellW * 0.35;
  const jy = (seededJitter(seed + 2) - 0.5) * cellH * 0.35;
  return { x: clamp01(x + jx), y: clamp01(y + jy) };
}

function defaultPosForTags(tags: RetroFdlTag[], seed: number): { x: number; y: number } {
  if (tagsEqual(tags, ["fun"])) {
    const z = FDL_PLACEMENT.fun;
    return gridPosInRect(seed, z, z.cols, z.rows);
  }
  if (tagsEqual(tags, ["done"])) {
    const z = FDL_PLACEMENT.done;
    return gridPosInRect(seed, z, z.cols, z.rows);
  }
  if (tagsEqual(tags, ["learn"])) {
    const z = FDL_PLACEMENT.learn;
    return gridPosInRect(seed, z, z.cols, z.rows);
  }
  if (tagsEqual(tags, ["done", "fun"])) {
    const z = FDL_PLACEMENT.doneFun;
    return gridPosInRect(seed, z, z.cols, z.rows);
  }
  if (tagsEqual(tags, ["fun", "learn"])) {
    const z = FDL_PLACEMENT.funLearn;
    return gridPosInRect(seed, z, z.cols, z.rows);
  }
  if (tags.includes("done") && tags.includes("learn") && !tags.includes("fun")) {
    const z = FDL_PLACEMENT.doneLearn;
    return gridPosInRect(seed, z, z.cols, z.rows);
  }
  if (tags.includes("done") && tags.includes("learn") && tags.includes("fun")) {
    const z = FDL_PLACEMENT.triple;
    return gridPosInRect(seed, z, z.cols, z.rows);
  }
  return gridPosInRect(seed, FDL_PLACEMENT.triple, 3, 3);
}

function normalizeFdlNotes(fdl: RetroSession["fdl"] | undefined): RetroFdlNote[] {
  const anyFdl = fdl as unknown as {
    notes?: RetroFdlNote[];
    fun?: RetroNote[];
    done?: RetroNote[];
    learn?: RetroNote[];
  };
  const v2 = anyFdl?.notes;
  if (Array.isArray(v2)) {
    return v2
      .map((n) => {
        const raw = n as RetroFdlNote & { author?: unknown };
        const note: RetroFdlNote = {
          id: raw.id,
          text: raw.text,
          createdAt: raw.createdAt,
          tags: Array.isArray(raw.tags) ? raw.tags : [],
        };
        if (typeof raw.x === "number") note.x = raw.x;
        if (typeof raw.y === "number") note.y = raw.y;
        if (typeof raw.width === "number") note.width = raw.width;
        if (typeof raw.height === "number") note.height = raw.height;
        if (typeof raw.author === "string") {
          const author = raw.author.trim();
          if (author) note.author = author;
        }
        return note;
      })
      .filter((n) => n.id && Array.isArray(n.tags) && n.tags.length > 0)
      .map((n) => {
        const sized = withFdlNoteSize(n);
        if (typeof n.x === "number" && typeof n.y === "number") return sized;
        const pos = defaultPosForTags(n.tags, n.createdAt);
        return { ...sized, x: pos.x, y: pos.y };
      });
  }

  const out = new Map<string, RetroFdlNote>();
  const push = (note: RetroNote, tags: RetroFdlTag[]) => {
    const cur = out.get(note.id);
    if (!cur) {
      out.set(note.id, { ...note, tags });
      return;
    }
    const merged = Array.from(new Set([...cur.tags, ...tags]));
    out.set(note.id, { ...cur, tags: merged });
  };

  for (const n of anyFdl?.fun ?? []) push(n, ["fun"]);
  for (const n of anyFdl?.done ?? []) push(n, ["done"]);
  for (const n of anyFdl?.learn ?? []) push(n, ["learn"]);
  return Array.from(out.values()).map((n) => {
    const pos = defaultPosForTags(n.tags, n.createdAt);
    return withFdlNoteSize({ ...n, x: pos.x, y: pos.y });
  });
}

const FRAMEWORKS: FrameworkOption[] = [
  {
    id: "fdl",
    title: "FUN / DONE / LEARN",
    description:
      "感謝のチェックイン → DONE 起点で FUN/LEARN に整理 → ネクストアクション。",
  },
  {
    id: "happiness",
    title: "幸福指標",
    description: "役割/チーム/会社の幸福度(1-5)と理由・改善案を整理します。",
  },
];

function SmallModal(props: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!props.isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
    >
      <div className="w-full max-w-lg rounded-lg border border-gray-300 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <div className="text-sm font-bold text-gray-800">{props.title}</div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

function SortableParticipantPill(props: {
  id: string;
  name: string;
  isFacilitator: boolean;
  index: number;
  onRename: (nextName: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: props.id,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={`flex w-full min-w-0 flex-col items-center gap-1 rounded border bg-white px-2 py-1.5 shadow-sm ${
        isDragging ? "opacity-90 ring-2 ring-blue-300" : ""
      } ${
        props.isFacilitator ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200"
      }`}
    >
      <div className="flex w-full items-center justify-between gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded border border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-700 hover:bg-gray-100 active:cursor-grabbing"
            title="ドラッグで並び替え"
            aria-label={`順番をドラッグして並び替え（${props.index + 1}番）`}
          >
            {props.index + 1}
          </button>
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${
              props.isFacilitator ? "bg-blue-600" : "bg-gray-300"
            }`}
          />
          <InlineEdit
            value={props.name}
            onChange={props.onRename}
            className="min-w-0 flex-1 truncate rounded border-2 border-transparent px-1 py-1 text-center text-xs font-semibold text-gray-900 hover:border-gray-200"
            inputClassName="py-1 text-xs text-center"
            placeholder="担当者"
          />
        </div>
        <button
          type="button"
          onClick={props.onDelete}
          className="shrink-0 rounded px-1 py-1 text-gray-400 opacity-70 hover:bg-red-100 hover:text-red-600 hover:opacity-100"
          aria-label={`${props.name} を削除`}
          title="削除"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function FacilitationRow(props: {
  participants: string[];
  facilitatorName: string;
  readOnly?: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  onRenameAt: (index: number, nextName: string) => void;
  onDeleteAt: (index: number) => void;
  onRotate: () => void;
  onRotateBack: () => void;
  onAdd: (name: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const facilitationSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  if (props.readOnly) {
    return (
      <section className="flex w-full items-stretch gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex w-full min-w-0 flex-col gap-2">
          <div className="grid w-full gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,280px))]">
            {props.participants.length === 0 ? (
              <div className="col-span-full flex items-center justify-center rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-600">
                担当者なし
              </div>
            ) : null}
            {props.participants.map((name, idx) => (
              <div
                key={`${idx}:${name}`}
                className={`flex flex-col items-center gap-1 rounded border bg-white px-2 py-1.5 shadow-sm ${
                  idx === 0
                    ? "border-blue-400 ring-2 ring-blue-200"
                    : "border-gray-200"
                }`}
              >
                <div className="flex w-full items-center justify-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500">
                    {idx + 1}
                  </span>
                  <span className="truncate text-xs font-semibold text-gray-900">
                    {name}
                  </span>
                  {idx === 0 ? (
                    <span className="shrink-0 text-[10px] font-semibold text-blue-700">
                      ●
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex w-full items-stretch gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
      <div className="flex w-full min-w-0 flex-col gap-2">
        <DndContext
          sensors={facilitationSensors}
          collisionDetection={closestCenter}
          onDragEnd={props.onDragEnd}
        >
          <SortableContext
            items={props.participants}
            strategy={rectSortingStrategy}
          >
            <div className="grid w-full gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,280px))]">
              {props.participants.length === 0 ? (
                <div className="col-span-full flex items-center justify-center rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-600">
                  担当者が未設定です（右側の追加から入力してください）
                </div>
              ) : null}
              {props.participants.map((name, idx) => (
                <SortableParticipantPill
                  key={`${idx}:${name}`}
                  id={name}
                  index={idx}
                  name={name}
                  isFacilitator={idx === 0}
                  onRename={(nextName) => props.onRenameAt(idx, nextName)}
                  onDelete={() => props.onDeleteAt(idx)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex flex-wrap items-center gap-2">
          {props.participants.length >= 2 ? (
            <>
              <button
                type="button"
                onClick={props.onRotateBack}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-blue-300 bg-blue-50 text-sm font-bold text-blue-800 hover:bg-blue-100"
                title="ローテーションを戻す（最後を1番へ）"
                aria-label="担当者のローテーションを戻す"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={props.onRotate}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-blue-300 bg-blue-50 text-sm font-bold text-blue-800 hover:bg-blue-100"
                title="ファシリを次の人にローテーション（1番を最後へ）"
                aria-label="担当者をローテーション"
              >
                ▶
              </button>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="担当者を追加"
            className="w-64 rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const n = newName.trim();
              if (!n) return;
              props.onAdd(n);
              setNewName("");
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
            onClick={() => {
              const n = newName.trim();
              if (!n) return;
              props.onAdd(n);
              setNewName("");
            }}
          >
            追加
          </button>
        </div>
      </div>
    </section>
  );
}

/** Firestore 書き込み抑制（バーンダウン WIP と同程度） */
const FDL_TEXT_SAVE_DEBOUNCE_MS = 3000;
const HAPPINESS_TEXT_SAVE_DEBOUNCE_MS = 1500;

function FdlNoteTextarea(props: {
  noteId: string;
  serverText: string;
  readOnly?: boolean;
  saveDebounceMs?: number;
  onPersist: (id: string, text: string) => void | Promise<void>;
  onPersistError?: (error: unknown) => void;
  onDraftChange?: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<string | null>(null);
  const serverTextRef = useRef(props.serverText);
  const isFocusedRef = useRef(false);
  const onPersistRef = useRef(props.onPersist);
  const onPersistErrorRef = useRef(props.onPersistError);
  onPersistRef.current = props.onPersist;
  onPersistErrorRef.current = props.onPersistError;
  serverTextRef.current = props.serverText;

  const saveDebounceMs = props.saveDebounceMs ?? FDL_TEXT_SAVE_DEBOUNCE_MS;
  const displayed = draft ?? props.serverText;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (isFocusedRef.current) return;
    if (draft !== null && draft === props.serverText) {
      setDraft(null);
    }
  }, [props.serverText, draft]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const runPersist = useCallback(
    (text: string) => {
      if (props.readOnly) return;
      void Promise.resolve(onPersistRef.current(props.noteId, text)).catch(
        (err) => {
          onPersistErrorRef.current?.(err);
        },
      );
    },
    [props.noteId, props.readOnly],
  );

  const persist = useCallback(
    (text: string) => {
      if (props.readOnly) return;
      clearSaveTimer();
      runPersist(text);
    },
    [clearSaveTimer, props.readOnly, runPersist],
  );

  const schedulePersist = useCallback(
    (text: string) => {
      if (props.readOnly) return;
      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        runPersist(text);
      }, saveDebounceMs);
    },
    [clearSaveTimer, props.readOnly, runPersist, saveDebounceMs],
  );

  useEffect(() => {
    if (props.readOnly) return;
    return () => {
      clearSaveTimer();
      const pending = draftRef.current;
      if (pending !== null && pending !== serverTextRef.current) {
        runPersist(pending);
      }
    };
  }, [clearSaveTimer, props.noteId, props.readOnly, runPersist]);

  return (
    <textarea
      value={displayed}
      readOnly={props.readOnly}
      onChange={(e) => {
        if (props.readOnly) return;
        const next = e.target.value;
        setDraft(next);
        props.onDraftChange?.(next);
        schedulePersist(next);
      }}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onBlur={() => {
        isFocusedRef.current = false;
        if (props.readOnly) return;
        const next = draftRef.current ?? props.serverText;
        persist(next);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      placeholder="入力…"
      className="min-h-6 w-full flex-1 resize-none bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400 placeholder:italic"
    />
  );
}

function FdlThankYouNoteCard(props: {
  note: RetroThankYouNote;
  assigneeCandidates: string[];
  assigneeColorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (name: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate?: (name: string) => void;
  onDeleteAssigneeCandidate?: (name: string) => void;
  onRenameAssigneeCandidate?: (from: string, to: string) => void;
  readOnly?: boolean;
  authorPickerOpen: boolean;
  onAuthorPickerOpenChange: (open: boolean) => void;
  onUpdateText: (id: string, text: string) => void;
  onUpdateAuthor: (id: string, author: string | undefined) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const canModify = !props.readOnly;
  const [draftText, setDraftText] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [resizeSize, setResizeSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    width: number;
    height: number;
    axis: FdlResizeAxis;
  } | null>(null);
  const resizeSizeRef = useRef(resizeSize);
  resizeSizeRef.current = resizeSize;
  const onUpdateSizeRef = useRef(props.onUpdateSize);
  onUpdateSizeRef.current = props.onUpdateSize;
  const noteIdRef = useRef(props.note.id);
  noteIdRef.current = props.note.id;

  const displayText = draftText ?? props.note.text;
  const baseWidth = happinessNoteWidth(props.note, displayText);
  const baseHeight = happinessNoteHeight(props.note, displayText);
  const width = resizeSize?.width ?? baseWidth;
  const height = resizeSize?.height ?? baseHeight;
  const showResizeHandles = canModify && (selected || resizing);

  useEffect(() => {
    if (!resizing) return;

    const onPointerMove = (e: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.startX;
      const dy = e.clientY - start.startY;
      let nextW = start.width;
      let nextH = start.height;
      if (start.axis === "se" || start.axis === "e") {
        nextW = clampNoteSize(
          start.width + dx,
          HAPPINESS_NOTE_MIN_WIDTH,
          HAPPINESS_NOTE_MAX_WIDTH,
        );
      }
      if (start.axis === "se" || start.axis === "s") {
        nextH = clampNoteSize(
          start.height + dy,
          HAPPINESS_NOTE_MIN_HEIGHT,
          HAPPINESS_NOTE_MAX_HEIGHT,
        );
      }
      setResizeSize({ width: nextW, height: nextH });
    };

    const finishResize = () => {
      const start = resizeStartRef.current;
      const size = resizeSizeRef.current;
      resizeStartRef.current = null;
      setResizing(false);
      setResizeSize(null);
      if (!start || !size) return;
      onUpdateSizeRef.current(noteIdRef.current, size.width, size.height);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [resizing]);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    if (!canModify) return;
    if (!isFdlNoteResizeHandle(e.target)) return;
    const axis = getFdlResizeAxis(e.target);
    if (!axis) return;
    setSelected(true);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      width: baseWidth,
      height: baseHeight,
      axis,
    };
    setResizing(true);
    setResizeSize({ width: baseWidth, height: baseHeight });
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="group"
      aria-label="感謝（Thank you）の付箋"
      className={`group/note relative flex shrink-0 flex-col overflow-hidden rounded px-2 py-1.5 shadow-sm ${
        selected ? "ring-2 ring-amber-400 ring-offset-1" : ""
      }`}
      style={{
        ...THANK_YOU_NOTE_APPEARANCE,
        width,
        height,
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelected(true);
      }}
    >
      <div className="mb-0.5 flex h-5 shrink-0 items-center justify-end gap-0.5 border-b border-gray-300 pb-0.5">
        {canModify ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onDuplicate(props.note.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-amber-100 hover:text-amber-700 hover:opacity-100"
            aria-label="付箋を複製"
            title="複製"
          >
            ⧉
          </button>
        ) : null}
        {canModify ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete(props.note.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-red-100 hover:text-red-600 hover:opacity-100"
            aria-label="付箋を削除"
            title="削除"
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-0.5">
        <FdlNoteTextarea
          noteId={props.note.id}
          serverText={props.note.text}
          readOnly={props.readOnly}
          onPersist={props.onUpdateText}
          onDraftChange={setDraftText}
        />
      </div>
      <div className="mt-auto flex shrink-0 items-center pr-7 pt-0.5">
        <div className="min-w-0 max-w-full">
          <AssigneeSinglePicker
            value={props.note.author}
            onChange={(name) => props.onUpdateAuthor(props.note.id, name)}
            candidates={props.assigneeCandidates}
            colorByName={props.assigneeColorByName}
            onSetAssigneeColor={props.onSetAssigneeColor}
            onAddCandidate={props.onAddAssigneeCandidate}
            onDeleteCandidate={props.onDeleteAssigneeCandidate}
            onRenameCandidate={props.onRenameAssigneeCandidate}
            readOnly={props.readOnly}
            isOpen={props.authorPickerOpen}
            onOpenChange={props.onAuthorPickerOpenChange}
            placeholder="＋担当"
          />
        </div>
      </div>
      {showResizeHandles ? (
        <>
          <div
            data-fdl-resize-handle
            data-resize-axis="e"
            role="separator"
            aria-label="幅を変更"
            onPointerDown={handleResizePointerDown}
            className="absolute bottom-7 right-0 top-7 z-[2] w-3 cursor-ew-resize touch-none hover:bg-amber-500/15"
          />
          <div
            data-fdl-resize-handle
            data-resize-axis="s"
            role="separator"
            aria-label="高さを変更"
            onPointerDown={handleResizePointerDown}
            className="absolute bottom-0 left-2 right-7 z-[2] h-3 cursor-ns-resize touch-none hover:bg-amber-500/15"
          />
        </>
      ) : null}
      <div
        data-fdl-resize-handle
        data-resize-axis="se"
        role="separator"
        aria-label="サイズを変更"
        onPointerDown={handleResizePointerDown}
        className={`absolute bottom-0 right-0 z-[3] flex touch-none cursor-se-resize items-end justify-end hover:bg-amber-500/15 ${
          showResizeHandles
            ? "h-7 w-7 rounded-br pb-1 pr-1"
            : "h-6 w-6 pb-0.5 pr-0.5 opacity-60 group-hover/note:opacity-100"
        }`}
      >
        <svg
          viewBox="0 0 12 12"
          className={`${showResizeHandles ? "h-4 w-4 text-amber-600" : "h-3 w-3 text-gray-500"} pointer-events-none`}
          aria-hidden
          fill="currentColor"
        >
          <path d="M12 12H8V10h2V8h2v4zM10 10H6V8h2v2zM8 8H4V6h2v2z" />
        </svg>
      </div>
    </div>
  );
}

function FdlThankYouBlock(props: {
  notes: RetroThankYouNote[];
  readOnly?: boolean;
  assigneeCandidates: string[];
  assigneeColorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (name: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate?: (name: string) => void;
  onDeleteAssigneeCandidate?: (name: string) => void;
  onRenameAssigneeCandidate?: (from: string, to: string) => void;
  onAdd: () => void;
  onUpdateText: (id: string, text: string) => void;
  onUpdateAuthor: (id: string, author: string | undefined) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [authorPickerNoteId, setAuthorPickerNoteId] = useState<string | null>(null);

  return (
    <div className="mb-3 rounded-lg border border-gray-300 border-l-4 border-l-amber-600 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900">
            チェックイン：感謝（Thank you）
          </div>
          <p className="mt-0.5 text-xs text-gray-700">
            今週助けてくれた人やうまくいったことへの感謝を書き出しましょう
          </p>
        </div>
        {!props.readOnly ? (
          <button
            type="button"
            onClick={props.onAdd}
            className="shrink-0 rounded border border-gray-400 bg-white px-2 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50"
          >
            ＋ 付箋を追加
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap content-start gap-2">
        {props.notes.length === 0 ? (
          <div className="w-full rounded border border-dashed border-gray-400 bg-gray-50 px-2 py-4 text-center text-xs text-gray-600">
            付箋を追加してください。
          </div>
        ) : (
          props.notes.map((n) => (
            <FdlThankYouNoteCard
              key={n.id}
              note={n}
              readOnly={props.readOnly}
              assigneeCandidates={props.assigneeCandidates}
              assigneeColorByName={props.assigneeColorByName}
              onSetAssigneeColor={props.onSetAssigneeColor}
              onAddAssigneeCandidate={props.onAddAssigneeCandidate}
              onDeleteAssigneeCandidate={props.onDeleteAssigneeCandidate}
              onRenameAssigneeCandidate={props.onRenameAssigneeCandidate}
              authorPickerOpen={authorPickerNoteId === n.id}
              onAuthorPickerOpenChange={(open) =>
                setAuthorPickerNoteId(open ? n.id : null)
              }
              onUpdateText={props.onUpdateText}
              onUpdateAuthor={props.onUpdateAuthor}
              onUpdateSize={props.onUpdateSize}
              onDuplicate={props.onDuplicate}
              onDelete={props.onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FdlNextActionTextarea(props: {
  participant: string;
  serverText: string;
  readOnly?: boolean;
  onPersist: (participant: string, text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<string | null>(null);
  const onPersistRef = useRef(props.onPersist);
  onPersistRef.current = props.onPersist;

  const displayed = draft ?? props.serverText;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (draft !== null && draft === props.serverText) {
      setDraft(null);
    }
  }, [props.serverText, draft]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persist = useCallback(
    (text: string) => {
      if (props.readOnly) return;
      clearSaveTimer();
      onPersistRef.current(props.participant, text);
    },
    [clearSaveTimer, props.participant, props.readOnly],
  );

  const schedulePersist = useCallback(
    (text: string) => {
      if (props.readOnly) return;
      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        onPersistRef.current(props.participant, text);
      }, FDL_TEXT_SAVE_DEBOUNCE_MS);
    },
    [clearSaveTimer, props.participant, props.readOnly],
  );

  useEffect(() => {
    if (props.readOnly) return;
    return () => {
      clearSaveTimer();
      const pending = draftRef.current;
      if (pending !== null && pending !== props.serverText) {
        onPersistRef.current(props.participant, pending);
      }
    };
  }, [clearSaveTimer, props.participant, props.readOnly, props.serverText]);

  return (
    <textarea
      value={displayed}
      readOnly={props.readOnly}
      onChange={(e) => {
        if (props.readOnly) return;
        const next = e.target.value;
        setDraft(next);
        schedulePersist(next);
      }}
      onBlur={() => {
        if (props.readOnly) return;
        const next = draftRef.current ?? props.serverText;
        persist(next);
      }}
      placeholder="次にやること…"
      rows={3}
      className="min-h-[4.5rem] w-full resize-y rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none placeholder:text-gray-400 placeholder:italic focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
    />
  );
}

function FdlNextActionsBlock(props: {
  participants: string[];
  nextActionsByParticipant: Record<string, string>;
  assigneeColorByName: Record<string, AssigneeColorId>;
  readOnly?: boolean;
  onUpdateNextAction: (participant: string, text: string) => void;
}) {
  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      <div className="mb-2 text-xs font-bold text-gray-800">
        ネクストアクション
      </div>
      {props.participants.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-600">
          付箋に担当者を設定すると、ここにネクストアクションを記載できます
        </div>
      ) : (
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {props.participants.map((name) => (
            <div
              key={name}
              className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-gray-50/60 p-2"
            >
              <HappinessNoteAuthorLabel
                author={name}
                colorByName={props.assigneeColorByName}
              />
              <FdlNextActionTextarea
                participant={name}
                serverText={props.nextActionsByParticipant[name] ?? ""}
                readOnly={props.readOnly}
                onPersist={props.onUpdateNextAction}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FdlGrid(props: {
  notes: RetroFdlNote[];
  thankYouNotes: RetroThankYouNote[];
  nextActionsByParticipant: Record<string, string>;
  readOnly?: boolean;
  onCommit: (next: RetroFdlNote[]) => void;
  onAddWithTags: (tags: RetroFdlTag[], pos?: { x: number; y: number }) => void;
  onUpdateText: (id: string, text: string) => void;
  onUpdateAuthor: (id: string, author: string | undefined) => void;
  onUpdateNextAction: (participant: string, text: string) => void;
  onAddThankYouNote: () => void;
  onUpdateThankYouText: (id: string, text: string) => void;
  onUpdateThankYouAuthor: (id: string, author: string | undefined) => void;
  onUpdateThankYouSize: (id: string, width: number, height: number) => void;
  onDuplicateThankYouNote: (id: string) => void;
  onDeleteThankYouNote: (id: string) => void;
  assigneeCandidates: string[];
  assigneeColorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (name: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate?: (name: string) => void;
  onDeleteAssigneeCandidate?: (name: string) => void;
  onRenameAssigneeCandidate?: (from: string, to: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompactView, setIsCompactView] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const [resizeId, setResizeId] = useState<string | null>(null);
  const [resizeSize, setResizeSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    width: number;
    height: number;
    axis: FdlResizeAxis;
  } | null>(null);
  const resizeSizeRef = useRef(resizeSize);
  resizeSizeRef.current = resizeSize;
  const fdlNotesForResizeRef = useRef(props.notes);
  fdlNotesForResizeRef.current = props.notes;
  const commitNotesRef = useRef(props.onCommit);
  commitNotesRef.current = props.onCommit;
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [authorPickerNoteId, setAuthorPickerNoteId] = useState<string | null>(null);

  const effectiveSelectedNoteId = useMemo(() => {
    if (!selectedNoteId) return null;
    return props.notes.some((n) => n.id === selectedNoteId) ? selectedNoteId : null;
  }, [props.notes, selectedNoteId]);

  const nextActionParticipants = useMemo(
    () => fdlNextActionParticipantsFromNotes(props.notes),
    [props.notes],
  );

  useEffect(() => {
    if (props.readOnly) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "d") return;
      if (!effectiveSelectedNoteId) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        return;
      }
      if (el?.getAttribute("contenteditable") === "true") return;

      e.preventDefault();
      props.onDuplicate(effectiveSelectedNoteId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [effectiveSelectedNoteId, props.onDuplicate, props.readOnly]);

  const toggleZoomLevel = useCallback(() => {
    setIsCompactView((v) => !v);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== "Space") return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        el?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }
      e.preventDefault();
      toggleZoomLevel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleZoomLevel]);

  useEffect(() => {
    if (!resizeId) return;

    const onPointerMove = (e: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.startX;
      const dy = e.clientY - start.startY;
      let width = start.width;
      let height = start.height;
      if (start.axis === "se" || start.axis === "e") {
        width = clampNoteSize(
          start.width + dx,
          FDL_NOTE_MIN_WIDTH,
          FDL_NOTE_MAX_WIDTH,
        );
      }
      if (start.axis === "se" || start.axis === "s") {
        height = clampNoteSize(
          start.height + dy,
          FDL_NOTE_MIN_HEIGHT,
          FDL_NOTE_MAX_HEIGHT,
        );
      }
      setResizeSize({ width, height });
    };

    const finishResize = () => {
      const start = resizeStartRef.current;
      if (!start) return;
      const id = resizeId;
      const size = resizeSizeRef.current;
      resizeStartRef.current = null;
      setResizeId(null);
      setResizeSize(null);
      if (!size) return;
      const nextNotes = fdlNotesForResizeRef.current.map((n) =>
        n.id === id ? { ...n, width: size.width, height: size.height } : n,
      );
      commitNotesRef.current(nextNotes);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [resizeId]);

  const computeTagsForPos = useCallback(
    (x: number, y: number, fallback: RetroFdlTag[]) =>
      computeFdlTagsForPos(x, y, fallback),
    [],
  );

  const commitNotes = useCallback(
    (next: RetroFdlNote[]) => {
      props.onCommit(next);
    },
    [props],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, note: RetroFdlNote) => {
      if (props.readOnly) return;
      if (!isFdlNoteDragHandle(e.target)) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const { x: nx, y: ny } = fdlClientToNormalized(
        e.clientX,
        e.clientY,
        rect,
      );
      const cx = typeof note.x === "number" ? note.x : 0.5;
      const cy = typeof note.y === "number" ? note.y : 0.5;
      dragOffsetRef.current = { dx: cx - nx, dy: cy - ny };
      setDragId(note.id);
      setDragPos({ x: cx, y: cy });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [props.readOnly],
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, note: RetroFdlNote) => {
      if (props.readOnly) return;
      if (!isFdlNoteResizeHandle(e.target)) return;
      const axis = getFdlResizeAxis(e.target);
      if (!axis) return;
      setSelectedNoteId(note.id);
      resizeStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        width: fdlNoteWidth(note),
        height: fdlNoteHeight(note),
        axis,
      };
      setResizeId(note.id);
      setResizeSize({ width: fdlNoteWidth(note), height: fdlNoteHeight(note) });
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (resizeId) return;
      if (!dragId) return;
      if (!containerRef.current) return;
      if (!dragOffsetRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const { x: nx, y: ny } = fdlClientToNormalized(
        e.clientX,
        e.clientY,
        rect,
      );
      const x = clamp01(nx + dragOffsetRef.current.dx);
      const y = clamp01(ny + dragOffsetRef.current.dy);
      setDragPos({ x, y });
    },
    [dragId, resizeId],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (resizeId) return;

      if (!dragId) return;
      const id = dragId;
      const pos = dragPos;
      setDragId(null);
      dragOffsetRef.current = null;
      setDragPos(null);
      if (!pos) return;

      const cur = props.notes.find((n) => n.id === id);
      if (!cur) return;
      const nextTags = computeTagsForPos(pos.x, pos.y, cur.tags);
      const nextNotes = props.notes.map((n) =>
        n.id === id ? { ...n, x: pos.x, y: pos.y, tags: nextTags } : n,
      );
      commitNotes(nextNotes);
      e.preventDefault();
    },
    [commitNotes, computeTagsForPos, dragId, dragPos, props.notes],
  );

  const handleAddAtViewport = useCallback(() => {
    if (props.readOnly) return;
    const container = containerRef.current;
    const center = container ? fdlVisibleCenterNormalized(container) : null;
    if (center) {
      const tags = computeFdlTagsForPos(center.x, center.y, ["fun"]);
      props.onAddWithTags(tags, center);
      return;
    }
    props.onAddWithTags(["fun"]);
  }, [props.onAddWithTags, props.readOnly]);

  return (
    <section className="w-full rounded-lg border border-gray-300/80 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
      <div className="sticky top-0 z-30 -mx-3 -mt-3 mb-0.5 border-b border-gray-200/80 bg-white/95 px-3 py-1.5 backdrop-blur-sm">
        <div className="text-sm font-bold text-gray-800">FUN / DONE / LEARN</div>
      </div>

      <FdlThankYouBlock
        notes={props.thankYouNotes}
        readOnly={props.readOnly}
        assigneeCandidates={props.assigneeCandidates}
        assigneeColorByName={props.assigneeColorByName}
        onSetAssigneeColor={props.onSetAssigneeColor}
        onAddAssigneeCandidate={props.onAddAssigneeCandidate}
        onDeleteAssigneeCandidate={props.onDeleteAssigneeCandidate}
        onRenameAssigneeCandidate={props.onRenameAssigneeCandidate}
        onAdd={props.onAddThankYouNote}
        onUpdateText={props.onUpdateThankYouText}
        onUpdateAuthor={props.onUpdateThankYouAuthor}
        onUpdateSize={props.onUpdateThankYouSize}
        onDuplicate={props.onDuplicateThankYouNote}
        onDelete={props.onDeleteThankYouNote}
      />

      <div
        className="mx-auto mb-1 flex items-center justify-end gap-1 transition-[width] duration-200 ease-out"
        style={{
          width: isCompactView ? `${FDL_VIEWPORT_WIDTH_COMPACT * 100}%` : "100%",
        }}
      >
        <button
          type="button"
          onClick={toggleZoomLevel}
          className="min-w-[3.25rem] rounded border border-gray-300 bg-white px-2 py-1 text-xs tabular-nums text-gray-700 hover:bg-gray-50"
          title="80% ⇔ 100% を切り替え（Ctrl+Space）"
        >
          {isCompactView ? "80%" : "100%"}
        </button>
        {!props.readOnly ? (
          <button
            type="button"
            className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            onClick={handleAddAtViewport}
            title="付箋を追加（現在表示中の位置）"
          >
            付箋を追加
          </button>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="relative mx-auto overflow-hidden rounded-md bg-white transition-[width] duration-200 ease-out"
        style={{
          aspectRatio: "1",
          width: isCompactView ? `${FDL_VIEWPORT_WIDTH_COMPACT * 100}%` : "100%",
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => {
          if (e.target === containerRef.current) setSelectedNoteId(null);
        }}
      >
        {FDL_BLOCKS.map((b) => (
          <div
            key={`${b.tag}-fill`}
            className="pointer-events-none absolute rounded-[28px]"
            style={{
              left: `${b.x0 * 100}%`,
              top: `${b.y0 * 100}%`,
              width: `${(b.x1 - b.x0) * 100}%`,
              height: `${(b.y1 - b.y0) * 100}%`,
              background: FDL_AREA_STYLE[b.tag].bgFill,
            }}
          />
        ))}
        {FDL_EXCLUSIVE_ZONES.map(({ tags, rect }) => (
          <div
            key={`zone-${tags.join("-")}`}
            className="pointer-events-none absolute rounded-[20px]"
            style={{
              left: `${rect.x0 * 100}%`,
              top: `${rect.y0 * 100}%`,
              width: `${(rect.x1 - rect.x0) * 100}%`,
              height: `${(rect.y1 - rect.y0) * 100}%`,
              background: fdlAreaPreset(tags).fill,
            }}
          />
        ))}
        {FDL_OVERLAP_ZONES.map(({ tags, rect }) => (
          <div
            key={`zone-${tags.join("-")}`}
            className="pointer-events-none absolute rounded-[16px]"
            style={{
              left: `${rect.x0 * 100}%`,
              top: `${rect.y0 * 100}%`,
              width: `${(rect.x1 - rect.x0) * 100}%`,
              height: `${(rect.y1 - rect.y0) * 100}%`,
              background: fdlAreaPreset(tags).fill,
            }}
          />
        ))}
        {FDL_OVERLAP_ZONES.map(({ tags, rect }) => (
          <div
            key={`zone-label-${tags.join("-")}`}
            className="pointer-events-none absolute flex items-center justify-center px-1"
            style={{
              left: `${rect.x0 * 100}%`,
              top: `${rect.y0 * 100}%`,
              width: `${(rect.x1 - rect.x0) * 100}%`,
              height: `${(rect.y1 - rect.y0) * 100}%`,
            }}
          >
            <span
              className={`rounded bg-white/85 px-1.5 py-0.5 text-center font-medium leading-tight text-gray-800 shadow-sm ${
                tags.length >= 3 ? "text-[9px]" : "text-[10px]"
              }`}
            >
              {fdlOverlapZoneLabel(tags)}
            </span>
          </div>
        ))}
        {FDL_BLOCKS.map((b) => (
          <div
            key={b.tag}
            className="pointer-events-none absolute rounded-[28px]"
            style={{
              left: `${b.x0 * 100}%`,
              top: `${b.y0 * 100}%`,
              width: `${(b.x1 - b.x0) * 100}%`,
              height: `${(b.y1 - b.y0) * 100}%`,
              border: `2px solid ${b.stroke}`,
              background: "transparent",
            }}
          />
        ))}
        {FDL_BLOCKS.map((b) => (
          <div
            key={`${b.tag}-label`}
            className={`pointer-events-none absolute font-medium ${b.labelClass}`}
            style={{
              left: `${b.labelX * 100}%`,
              top: `${b.labelY * 100}%`,
              transform: "translate(-50%, -50%)",
              color: b.stroke,
            }}
          >
            {b.label}
          </div>
        ))}

        {/* notes */}
        {props.notes.map((n) => {
          const x = dragId === n.id && dragPos ? dragPos.x : (n.x ?? 0.5);
          const y = dragId === n.id && dragPos ? dragPos.y : (n.y ?? 0.5);
          const w =
            resizeId === n.id && resizeSize ? resizeSize.width : fdlNoteWidth(n);
          const h =
            resizeId === n.id && resizeSize ? resizeSize.height : fdlNoteHeight(n);
          const isActive = dragId === n.id || resizeId === n.id;
          const isSelected = effectiveSelectedNoteId === n.id;
          const showResizeHandles =
            !props.readOnly && (isSelected || isActive);
          const displayTags =
            dragId === n.id && dragPos
              ? computeTagsForPos(dragPos.x, dragPos.y, n.tags)
              : n.tags;
          const { ariaLabel, style: areaStyle } = fdlNoteAppearance(displayTags);
          return (
            <div
              key={n.id}
              role="group"
              aria-label={ariaLabel}
              className={`group/note absolute flex cursor-pointer flex-col overflow-hidden rounded px-2 py-1.5 shadow-sm ${
                isSelected
                  ? "ring-2 ring-blue-400 ring-offset-1"
                  : isActive
                    ? "ring-2 ring-blue-300"
                    : ""
              }`}
              style={{
                ...areaStyle,
                width: w,
                height: h,
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                transform: "translate(-50%, -50%)",
                touchAction: "none",
                zIndex: isActive ? 20 : 10,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNoteId(n.id);
              }}
              onPointerDown={(e) => handlePointerDown(e, n)}
            >
              <div
                className={`relative mb-0.5 shrink-0 border-b border-gray-200/80 pb-0.5 ${
                  props.readOnly ? "pr-0" : "pr-9"
                }`}
              >
                {!props.readOnly ? (
                  <>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDuplicate(n.id);
                      }}
                      className="absolute right-5 top-0 flex h-4 w-4 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-blue-100 hover:text-blue-600 hover:opacity-100"
                      aria-label="付箋を複製"
                      title="複製 (Ctrl+D)"
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDelete(n.id);
                      }}
                      className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-red-100 hover:text-red-600 hover:opacity-100"
                      aria-label="付箋を削除"
                      title="削除"
                    >
                      ×
                    </button>
                    <div
                      data-fdl-drag-handle
                      className="cursor-grab select-none text-center text-[10px] font-semibold text-gray-400 active:cursor-grabbing"
                      aria-label="ドラッグして移動"
                    >
                      ⋮⋮ 移動
                    </div>
                  </>
                ) : null}
              </div>
              <FdlNoteTextarea
                noteId={n.id}
                serverText={n.text}
                readOnly={props.readOnly}
                onPersist={props.onUpdateText}
              />
              <div className="mt-auto flex shrink-0 items-center pr-7 pt-0.5">
                <div className="min-w-0 max-w-full">
                  <AssigneeSinglePicker
                    value={n.author}
                    onChange={(name) => props.onUpdateAuthor(n.id, name)}
                    candidates={props.assigneeCandidates}
                    colorByName={props.assigneeColorByName}
                    onSetAssigneeColor={props.onSetAssigneeColor}
                    onAddCandidate={props.onAddAssigneeCandidate}
                    onDeleteCandidate={props.onDeleteAssigneeCandidate}
                    onRenameCandidate={props.onRenameAssigneeCandidate}
                    readOnly={props.readOnly}
                    isOpen={!props.readOnly && authorPickerNoteId === n.id}
                    onOpenChange={(open) =>
                      setAuthorPickerNoteId(open ? n.id : null)
                    }
                    placeholder="＋担当"
                  />
                </div>
              </div>
              {showResizeHandles ? (
                <>
                  <div
                    data-fdl-resize-handle
                    data-resize-axis="e"
                    role="separator"
                    aria-label="幅を変更"
                    onPointerDown={(e) => handleResizePointerDown(e, n)}
                    className="absolute bottom-7 right-0 top-7 z-[2] w-3 cursor-ew-resize touch-none hover:bg-blue-500/15"
                  />
                  <div
                    data-fdl-resize-handle
                    data-resize-axis="s"
                    role="separator"
                    aria-label="高さを変更"
                    onPointerDown={(e) => handleResizePointerDown(e, n)}
                    className="absolute bottom-0 left-2 right-7 z-[2] h-3 cursor-ns-resize touch-none hover:bg-blue-500/15"
                  />
                </>
              ) : null}
              <div
                data-fdl-resize-handle
                data-resize-axis="se"
                role="separator"
                aria-label="サイズを変更"
                onPointerDown={(e) => handleResizePointerDown(e, n)}
                className={`absolute bottom-0 right-0 z-[3] flex touch-none cursor-se-resize items-end justify-end hover:bg-blue-500/15 ${
                  showResizeHandles
                    ? "h-7 w-7 rounded-br pb-1 pr-1"
                    : "h-6 w-6 pb-0.5 pr-0.5 opacity-60 group-hover/note:opacity-100"
                }`}
              >
                <svg
                  viewBox="0 0 12 12"
                  className={`${showResizeHandles ? "h-4 w-4 text-blue-600" : "h-3 w-3 text-gray-500"} pointer-events-none`}
                  aria-hidden
                  fill="currentColor"
                >
                  <path d="M12 12H8V10h2V8h2v4zM10 10H6V8h2v2zM8 8H4V6h2v2z" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
      <FdlNextActionsBlock
        participants={nextActionParticipants}
        nextActionsByParticipant={props.nextActionsByParticipant}
        assigneeColorByName={props.assigneeColorByName}
        readOnly={props.readOnly}
        onUpdateNextAction={props.onUpdateNextAction}
      />
    </section>
  );
}

function HappinessNoteAuthorLabel(props: {
  author: string | undefined;
  colorByName: Record<string, AssigneeColorId>;
}) {
  if (!props.author) {
    return (
      <span className="text-[10px] text-gray-400">担当者未設定</span>
    );
  }
  const colorId =
    props.colorByName[props.author] ?? getFallbackAssigneeColorId(props.author);
  const { bgClass, textClass } = getAssigneeColorById(colorId);
  return (
    <span
      className={`inline-block max-w-full truncate rounded border border-black/15 px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm ${bgClass} ${textClass}`}
      title={props.author}
    >
      {props.author}
    </span>
  );
}

function isHappinessNoteOwnedByActive(
  note: RetroHappinessNote,
  activeParticipant: string | undefined,
): boolean {
  const active = activeParticipant?.trim();
  if (!active) return false;
  return (note.author?.trim() ?? "") === active;
}

function HappinessNoteCard(props: {
  note: RetroHappinessNote;
  activeParticipant: string | undefined;
  assigneeColorByName: Record<string, AssigneeColorId>;
  showAuthor?: boolean;
  readOnly?: boolean;
  onUpdateText: (id: string, text: string) => void | Promise<void>;
  onUpdateSize: (id: string, width: number, height: number) => void | Promise<void>;
  onPersistError?: (error: unknown) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const canModify =
    !props.readOnly &&
    isHappinessNoteOwnedByActive(props.note, props.activeParticipant);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [resizeSize, setResizeSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    width: number;
    height: number;
    axis: FdlResizeAxis;
  } | null>(null);
  const resizeSizeRef = useRef(resizeSize);
  resizeSizeRef.current = resizeSize;
  const onUpdateSizeRef = useRef(props.onUpdateSize);
  onUpdateSizeRef.current = props.onUpdateSize;
  const noteIdRef = useRef(props.note.id);
  noteIdRef.current = props.note.id;

  const displayText = draftText ?? props.note.text;
  const baseWidth = happinessNoteWidth(props.note, displayText);
  const baseHeight = happinessNoteHeight(props.note, displayText);
  const width = resizeSize?.width ?? baseWidth;
  const height = resizeSize?.height ?? baseHeight;
  const showResizeHandles = canModify && (selected || resizing);

  useEffect(() => {
    if (!resizing) return;

    const onPointerMove = (e: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.startX;
      const dy = e.clientY - start.startY;
      let nextW = start.width;
      let nextH = start.height;
      if (start.axis === "se" || start.axis === "e") {
        nextW = clampNoteSize(
          start.width + dx,
          HAPPINESS_NOTE_MIN_WIDTH,
          HAPPINESS_NOTE_MAX_WIDTH,
        );
      }
      if (start.axis === "se" || start.axis === "s") {
        nextH = clampNoteSize(
          start.height + dy,
          HAPPINESS_NOTE_MIN_HEIGHT,
          HAPPINESS_NOTE_MAX_HEIGHT,
        );
      }
      setResizeSize({ width: nextW, height: nextH });
    };

    const finishResize = () => {
      const start = resizeStartRef.current;
      const size = resizeSizeRef.current;
      resizeStartRef.current = null;
      setResizing(false);
      setResizeSize(null);
      if (!start || !size) return;
      onUpdateSizeRef.current(noteIdRef.current, size.width, size.height);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [resizing]);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    if (!canModify) return;
    if (!isFdlNoteResizeHandle(e.target)) return;
    const axis = getFdlResizeAxis(e.target);
    if (!axis) return;
    setSelected(true);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      width: baseWidth,
      height: baseHeight,
      axis,
    };
    setResizing(true);
    setResizeSize({ width: baseWidth, height: baseHeight });
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="group"
      aria-label="幸福指標の付箋"
      className={`group/note relative flex shrink-0 flex-col overflow-hidden rounded px-2 py-1.5 shadow-sm ${
        selected ? "ring-2 ring-blue-400 ring-offset-1" : ""
      }`}
      style={{
        ...FDL_NOTE_APPEARANCE,
        width,
        height,
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelected(true);
      }}
    >
      <div className="mb-0.5 flex h-5 shrink-0 items-center justify-end gap-0.5 border-b border-gray-200/80 pb-0.5">
        {canModify ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onDuplicate(props.note.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-blue-100 hover:text-blue-600 hover:opacity-100"
            aria-label="付箋を複製"
            title="複製"
          >
            ⧉
          </button>
        ) : null}
        {canModify ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete(props.note.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-red-100 hover:text-red-600 hover:opacity-100"
            aria-label="付箋を削除"
            title="削除"
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-0.5">
        <FdlNoteTextarea
          noteId={props.note.id}
          serverText={props.note.text}
          readOnly={!canModify}
          saveDebounceMs={HAPPINESS_TEXT_SAVE_DEBOUNCE_MS}
          onPersist={props.onUpdateText}
          onPersistError={props.onPersistError}
          onDraftChange={setDraftText}
        />
      </div>
      {props.showAuthor ? (
        <div className="mt-auto flex shrink-0 items-center pt-0.5 pr-7">
          <HappinessNoteAuthorLabel
            author={props.note.author}
            colorByName={props.assigneeColorByName}
          />
        </div>
      ) : null}
      {showResizeHandles ? (
        <>
          <div
            data-fdl-resize-handle
            data-resize-axis="e"
            role="separator"
            aria-label="幅を変更"
            onPointerDown={handleResizePointerDown}
            className="absolute bottom-0 right-0 top-5 z-[2] w-3 cursor-ew-resize touch-none hover:bg-blue-500/15"
          />
          <div
            data-fdl-resize-handle
            data-resize-axis="s"
            role="separator"
            aria-label="高さを変更"
            onPointerDown={handleResizePointerDown}
            className="absolute bottom-0 left-2 right-7 z-[2] h-3 cursor-ns-resize touch-none hover:bg-blue-500/15"
          />
        </>
      ) : null}
      <div
        data-fdl-resize-handle
        data-resize-axis="se"
        role="separator"
        aria-label="サイズを変更"
        onPointerDown={handleResizePointerDown}
        className={`absolute bottom-0 right-0 z-[3] flex touch-none cursor-se-resize items-end justify-end hover:bg-blue-500/15 ${
          showResizeHandles
            ? "h-7 w-7 rounded-br pb-1 pr-1"
            : "h-6 w-6 pb-0.5 pr-0.5 opacity-60 group-hover/note:opacity-100"
        }`}
      >
        <svg
          viewBox="0 0 12 12"
          className={`${showResizeHandles ? "h-4 w-4 text-blue-600" : "h-3 w-3 text-gray-500"} pointer-events-none`}
          aria-hidden
          fill="currentColor"
        >
          <path d="M12 12H8V10h2V8h2v4zM10 10H6V8h2v2zM8 8H4V6h2v2z" />
        </svg>
      </div>
    </div>
  );
}

function HappinessNotesAuthorBlock(props: {
  authorKey: string;
  displayName: string;
  notes: RetroHappinessNote[];
  isActiveParticipant: boolean;
  activeParticipant: string | undefined;
  assigneeColorByName: Record<string, AssigneeColorId>;
  readOnly?: boolean;
  onAdd: (author: string) => void;
  onUpdate: (id: string, text: string) => void | Promise<void>;
  onUpdateSize: (id: string, width: number, height: number) => void | Promise<void>;
  onPersistError?: (error: unknown) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const canAdd =
    !props.readOnly && props.isActiveParticipant && props.authorKey.length > 0;

  return (
    <div
      className={`rounded-lg border p-2 ${
        props.isActiveParticipant
          ? "border-blue-300 bg-blue-50/50"
          : "border-gray-200 bg-gray-50/60"
      }`}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {props.authorKey ? (
            <HappinessNoteAuthorLabel
              author={props.authorKey}
              colorByName={props.assigneeColorByName}
            />
          ) : (
            <span className="text-[11px] font-semibold text-gray-500">
              {props.displayName}
            </span>
          )}
          <span className="text-[10px] text-gray-500">{props.notes.length}枚</span>
        </div>
        {canAdd ? (
          <button
            type="button"
            onClick={() => props.onAdd(props.authorKey)}
            className="shrink-0 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            title={`入力者「${props.displayName}」として付箋を追加`}
          >
            ＋
          </button>
        ) : null}
      </header>
      <div className="flex flex-wrap content-start gap-2">
        {props.notes.length === 0 ? (
          <div className="w-full rounded border border-dashed border-gray-300/80 px-2 py-3 text-center text-[11px] text-gray-500">
            付箋なし
          </div>
        ) : (
          props.notes.map((n) => (
            <HappinessNoteCard
              key={n.id}
              note={n}
              readOnly={props.readOnly}
              activeParticipant={props.activeParticipant}
              assigneeColorByName={props.assigneeColorByName}
              onUpdateText={props.onUpdate}
              onUpdateSize={props.onUpdateSize}
              onPersistError={props.onPersistError}
              onDuplicate={props.onDuplicate}
              onDelete={props.onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function HappinessNotesColumn(props: {
  readOnly?: boolean;
  title: string;
  notes: RetroHappinessNote[];
  participants: string[];
  scoresByParticipant: Record<string, RetroHappinessScores>;
  activeParticipant: string | undefined;
  assigneeColorByName: Record<string, AssigneeColorId>;
  onAdd: (author: string) => void;
  onUpdate: (id: string, text: string) => void | Promise<void>;
  onUpdateSize: (id: string, width: number, height: number) => void | Promise<void>;
  onPersistError?: (error: unknown) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  accentClass: string;
}) {
  const sectionNames = useMemo(
    () =>
      resolveHappinessNoteSectionNames(
        props.scoresByParticipant,
        props.participants,
        props.notes,
        props.activeParticipant,
      ),
    [
      props.activeParticipant,
      props.notes,
      props.participants,
      props.scoresByParticipant,
    ],
  );

  const authorGroups = useMemo(
    () => groupHappinessNotesByAuthor(props.notes, sectionNames),
    [props.notes, sectionNames],
  );

  const handleAddForAuthor = useCallback(
    (author: string) => {
      const active = props.activeParticipant?.trim();
      if (!active) {
        window.alert("付箋を追加する前に、上の「入力者」を選択してください。");
        return;
      }
      const target = author.trim();
      if (target !== active) {
        window.alert(
          `付箋は入力者「${active}」としてのみ追加できます。\n上の入力者を切り替えてから追加してください。`,
        );
        return;
      }
      props.onAdd(active);
    },
    [props.activeParticipant, props.onAdd],
  );

  const hasAnyNotes = props.notes.length > 0;
  const hasAnyGroups = authorGroups.length > 0;

  return (
    <section className="flex min-w-[320px] flex-1 flex-col gap-2 rounded-lg border border-gray-300/80 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
      <header className="flex items-center justify-between gap-2">
        <div className={`text-sm font-extrabold ${props.accentClass}`}>
          {props.title}
        </div>
        {!props.readOnly ? (
          <button
            type="button"
            onClick={() => {
              const active = props.activeParticipant?.trim();
              if (active) handleAddForAuthor(active);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.activeParticipant?.trim()}
            title={
              props.activeParticipant
                ? `入力者「${props.activeParticipant}」として追加`
                : "入力者を選んでから追加"
            }
          >
            ＋
          </button>
        ) : null}
      </header>
      <div className="border-b border-gray-100 pb-2">
        {sectionNames.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-semibold text-gray-500">
              上記マトリクスの入力者
            </span>
            {sectionNames.map((name) => (
              <HappinessNoteAuthorLabel
                key={name}
                author={name}
                colorByName={props.assigneeColorByName}
              />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-500">
            マトリクスに点数を入力すると、ここに名前が表示されます
          </p>
        )}
      </div>
      <div className="flex min-h-[120px] flex-col gap-2">
        {!hasAnyGroups && !hasAnyNotes ? (
          <div className="rounded border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500">
            マトリクスで点数を入力してから、付箋を追加してください
          </div>
        ) : null}
        {authorGroups.map((group) => (
          <HappinessNotesAuthorBlock
            key={group.authorKey || "__unassigned__"}
            authorKey={group.authorKey}
            displayName={group.displayName}
            notes={group.notes}
            isActiveParticipant={
              !!props.activeParticipant &&
              props.activeParticipant === group.authorKey
            }
            activeParticipant={props.activeParticipant}
            assigneeColorByName={props.assigneeColorByName}
            readOnly={props.readOnly}
            onAdd={handleAddForAuthor}
            onUpdate={props.onUpdate}
            onUpdateSize={props.onUpdateSize}
            onPersistError={props.onPersistError}
            onDuplicate={props.onDuplicate}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </section>
  );
}

const HAPPINESS_SCORE_ROWS: {
  key: keyof RetroHappinessScores;
  label: string;
}[] = [
  { key: "role", label: "役割" },
  { key: "team", label: "チーム" },
  { key: "company", label: "会社" },
];

function HappinessInputBlock(props: {
  activeParticipant: string | undefined;
  assigneeCandidates: string[];
  /** 他ユーザーが入力中で選択できない担当者 */
  disabledAssignees?: string[];
  scoresByParticipant: Record<string, RetroHappinessScores>;
  assigneeColorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (name: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate?: (name: string) => void;
  onDeleteAssigneeCandidate?: (name: string) => void;
  onRenameAssigneeCandidate?: (from: string, to: string) => void;
  readOnly?: boolean;
  onSelectParticipant: (name: string | undefined) => void;
  onSelectScore: (
    row: "role" | "team" | "company",
    value: number | null,
  ) => void;
}) {

  const activeScores = props.activeParticipant
    ? (props.scoresByParticipant[props.activeParticipant] ??
      emptyRetroHappinessScores())
    : emptyRetroHappinessScores();

  const activeComplete = isRetroHappinessScoresComplete(activeScores);

  return (
    <section className="w-full rounded-lg border border-gray-300/80 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-sm font-bold text-gray-800">幸福指標（1〜5）</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">入力者</span>
          <AssigneeSinglePicker
            value={props.activeParticipant}
            onChange={(name) => {
              props.onSelectParticipant(name);
            }}
            candidates={props.assigneeCandidates}
            disabledCandidates={props.disabledAssignees}
            colorByName={props.assigneeColorByName}
            onSetAssigneeColor={props.onSetAssigneeColor}
            onAddCandidate={props.onAddAssigneeCandidate}
            onDeleteCandidate={props.onDeleteAssigneeCandidate}
            onRenameCandidate={props.onRenameAssigneeCandidate}
            readOnly={props.readOnly}
            allowClear={false}
            toggleClearOnReselect
            placeholder="入力者を選択"
            renderCandidateSuffix={(name) => {
              const complete = isRetroHappinessScoresComplete(
                props.scoresByParticipant[name],
              );
              const isLocked = (props.disabledAssignees ?? []).includes(name);
              return (
                <span
                  className={`shrink-0 text-[10px] font-bold ${
                    complete ? "text-emerald-800" : "text-gray-500"
                  }`}
                >
                  {isLocked ? "入力中" : complete ? "完了" : "未"}
                </span>
              );
            }}
          />
          {props.activeParticipant ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                activeComplete
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {activeComplete ? "入力完了" : "未入力あり"}
            </span>
          ) : (
            <span className="text-[11px] text-gray-500">
              名前を選んでから点数を入力してください
            </span>
          )}
        </div>
      </div>
      <HappinessTable
        scores={activeScores}
        scoresByParticipant={props.scoresByParticipant}
        assigneeColorByName={props.assigneeColorByName}
        activeParticipant={props.activeParticipant}
        disabled={props.readOnly || !props.activeParticipant}
        onSelect={props.onSelectScore}
      />
    </section>
  );
}

function HappinessNameLabel(props: {
  name: string;
  isSelf: boolean;
  colorByName: Record<string, AssigneeColorId>;
}) {
  const colorId =
    props.colorByName[props.name] ?? getFallbackAssigneeColorId(props.name);
  const { bgClass, textClass } = getAssigneeColorById(colorId);
  return (
    <span
      className={`max-w-full truncate rounded border border-black/10 px-1 py-px text-[10px] font-semibold leading-tight shadow-sm ${bgClass} ${textClass} ${
        props.isSelf ? "ring-1 ring-blue-600" : ""
      }`}
      title={props.name}
    >
      {props.name}
    </span>
  );
}

function HappinessTable(props: {
  scores: RetroHappinessScores;
  scoresByParticipant: Record<string, RetroHappinessScores>;
  assigneeColorByName: Record<string, AssigneeColorId>;
  activeParticipant?: string;
  disabled?: boolean;
  onSelect: (row: "role" | "team" | "company", value: number | null) => void;
}) {
  const rows = HAPPINESS_SCORE_ROWS;
  const cellLabels = useMemo(
    () => buildHappinessCellLabels(props.scoresByParticipant),
    [props.scoresByParticipant],
  );

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-[640px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-2 py-2 text-left"></th>
              {[1, 2, 3, 4, 5].map((v) => (
                <th
                  key={v}
                  className="border border-gray-200 bg-gray-50 px-2 py-2 text-center"
                >
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="border border-gray-200 bg-gray-50 px-2 py-2 font-semibold text-gray-800">
                  {r.label}
                </td>
                {[1, 2, 3, 4, 5].map((v) => {
                  const selected = props.scores[r.key] === v;
                  const namesInCell = cellLabels[r.key][v] ?? [];
                  const hasLabels = namesInCell.length > 0;
                  return (
                    <td key={v} className="border border-gray-200 p-1 align-top">
                      <button
                        type="button"
                        disabled={props.disabled}
                        onClick={() =>
                          props.onSelect(r.key, selected ? null : v)
                        }
                        title={
                          selected
                            ? "クリックで選択を解除"
                            : `${r.label}を${v}点にする`
                        }
                        className={`flex min-h-[52px] w-full min-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded border px-1 py-1 text-xs ${
                          props.disabled
                            ? "cursor-not-allowed border-gray-200 bg-gray-50"
                            : selected
                              ? "border-blue-600 bg-blue-50/80 hover:bg-red-50/60"
                              : "border-gray-300 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex w-full flex-wrap items-center justify-center gap-0.5">
                          {hasLabels ? (
                            namesInCell.map((name) => (
                              <HappinessNameLabel
                                key={name}
                                name={name}
                                isSelf={props.activeParticipant === name}
                                colorByName={props.assigneeColorByName}
                              />
                            ))
                          ) : (
                            <span className="h-4 w-full" aria-hidden />
                          )}
                        </div>
                        {selected && !props.disabled ? (
                          <span className="text-[10px] font-bold text-blue-700">
                            ✓ 選択中
                          </span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RetrospectiveCanvas({
  boardId,
  sprintKey,
  readOnly: readOnlyProp = false,
  showFacilitationRow = true,
}: Props) {
  const {
    assigneeCandidates,
    assigneeColorByName,
    setAssigneeColorForName,
    addAssigneeCandidate,
    deleteAssigneeCandidate,
    renameAssigneeCandidate,
    getRetroSession,
    getRetroDraft,
    getRetroFacilitation,
    isRetroSessionLoaded,
    isRetroDraftLoaded,
    isRetroFacilitationLoaded,
    createOrReplaceRetroSession,
    updateRetroSession,
    mergeRetroFdlNotes,
    mergeRetroFdlThankYouNotes,
    mergeRetroHappinessNotes,
    patchRetroHappinessNote,
    updateRetroFacilitation,
    getLatestRetroFacilitationParticipants,
    deleteRetroSession,
    safeSwitchRetroFramework,
    burndownSprint,
  } = usePlanningData();

  const session = getRetroSession(boardId, sprintKey);
  const facilitation = getRetroFacilitation(sprintKey);

  const sessionBusinessDays = useMemo(() => {
    if (!session) {
      return buildDefaultBusinessDayIsos(sprintKey);
    }
    return resolveRetroBusinessDayIsos(session, {
      activeSprintKey: burndownSprint.activeSprintTuesdayIso,
      activeSprintBusinessDayIsos: burndownSprint.businessDayIsos,
    });
  }, [burndownSprint.activeSprintTuesdayIso, burndownSprint.businessDayIsos, session, sprintKey]);

  const sprintDisplayLabel = useMemo(() => {
    return (
      formatBusinessDayRange(sessionBusinessDays) ??
      formatBurndownDayLabel(sprintKey)
    );
  }, [sessionBusinessDays, sprintKey]);

  const isEditable = useMemo(() => {
    if (readOnlyProp) return false;
    if (isRetroSessionArchived(session)) return false;
    if (session && !session.archivedAt && isRetroArchiveDue(sessionBusinessDays)) {
      return false;
    }
    return true;
  }, [readOnlyProp, session, sessionBusinessDays]);

  const sessionLoaded = isRetroSessionLoaded(boardId, sprintKey);
  const facilitationLoaded = isRetroFacilitationLoaded(sprintKey);
  const allBoardDraftsLoaded = BOARD_ORDER.every((id) =>
    isRetroDraftLoaded(id, sprintKey),
  );

  const [frameworkPickerOpen, setFrameworkPickerOpen] = useState(false);
  const [isSwitchMode, setIsSwitchMode] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);
  const [activeHappinessParticipant, setActiveHappinessParticipant] = useState<
    string | undefined
  >(undefined);
  const happinessMigratedRef = useRef<string | null>(null);
  const myHappinessLockParticipantRef = useRef<string | null>(null);

  const happinessLockClientId = useMemo(() => {
    if (typeof window === "undefined") return "server";
    const key = "retroHappinessLockClientId:v1";
    try {
      const existing = localStorage.getItem(key);
      if (existing?.trim()) return existing.trim();
      const created =
        (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
        `c_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem(key, created);
      return created;
    } catch {
      return `c_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const initialParticipants = useMemo(() => {
    const uniq = Array.from(
      new Set((assigneeCandidates ?? []).map((x) => x.trim()).filter(Boolean)),
    );
    return uniq;
  }, [assigneeCandidates]);

  const lastParticipantsRef = useRef<string[]>([]);
  const sprintKeyRef = useRef(sprintKey);
  const participantsSyncedKeyRef = useRef<string | null>(null);
  const facilitationMigratedRef = useRef<string | null>(null);
  const facilitationSeededRef = useRef<string | null>(null);
  if (sprintKeyRef.current !== sprintKey) {
    sprintKeyRef.current = sprintKey;
    lastParticipantsRef.current = readCachedFacilitationParticipants(sprintKey);
    participantsSyncedKeyRef.current = null;
    facilitationMigratedRef.current = null;
    facilitationSeededRef.current = null;
    happinessMigratedRef.current = null;
    setActiveHappinessParticipant(undefined);
  }

  // ボード別 retro_drafts から共通 facilitation へ一度だけ移行
  useEffect(() => {
    if (!facilitationLoaded || !allBoardDraftsLoaded) return;
    if (facilitationMigratedRef.current === sprintKey) return;

    if (facilitation?.participants && facilitation.participants.length > 0) {
      facilitationMigratedRef.current = sprintKey;
      return;
    }

    let bestUpdatedAt = "";
    let bestParticipants: string[] | null = null;
    for (const id of BOARD_ORDER) {
      const d = getRetroDraft(id, sprintKey);
      if (!d?.participants?.length) continue;
      if (!bestParticipants || d.updatedAt > bestUpdatedAt) {
        bestUpdatedAt = d.updatedAt;
        bestParticipants = d.participants;
      }
    }

    if (!bestParticipants) {
      facilitationMigratedRef.current = sprintKey;
      return;
    }

    const participantsToMigrate = bestParticipants;
    void (async () => {
      try {
        const existing = await fetchRetroFacilitationDoc(sprintKey);
        if (existing?.participants?.length) {
          facilitationMigratedRef.current = sprintKey;
          return;
        }
        facilitationMigratedRef.current = sprintKey;
        await updateRetroFacilitation(sprintKey, {
          sprintKey,
          participants: participantsToMigrate,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        facilitationMigratedRef.current = null;
        console.error(err);
      }
    })();
  }, [
    allBoardDraftsLoaded,
    facilitation?.participants,
    facilitationLoaded,
    getRetroDraft,
    sprintKey,
    updateRetroFacilitation,
  ]);

  // 新スプリントで facilitation が空のとき、直近の参加者順を引き継ぐ
  useEffect(() => {
    if (!showFacilitationRow || !isEditable) return;
    if (!facilitationLoaded) return;
    if (facilitation?.participants && facilitation.participants.length > 0) {
      facilitationSeededRef.current = sprintKey;
      return;
    }
    if (facilitationSeededRef.current === sprintKey) return;

    const inherited = getLatestRetroFacilitationParticipants();
    if (inherited.length === 0) {
      facilitationSeededRef.current = sprintKey;
      return;
    }

    const participantsToSeed = inherited;
    void (async () => {
      try {
        const existing = await fetchRetroFacilitationDoc(sprintKey);
        if (existing?.participants?.length) {
          facilitationSeededRef.current = sprintKey;
          return;
        }
        facilitationSeededRef.current = sprintKey;
        await updateRetroFacilitation(sprintKey, {
          sprintKey,
          participants: participantsToSeed,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        facilitationSeededRef.current = null;
        console.error(err);
      }
    })();
  }, [
    facilitation?.participants,
    facilitationLoaded,
    getLatestRetroFacilitationParticipants,
    isEditable,
    showFacilitationRow,
    sprintKey,
    updateRetroFacilitation,
  ]);

  const participants = useMemo(() => {
    if (!isEditable && session) {
      const archived = session.archivedParticipants ?? session.participants ?? [];
      if (archived.length > 0) return archived;
    }

    const cached = readCachedFacilitationParticipants(sprintKey);
    const dataReady = facilitationLoaded;

    // ファシリ順の正は全ボード共通の retro_facilitation
    if (facilitation?.participants && facilitation.participants.length > 0) {
      lastParticipantsRef.current = facilitation.participants;
      return facilitation.participants;
    }

    // Firestore 読み込み完了まで、キャッシュまたは直前の並びを維持
    if (!dataReady) {
      if (cached.length > 0) {
        lastParticipantsRef.current = cached;
        return cached;
      }
      return lastParticipantsRef.current;
    }

    // 未開始かつ DB に共通データ無し: キャッシュ優先、なければ担当者一覧
    if (!session) {
      if (cached.length > 0) {
        lastParticipantsRef.current = cached;
        return cached;
      }
      if (initialParticipants.length > 0) {
        return initialParticipants;
      }
    }

    if (cached.length > 0) {
      lastParticipantsRef.current = cached;
      return cached;
    }

    return lastParticipantsRef.current;
  }, [
    facilitation?.participants,
    facilitationLoaded,
    initialParticipants,
    isEditable,
    session,
    sprintKey,
  ]);

  // セッションと共通 facilitation の参加者順が食い違う場合、共通側へセッションを合わせる
  useEffect(() => {
    if (!isEditable) return;
    const syncKey = `${boardId}:${sprintKey}`;
    if (!sessionLoaded || !facilitationLoaded) return;
    if (!session) return;
    if (!facilitation?.participants?.length) return;
    if (participantsSyncedKeyRef.current === syncKey) return;

    const globalList = facilitation.participants;
    const sessionList = session.participants ?? [];
    if (participantsEqual(globalList, sessionList)) {
      participantsSyncedKeyRef.current = syncKey;
      return;
    }

    participantsSyncedKeyRef.current = syncKey;
    void updateRetroSession(boardId, sprintKey, {
      participants: globalList,
      updatedAt: new Date().toISOString(),
    });
  }, [
    boardId,
    facilitation?.participants,
    facilitationLoaded,
    session,
    sessionLoaded,
    sprintKey,
    updateRetroSession,
    isEditable,
  ]);

  const facilitatorName = participants.length > 0 ? participants[0] : "";

  const normalizedHappiness = useMemo(() => {
    return normalizeRetroHappinessData(session?.happiness, {
      legacyAssignTo: participants[0],
    });
  }, [session?.happiness, participants]);

  const HAPPINESS_LOCK_TTL_MS = 2 * 60 * 1000;
  const HAPPINESS_LOCK_HEARTBEAT_MS = 30 * 1000;

  const activeHappinessLocksByParticipant = useMemo(() => {
    const locks = facilitation?.happinessLocks ?? {};
    const now = Date.now();
    const out: Record<string, NonNullable<NonNullable<typeof locks>[string]>> = {};
    for (const [participant, raw] of Object.entries(locks)) {
      if (!raw) continue;
      const exp = Date.parse(raw.expiresAt);
      if (!Number.isFinite(exp) || exp <= now) continue;
      out[participant] = raw;
    }
    return out;
  }, [facilitation?.happinessLocks]);

  const disabledHappinessParticipants = useMemo(() => {
    const out: string[] = [];
    for (const [participant, lock] of Object.entries(
      activeHappinessLocksByParticipant,
    )) {
      if (lock.clientId === happinessLockClientId) continue;
      out.push(participant);
    }
    return out;
  }, [activeHappinessLocksByParticipant, happinessLockClientId]);

  const setHappinessParticipantLock = useCallback(
    async (participant: string, locked: boolean) => {
      if (!isEditable) return;
      const nowIso = new Date().toISOString();
      if (!locked) {
        await updateRetroFacilitation(sprintKey, {
          happinessLocks: { [participant]: null },
          updatedAt: nowIso,
        } as any);
        return;
      }
      const expiresAt = new Date(Date.now() + HAPPINESS_LOCK_TTL_MS).toISOString();
      await updateRetroFacilitation(sprintKey, {
        happinessLocks: {
          [participant]: { clientId: happinessLockClientId, updatedAt: nowIso, expiresAt },
        },
        updatedAt: nowIso,
      } as any);
    },
    [HAPPINESS_LOCK_TTL_MS, happinessLockClientId, isEditable, sprintKey, updateRetroFacilitation],
  );

  useEffect(() => {
    if (!isEditable) return;
    if (session?.framework !== "happiness") return;
    const participant = activeHappinessParticipant?.trim();
    if (!participant) return;
    const lock = activeHappinessLocksByParticipant[participant];
    if (!lock || lock.clientId !== happinessLockClientId) return;

    const id = window.setInterval(() => {
      void setHappinessParticipantLock(participant, true).catch(console.error);
    }, HAPPINESS_LOCK_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [
    HAPPINESS_LOCK_HEARTBEAT_MS,
    activeHappinessLocksByParticipant,
    activeHappinessParticipant,
    happinessLockClientId,
    isEditable,
    setHappinessParticipantLock,
    session?.framework,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(retroHappinessActiveStorageKey(sprintKey));
      if (saved?.trim()) setActiveHappinessParticipant(saved.trim());
    } catch {
      /* ignore */
    }
  }, [sprintKey]);

  useEffect(() => {
    if (!activeHappinessParticipant || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        retroHappinessActiveStorageKey(sprintKey),
        activeHappinessParticipant,
      );
    } catch {
      /* ignore */
    }
  }, [activeHappinessParticipant, sprintKey]);

  useEffect(() => {
    if (session?.framework !== "happiness") return;
    if (activeHappinessParticipant) return;
    if (participants.length === 1) {
      setActiveHappinessParticipant(participants[0]);
    }
  }, [activeHappinessParticipant, participants, session?.framework]);

  useEffect(() => {
    if (!activeHappinessParticipant) return;
    const inList = participants.includes(activeHappinessParticipant);
    const inScores =
      activeHappinessParticipant in normalizedHappiness.scoresByParticipant;
    if (inList || inScores) return;
    setActiveHappinessParticipant(
      participants.length > 0 ? participants[0] : undefined,
    );
  }, [
    activeHappinessParticipant,
    normalizedHappiness.scoresByParticipant,
    participants,
  ]);

  // 旧 scores（共有1セット）→ scoresByParticipant へ1回だけ永続化
  useEffect(() => {
    if (!isEditable) return;
    if (!sessionLoaded || !session || session.framework !== "happiness") return;
    const migrateKey = `${boardId}:${sprintKey}`;
    if (happinessMigratedRef.current === migrateKey) return;

    const raw = session.happiness as
      | (NonNullable<RetroSession["happiness"]> & {
          scores?: RetroHappinessScores;
        })
      | undefined;
    const legacy = raw?.scores;
    const legacyHasValue =
      legacy &&
      (legacy.role != null || legacy.team != null || legacy.company != null);
    const mapEmpty =
      !raw?.scoresByParticipant ||
      Object.keys(raw.scoresByParticipant).length === 0;

    if (!legacyHasValue || !mapEmpty) {
      happinessMigratedRef.current = migrateKey;
      return;
    }

    happinessMigratedRef.current = migrateKey;
    const normalized = normalizeRetroHappinessData(raw, {
      legacyAssignTo: participants[0],
    });
    void updateRetroSession(boardId, sprintKey, {
      happiness: normalized,
      updatedAt: new Date().toISOString(),
    });
  }, [
    boardId,
    participants,
    session,
    sessionLoaded,
    sprintKey,
    updateRetroSession,
    isEditable,
  ]);

  const persistParticipants = useCallback(
    async (nextParticipants: string[]) => {
      if (!isEditable) return;
      const now = new Date().toISOString();
      try {
        await updateRetroFacilitation(sprintKey, {
          sprintKey,
          participants: nextParticipants,
          updatedAt: now,
        });
        if (session) {
          await updateRetroSession(boardId, sprintKey, {
            participants: nextParticipants,
            updatedAt: now,
          });
        }
      } catch (err) {
        console.error(err);
        window.alert(
          "担当者の並び順の保存に失敗しました。ネットワーク接続を確認してから再度お試しください。",
        );
      }
    },
    [boardId, isEditable, session, sprintKey, updateRetroFacilitation, updateRetroSession],
  );

  const normalizeParticipants = useCallback((list: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const n = raw.trim();
      if (!n) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }, []);

  const handleRenameAt = useCallback(
    async (index: number, nextName: string) => {
      if (!isEditable) return;
      const oldName = (participants[index] ?? "").trim();
      const trimmedNext = nextName.trim();
      const next = participants.map((v, i) => (i === index ? nextName : v));
      const nextParticipants = normalizeParticipants(next);
      await persistParticipants(nextParticipants);

      if (
        session?.framework === "happiness" &&
        oldName &&
        trimmedNext &&
        oldName !== trimmedNext
      ) {
        const happiness = normalizeRetroHappinessData(session.happiness, {
          legacyAssignTo: nextParticipants[0],
        });
        const scoresByParticipant = renameHappinessParticipantKey(
          happiness.scoresByParticipant,
          oldName,
          trimmedNext,
        );
        const reasons = renameHappinessNoteAuthors(
          happiness.reasons,
          oldName,
          trimmedNext,
        );
        const improvements = renameHappinessNoteAuthors(
          happiness.improvements,
          oldName,
          trimmedNext,
        );
        const happinessChanged =
          scoresByParticipant !== happiness.scoresByParticipant ||
          reasons !== happiness.reasons ||
          improvements !== happiness.improvements;
        if (happinessChanged) {
          await updateRetroSession(boardId, sprintKey, {
            happiness: {
              ...happiness,
              scoresByParticipant,
              reasons,
              improvements,
            },
            updatedAt: new Date().toISOString(),
          });
        }
        if (activeHappinessParticipant === oldName) {
          setActiveHappinessParticipant(trimmedNext);
        }
      }

      if (
        session?.framework === "fdl" &&
        oldName &&
        trimmedNext &&
        oldName !== trimmedNext
      ) {
        const fdl = session.fdl ?? defaultRetroFdlData();
        const nextActionsByParticipant = renameRecordKey<string>(
          fdl.nextActionsByParticipant ?? {},
          oldName,
          trimmedNext,
        );
        const thankYouNotes = renameHappinessNoteAuthors(
          fdl.thankYouNotes ?? [],
          oldName,
          trimmedNext,
        );
        const fdlChanged =
          nextActionsByParticipant !== (fdl.nextActionsByParticipant ?? {}) ||
          thankYouNotes !== (fdl.thankYouNotes ?? []);
        if (fdlChanged) {
          await updateRetroSession(boardId, sprintKey, {
            fdl: { ...fdl, nextActionsByParticipant, thankYouNotes },
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
    [
      activeHappinessParticipant,
      boardId,
      normalizeParticipants,
      participants,
      persistParticipants,
      session,
      sprintKey,
      updateRetroSession,
    ],
  );

  const handleDeleteAt = useCallback(
    async (index: number) => {
      if (!isEditable) return;
      const target = participants[index] ?? "";
      if (
        !window.confirm(
          `「${target || "（未設定）"}」を担当者から削除しますか？\n\n入力済みのスコアやネクストアクションも削除されます。`,
        )
      ) {
        return;
      }
      const next = participants.filter((_, i) => i !== index);
      await persistParticipants(next);

      const targetTrimmed = target.trim();
      if (session?.framework === "happiness" && targetTrimmed) {
        const happiness = normalizeRetroHappinessData(session.happiness, {
          legacyAssignTo: next[0],
        });
        const scoresByParticipant = deleteHappinessParticipantKey(
          happiness.scoresByParticipant,
          targetTrimmed,
        );
        if (scoresByParticipant !== happiness.scoresByParticipant) {
          await updateRetroSession(boardId, sprintKey, {
            happiness: { ...happiness, scoresByParticipant },
            updatedAt: new Date().toISOString(),
          });
        }
        if (activeHappinessParticipant === targetTrimmed) {
          setActiveHappinessParticipant(next[0]);
        }
      }

      if (session?.framework === "fdl" && targetTrimmed) {
        const fdl = session.fdl ?? defaultRetroFdlData();
        const nextActionsByParticipant = deleteRecordKey<string>(
          fdl.nextActionsByParticipant ?? {},
          targetTrimmed,
        );
        if (nextActionsByParticipant !== (fdl.nextActionsByParticipant ?? {})) {
          await updateRetroSession(boardId, sprintKey, {
            fdl: { ...fdl, nextActionsByParticipant },
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
    [
      activeHappinessParticipant,
      boardId,
      participants,
      persistParticipants,
      session,
      sprintKey,
      updateRetroSession,
    ],
  );

  const handleAdd = useCallback(
    async (name: string) => {
      if (!isEditable) return;
      const next = normalizeParticipants([...participants, name]);
      await persistParticipants(next);
    },
    [normalizeParticipants, participants, persistParticipants],
  );

  const handleCreate = useCallback(
    async (framework: RetroFramework) => {
      if (!isEditable) return;
      const list =
        facilitation?.participants?.length
          ? facilitation.participants
          : participants.length > 0
            ? participants
            : initialParticipants;
      const s = createRetroSession({
        sprintKey,
        framework,
        participants: list,
        businessDayIsos: buildDefaultBusinessDayIsos(sprintKey),
      });
      await createOrReplaceRetroSession(s);
    },
    [
      boardId,
      sprintKey,
      createOrReplaceRetroSession,
      facilitation?.participants,
      initialParticipants,
      isEditable,
      participants,
    ],
  );

  const handleSwitch = useCallback(
    async (framework: RetroFramework) => {
      if (!isEditable) return;
      if (!session) return;
      const msg =
        "フレームワークを変更しますか？\n\n誤操作対策として、変更前の状態は「Undo」で戻せます。\n（付箋やスコアが消える可能性があります）";
      if (!window.confirm(msg)) return;

      if (framework === "fdl") {
        await safeSwitchRetroFramework({
          boardId,
          sprintKey,
          nextFramework: "fdl",
          nextData: { fdl: defaultRetroFdlData(), happiness: undefined },
        });
      } else {
        await safeSwitchRetroFramework({
          boardId,
          sprintKey,
          nextFramework: "happiness",
          nextData: { fdl: undefined, happiness: defaultRetroHappinessData() },
        });
      }
      setUndoVisible(true);
      window.setTimeout(() => setUndoVisible(false), 12000);
    },
    [boardId, sprintKey, safeSwitchRetroFramework, session],
  );

  const handleUndo = useCallback(async () => {
    if (!isEditable) return;
    if (!session?.previous) return;
    const prev = session.previous;
    await updateRetroSession(boardId, sprintKey, {
      framework: prev.framework,
      participants: prev.participants,
      facilitatorIndex: prev.facilitatorIndex,
      fdl: prev.fdl,
      happiness: prev.happiness,
      previous: undefined,
      updatedAt: new Date().toISOString(),
    });
    setUndoVisible(false);
  }, [boardId, sprintKey, session, updateRetroSession]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!isEditable) return;
      const { active, over } = event;
      if (!over) return;
      if (active.id === over.id) return;

      const ids = participants;
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const next = arrayMove(ids, oldIndex, newIndex);
      await persistParticipants(next);
    },
    [isEditable, participants, persistParticipants],
  );

  const handleRotateParticipants = useCallback(async () => {
    if (!isEditable || participants.length < 2) return;
    const next = [...participants.slice(1), participants[0]!];
    await persistParticipants(next);
  }, [isEditable, participants, persistParticipants]);

  const handleRotateParticipantsBack = useCallback(async () => {
    if (!isEditable || participants.length < 2) return;
    const last = participants[participants.length - 1]!;
    const next = [last, ...participants.slice(0, -1)];
    await persistParticipants(next);
  }, [isEditable, participants, persistParticipants]);

  const applyFdlNotesMerge = useCallback(
    async (merge: (server: RetroFdlNote[]) => RetroFdlNote[]) => {
      if (!isEditable) return undefined;
      if (!session || session.framework !== "fdl") return undefined;
      return await mergeRetroFdlNotes(sprintKey, merge);
    },
    [isEditable, mergeRetroFdlNotes, session, sprintKey],
  );

  const applyFdlThankYouMerge = useCallback(
    async (merge: (server: RetroThankYouNote[]) => RetroThankYouNote[]) => {
      if (!isEditable) return undefined;
      if (!session || session.framework !== "fdl") return undefined;
      return await mergeRetroFdlThankYouNotes(sprintKey, merge);
    },
    [isEditable, mergeRetroFdlThankYouNotes, session, sprintKey],
  );

  const fdlNotes = useMemo(() => {
    if (!session || session.framework !== "fdl") return [];
    return normalizeFdlNotes(session.fdl);
  }, [session]);

  const thankYouNotes = useMemo(() => {
    if (!session || session.framework !== "fdl") return [];
    return session.fdl?.thankYouNotes ?? [];
  }, [session]);

  const retroAssigneeCandidates = useMemo(() => {
    const names = new Set<string>();
    for (const c of assigneeCandidates) {
      const n = c.trim();
      if (n) names.add(n);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ja-JP"));
  }, [assigneeCandidates]);

  const fdlNotesRef = useRef(fdlNotes);
  fdlNotesRef.current = fdlNotes;

  const thankYouNotesRef = useRef(thankYouNotes);
  thankYouNotesRef.current = thankYouNotes;

  // legacy(3配列) → v2(notes+tags) へ1回だけ移行
  const fdlMigratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEditable) return;
    if (!sessionLoaded) return;
    if (!session || session.framework !== "fdl") return;
    if (fdlMigratedRef.current === `${boardId}:${sprintKey}`) return;

    const anyFdl = session.fdl as any;
    if (anyFdl?.notes?.length) {
      fdlMigratedRef.current = `${boardId}:${sprintKey}`;
      return;
    }
    const legacyHasAny =
      (anyFdl?.fun?.length ?? 0) > 0 ||
      (anyFdl?.done?.length ?? 0) > 0 ||
      (anyFdl?.learn?.length ?? 0) > 0;
    if (!legacyHasAny) return;

    fdlMigratedRef.current = `${boardId}:${sprintKey}`;
    const migrated = normalizeFdlNotes(session.fdl);
    void applyFdlNotesMerge(() => migrated);
  }, [boardId, sprintKey, session, sessionLoaded, applyFdlNotesMerge]);

  const addFdlNoteWithTags = useCallback(
    async (tags: RetroFdlTag[], viewportPos?: { x: number; y: number }) => {
      if (!session || session.framework !== "fdl") return;
      const sameZoneCount = fdlNotes.filter((n) => tagsEqual(n.tags, tags)).length;
      const seed = Date.now() + sameZoneCount * 9973;
      const base =
        viewportPos ??
        defaultPosForTags(tags, seed);
      const nudge = sameZoneCount * 0.025;
      const pos = viewportPos
        ? {
            x: clamp01(base.x + (seededJitter(seed) - 0.5) * 0.04 + nudge),
            y: clamp01(base.y + (seededJitter(seed + 1) - 0.5) * 0.04 + nudge * 0.6),
          }
        : base;
      const newNote: RetroFdlNote = {
        ...createRetroNote(),
        tags,
        x: pos.x,
        y: pos.y,
        width: FDL_NOTE_DEFAULT_WIDTH,
        height: FDL_NOTE_DEFAULT_HEIGHT,
      };
      await applyFdlNotesMerge((server) => mergeNotesById(server, [newNote]));
    },
    [fdlNotes, session, applyFdlNotesMerge],
  );

  const commitFdlNotes = useCallback(
    async (next: RetroFdlNote[]) => {
      if (!session || session.framework !== "fdl") return;
      await applyFdlNotesMerge((server) => mergeNotesById(server, next));
    },
    [session, applyFdlNotesMerge],
  );

  const updateFdlNoteText = useCallback(
    (id: string, text: string) => {
      if (!session || session.framework !== "fdl") return;
      void applyFdlNotesMerge((server) => patchNoteInList(server, id, { text }));
    },
    [session, applyFdlNotesMerge],
  );

  const updateFdlNoteAuthor = useCallback(
    async (id: string, author: string | undefined) => {
      if (!session || session.framework !== "fdl") return;
      const source = fdlNotesRef.current.find((n) => n.id === id);
      const oldName = source?.author?.trim() ?? "";
      const trimmed = author?.trim();
      const nextNotes = await applyFdlNotesMerge((server) =>
        server.map((n) => {
          if (n.id !== id) return n;
          if (!trimmed) {
            const { author: _removed, ...rest } = n;
            return rest as RetroFdlNote;
          }
          return { ...n, author: trimmed };
        }),
      );
      if (!nextNotes) return;

      if (oldName && trimmed && oldName !== trimmed) {
        const fdl = session.fdl ?? defaultRetroFdlData();
        const prev = fdl.nextActionsByParticipant ?? {};
        const nextActionsByParticipant = renameRecordKey<string>(
          prev,
          oldName,
          trimmed,
        );
        if (nextActionsByParticipant !== prev) {
          await updateRetroSession(boardId, sprintKey, {
            fdl: {
              ...fdl,
              notes: nextNotes,
              nextActionsByParticipant,
            },
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
    [boardId, session, sprintKey, applyFdlNotesMerge, updateRetroSession],
  );

  const duplicateFdlNote = useCallback(
    async (id: string) => {
      if (!session || session.framework !== "fdl") return;
      const source = fdlNotesRef.current.find((n) => n.id === id);
      if (!source) return;
      const clone: RetroFdlNote = {
        ...createRetroNote(source.text),
        tags: [...source.tags],
        ...(source.author ? { author: source.author } : {}),
        x: clamp01((source.x ?? 0.5) + 0.03),
        y: clamp01((source.y ?? 0.5) + 0.03),
        width: fdlNoteWidth(source),
        height: fdlNoteHeight(source),
      };
      await applyFdlNotesMerge((server) => mergeNotesById(server, [clone]));
    },
    [session, applyFdlNotesMerge],
  );

  const deleteFdlNote = useCallback(
    async (id: string) => {
      if (!session || session.framework !== "fdl") return;
      await applyFdlNotesMerge((server) => removeNoteFromList(server, id));
    },
    [session, applyFdlNotesMerge],
  );

  const addThankYouNote = useCallback(async () => {
    if (!session || session.framework !== "fdl") return;
    await applyFdlThankYouMerge((server) =>
      mergeNotesById(server, [createRetroThankYouNote()]),
    );
  }, [session, applyFdlThankYouMerge]);

  const updateThankYouNoteText = useCallback(
    (id: string, text: string) => {
      if (!session || session.framework !== "fdl") return;
      void applyFdlThankYouMerge((server) => patchNoteInList(server, id, { text }));
    },
    [session, applyFdlThankYouMerge],
  );

  const updateThankYouNoteAuthor = useCallback(
    async (id: string, author: string | undefined) => {
      if (!session || session.framework !== "fdl") return;
      const source = thankYouNotesRef.current.find((n) => n.id === id);
      const oldName = source?.author?.trim() ?? "";
      const trimmed = author?.trim();
      const nextNotes = await applyFdlThankYouMerge((server) =>
        server.map((n) => {
          if (n.id !== id) return n;
          if (!trimmed) {
            const { author: _removed, ...rest } = n;
            return rest as RetroThankYouNote;
          }
          return { ...n, author: trimmed };
        }),
      );
      if (!nextNotes) return;

      if (oldName && trimmed && oldName !== trimmed) {
        const fdl = session.fdl ?? defaultRetroFdlData();
        const prev = fdl.nextActionsByParticipant ?? {};
        const nextActionsByParticipant = renameRecordKey<string>(
          prev,
          oldName,
          trimmed,
        );
        if (nextActionsByParticipant !== prev) {
          await updateRetroSession(boardId, sprintKey, {
            fdl: {
              ...fdl,
              thankYouNotes: nextNotes,
              nextActionsByParticipant,
            },
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
    [boardId, session, sprintKey, applyFdlThankYouMerge, updateRetroSession],
  );

  const updateThankYouNoteSize = useCallback(
    (id: string, width: number, height: number) => {
      if (!session || session.framework !== "fdl") return;
      void applyFdlThankYouMerge((server) =>
        patchNoteInList(server, id, { width, height }),
      );
    },
    [session, applyFdlThankYouMerge],
  );

  const duplicateThankYouNote = useCallback(
    async (id: string) => {
      if (!session || session.framework !== "fdl") return;
      const source = thankYouNotesRef.current.find((n) => n.id === id);
      if (!source) return;
      await applyFdlThankYouMerge((server) =>
        mergeNotesById(server, [duplicateRetroThankYouNote(source)]),
      );
    },
    [session, applyFdlThankYouMerge],
  );

  const deleteThankYouNote = useCallback(
    async (id: string) => {
      if (!session || session.framework !== "fdl") return;
      await applyFdlThankYouMerge((server) => removeNoteFromList(server, id));
    },
    [session, applyFdlThankYouMerge],
  );

  const updateFdlNextAction = useCallback(
    async (participant: string, text: string) => {
      if (!isEditable) return;
      if (!session || session.framework !== "fdl") return;
      const name = participant.trim();
      if (!name) return;
      const fdl = session.fdl ?? defaultRetroFdlData();
      const prev = fdl.nextActionsByParticipant ?? {};
      if ((prev[name] ?? "") === text) return;
      await updateRetroSession(boardId, sprintKey, {
        fdl: {
          ...fdl,
          nextActionsByParticipant: { ...prev, [name]: text },
        },
        updatedAt: new Date().toISOString(),
      });
    },
    [boardId, isEditable, session, sprintKey, updateRetroSession],
  );

  const updateHappiness = useCallback(
    async (patch: Partial<NonNullable<RetroSession["happiness"]>>) => {
      if (!isEditable) return;
      if (!session) return;
      const happiness = normalizeRetroHappinessData(session.happiness, {
        legacyAssignTo: participants[0],
      });
      await updateRetroSession(boardId, sprintKey, {
        happiness: { ...happiness, ...patch },
        updatedAt: new Date().toISOString(),
      });
    },
    [boardId, isEditable, participants, sprintKey, session, updateRetroSession],
  );

  const reportHappinessSaveError = useCallback((err: unknown) => {
    console.error(err);
    window.alert(
      "付箋の保存に失敗しました。しばらく待ってから再度お試しください。",
    );
  }, []);

  const applyHappinessReasonsMerge = useCallback(
    async (merge: (server: RetroHappinessNote[]) => RetroHappinessNote[]) => {
      if (!isEditable || !session) return;
      try {
        await mergeRetroHappinessNotes(sprintKey, "reasons", merge);
      } catch (err) {
        reportHappinessSaveError(err);
      }
    },
    [
      isEditable,
      mergeRetroHappinessNotes,
      reportHappinessSaveError,
      session,
      sprintKey,
    ],
  );

  const applyHappinessImprovementsMerge = useCallback(
    async (merge: (server: RetroHappinessNote[]) => RetroHappinessNote[]) => {
      if (!isEditable || !session) return;
      try {
        await mergeRetroHappinessNotes(sprintKey, "improvements", merge);
      } catch (err) {
        reportHappinessSaveError(err);
      }
    },
    [
      isEditable,
      mergeRetroHappinessNotes,
      reportHappinessSaveError,
      session,
      sprintKey,
    ],
  );

  const patchHappinessReasonNote = useCallback(
    async (noteId: string, patch: Partial<Omit<RetroHappinessNote, "id">>) => {
      if (!isEditable || !session) return;
      try {
        await patchRetroHappinessNote(sprintKey, "reasons", noteId, patch);
      } catch (err) {
        reportHappinessSaveError(err);
      }
    },
    [
      isEditable,
      patchRetroHappinessNote,
      reportHappinessSaveError,
      session,
      sprintKey,
    ],
  );

  const patchHappinessImprovementNote = useCallback(
    async (noteId: string, patch: Partial<Omit<RetroHappinessNote, "id">>) => {
      if (!isEditable || !session) return;
      try {
        await patchRetroHappinessNote(sprintKey, "improvements", noteId, patch);
      } catch (err) {
        reportHappinessSaveError(err);
      }
    },
    [
      isEditable,
      patchRetroHappinessNote,
      reportHappinessSaveError,
      session,
      sprintKey,
    ],
  );

  const openCreatePicker = useCallback(() => {
    setIsSwitchMode(false);
    setFrameworkPickerOpen(true);
  }, []);

  const openSwitchPicker = useCallback(() => {
    setIsSwitchMode(true);
    setFrameworkPickerOpen(true);
  }, []);

  const handleDeleteSession = useCallback(async () => {
    if (!isEditable) return;
    if (!session) return;
    const frameworkLabel =
      session.framework === "fdl" ? "FUN/DONE/LEARN" : "幸福指標";
    const message = `このスプリント（${sprintKey}）の振り返り（${frameworkLabel}）を削除しますか？\n\n付箋・スコアなどの内容はすべて消えます。担当者の並び順は保持されます。`;
    if (!window.confirm(message)) return;
    const now = new Date().toISOString();
    await updateRetroFacilitation(sprintKey, {
      sprintKey,
      participants,
      updatedAt: now,
    });
    await deleteRetroSession(boardId, sprintKey);
    setUndoVisible(false);
  }, [boardId, deleteRetroSession, participants, session, sprintKey, updateRetroFacilitation]);

  return (
    <div className="flex w-full min-w-[900px] flex-col gap-3">
      {/* ファシリテーション（常に上部表示） */}
      {!isEditable ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          この振り返りは読み取り専用です（編集できません）。
        </div>
      ) : null}

      {showFacilitationRow ? (
        <FacilitationRow
          participants={participants}
          facilitatorName={facilitatorName}
          readOnly={!isEditable}
          onDragEnd={handleDragEnd}
          onRenameAt={handleRenameAt}
          onDeleteAt={handleDeleteAt}
          onRotate={handleRotateParticipants}
          onRotateBack={handleRotateParticipantsBack}
          onAdd={handleAdd}
        />
      ) : null}

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-bold text-gray-800">振り返り</div>
          <div className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700">
            {sprintDisplayLabel}
          </div>
          {session ? (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
              {session.framework === "fdl" ? "FUN/DONE/LEARN" : "幸福指標"}
            </span>
          ) : (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              未開始
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {session && isEditable ? (
            <>
              <button
                type="button"
                onClick={openSwitchPicker}
                className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                フレームワーク変更
              </button>
              <button
                type="button"
                onClick={handleDeleteSession}
                className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                振り返りを削除
              </button>
            </>
          ) : null}

          {isEditable ? (
            <button
              type="button"
              onClick={openCreatePicker}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
            >
              ＋
            </button>
          ) : null}
        </div>
      </section>

      {undoVisible && session?.previous ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <div className="min-w-0 truncate">
            フレームワークを変更しました。必要なら Undo できます。
          </div>
          <button
            type="button"
            onClick={handleUndo}
            className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
          >
            Undo
          </button>
        </div>
      ) : null}

      {!session ? (
        <div className="rounded-lg border border-gray-300/80 bg-white/90 px-4 py-10 text-center text-sm text-gray-700 shadow-sm backdrop-blur-sm">
          {isEditable
            ? "振り返りを開始してください。"
            : "この期間の振り返りデータはありません。"}
        </div>
      ) : session.framework === "fdl" ? (
        <FdlGrid
          notes={fdlNotes}
          thankYouNotes={thankYouNotes}
          nextActionsByParticipant={
            session.fdl?.nextActionsByParticipant ?? {}
          }
          readOnly={!isEditable}
          onCommit={commitFdlNotes}
          onAddWithTags={addFdlNoteWithTags}
          onUpdateText={updateFdlNoteText}
          onUpdateAuthor={updateFdlNoteAuthor}
          onUpdateNextAction={updateFdlNextAction}
          onAddThankYouNote={addThankYouNote}
          onUpdateThankYouText={updateThankYouNoteText}
          onUpdateThankYouAuthor={updateThankYouNoteAuthor}
          onUpdateThankYouSize={updateThankYouNoteSize}
          onDuplicateThankYouNote={duplicateThankYouNote}
          onDeleteThankYouNote={deleteThankYouNote}
          assigneeCandidates={retroAssigneeCandidates}
          assigneeColorByName={assigneeColorByName}
          onSetAssigneeColor={setAssigneeColorForName}
          onAddAssigneeCandidate={addAssigneeCandidate}
          onDeleteAssigneeCandidate={deleteAssigneeCandidate}
          onRenameAssigneeCandidate={renameAssigneeCandidate}
          onDuplicate={duplicateFdlNote}
          onDelete={deleteFdlNote}
        />
      ) : (
        <div className="flex w-full flex-col gap-3">
          <HappinessInputBlock
            activeParticipant={activeHappinessParticipant}
            assigneeCandidates={retroAssigneeCandidates}
            disabledAssignees={disabledHappinessParticipants}
            scoresByParticipant={normalizedHappiness.scoresByParticipant}
            assigneeColorByName={assigneeColorByName}
            onSetAssigneeColor={setAssigneeColorForName}
            readOnly={!isEditable}
            onSelectParticipant={(name) => {
              if (!name?.trim()) {
                setActiveHappinessParticipant(undefined);
                try {
                  localStorage.removeItem(retroHappinessActiveStorageKey(sprintKey));
                } catch {
                  /* ignore */
                }
                const prev = myHappinessLockParticipantRef.current;
                myHappinessLockParticipantRef.current = null;
                if (prev) {
                  void setHappinessParticipantLock(prev, false).catch(console.error);
                }
                return;
              }
              const n = name.trim();
              if (disabledHappinessParticipants.includes(n)) {
                window.alert(`「${n}」は他ユーザーが入力中のため選択できません。`);
                return;
              }
              setActiveHappinessParticipant(n);

              const prev = myHappinessLockParticipantRef.current;
              if (prev && prev !== n) {
                void setHappinessParticipantLock(prev, false).catch(console.error);
              }
              myHappinessLockParticipantRef.current = n;
              void setHappinessParticipantLock(n, true).catch(console.error);

              if (!(n in normalizedHappiness.scoresByParticipant)) {
                updateHappiness({
                  scoresByParticipant: {
                    ...normalizedHappiness.scoresByParticipant,
                    [n]: emptyRetroHappinessScores(),
                  },
                });
              }
            }}
            onSelectScore={(row, value) => {
              const name = activeHappinessParticipant?.trim();
              if (!name) return;
              updateHappiness({
                scoresByParticipant: patchHappinessParticipantScore(
                  normalizedHappiness.scoresByParticipant,
                  name,
                  row,
                  value,
                ),
              });
            }}
          />
          <div className="flex w-full flex-row flex-wrap items-stretch gap-3">
            <HappinessNotesColumn
              title="理由（上記の理由）"
              accentClass="text-gray-800"
              readOnly={!isEditable}
              notes={normalizedHappiness.reasons}
              participants={participants}
              scoresByParticipant={normalizedHappiness.scoresByParticipant}
              activeParticipant={activeHappinessParticipant}
              assigneeColorByName={assigneeColorByName}
              onPersistError={reportHappinessSaveError}
              onAdd={(author) =>
                void applyHappinessReasonsMerge((server) =>
                  mergeNotesById(server, [createRetroHappinessNote("", author)]),
                )
              }
              onUpdate={(id, text) => patchHappinessReasonNote(id, { text })}
              onUpdateSize={(id, width, height) =>
                patchHappinessReasonNote(id, { width, height })
              }
              onDuplicate={(id) => {
                const source = normalizedHappiness.reasons.find((n) => n.id === id);
                if (!source) return;
                const active = activeHappinessParticipant?.trim();
                if (!isHappinessNoteOwnedByActive(source, active)) {
                  window.alert(
                    active
                      ? `付箋は入力者「${active}」のものだけ複製できます。`
                      : "付箋を複製する前に、上の「入力者」を選択してください。",
                  );
                  return;
                }
                void applyHappinessReasonsMerge((server) =>
                  mergeNotesById(server, [duplicateRetroHappinessNote(source)]),
                );
              }}
              onDelete={(id) =>
                void applyHappinessReasonsMerge((server) =>
                  removeNoteFromList(server, id),
                )
              }
            />
            <HappinessNotesColumn
              title="どうすればより幸せになれる？"
              accentClass="text-gray-800"
              readOnly={!isEditable}
              notes={normalizedHappiness.improvements}
              participants={participants}
              scoresByParticipant={normalizedHappiness.scoresByParticipant}
              activeParticipant={activeHappinessParticipant}
              assigneeColorByName={assigneeColorByName}
              onPersistError={reportHappinessSaveError}
              onAdd={(author) =>
                void applyHappinessImprovementsMerge((server) =>
                  mergeNotesById(server, [
                    createRetroHappinessNote("", author),
                  ]),
                )
              }
              onUpdate={(id, text) =>
                patchHappinessImprovementNote(id, { text })
              }
              onUpdateSize={(id, width, height) =>
                patchHappinessImprovementNote(id, { width, height })
              }
              onDuplicate={(id) => {
                const source = normalizedHappiness.improvements.find(
                  (n) => n.id === id,
                );
                if (!source) return;
                const active = activeHappinessParticipant?.trim();
                if (!isHappinessNoteOwnedByActive(source, active)) {
                  window.alert(
                    active
                      ? `付箋は入力者「${active}」のものだけ複製できます。`
                      : "付箋を複製する前に、上の「入力者」を選択してください。",
                  );
                  return;
                }
                void applyHappinessImprovementsMerge((server) =>
                  mergeNotesById(server, [duplicateRetroHappinessNote(source)]),
                );
              }}
              onDelete={(id) =>
                void applyHappinessImprovementsMerge((server) =>
                  removeNoteFromList(server, id),
                )
              }
            />
          </div>
        </div>
      )}

      <SmallModal
        title={isSwitchMode ? "フレームワーク変更" : "フレームワーク選択"}
        isOpen={frameworkPickerOpen}
        onClose={() => setFrameworkPickerOpen(false)}
      >
        <div className="space-y-3">
          <div className="text-xs text-gray-700">
            {isSwitchMode
              ? "変更すると付箋/スコアが初期化される可能性があります。誤操作対策として Undo できます。"
              : "振り返りに使用するフレームワークを選んでください。"}
          </div>

          <div className="grid grid-cols-1 gap-2">
            {FRAMEWORKS.map((fw) => (
              <button
                key={fw.id}
                type="button"
                onClick={async () => {
                  setFrameworkPickerOpen(false);
                  if (!session) {
                    await handleCreate(fw.id);
                  } else {
                    await handleSwitch(fw.id);
                  }
                }}
                className="rounded-lg border border-gray-300 p-3 text-left hover:bg-gray-50"
              >
                <div className="text-sm font-bold text-gray-800">{fw.title}</div>
                <div className="mt-1 text-xs text-gray-600">{fw.description}</div>
              </button>
            ))}
          </div>
        </div>
      </SmallModal>
    </div>
  );
}

