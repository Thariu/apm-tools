"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeRequestUrl } from "@/lib/urlUtils";

type BacklogTitleWithLinkProps = {
  title: string;
  requestUrl?: string;
  onChange: (patch: { title: string; requestUrl: string }) => void;
};

function stopBubble(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const LINK_DISPLAY_CLASS =
  "block min-w-0 flex-1 cursor-text whitespace-pre-wrap rounded border border-sky-300 bg-sky-50/50 px-1 py-0.5 text-xs font-medium leading-snug text-sky-700 hover:bg-sky-50";

const PLAIN_DISPLAY_CLASS =
  "block min-w-0 flex-1 cursor-text whitespace-pre-wrap rounded px-0.5 text-xs font-medium leading-snug text-gray-900 hover:bg-black/5";

export function BacklogTitleWithLink({
  title,
  requestUrl,
  onChange,
}: BacklogTitleWithLinkProps) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [urlDraft, setUrlDraft] = useState(requestUrl ?? "");
  const editRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const safeUrl = requestUrl?.trim()
    ? normalizeRequestUrl(requestUrl)
    : undefined;

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setTitleDraft(title);
    setUrlDraft(requestUrl ?? "");
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const normalizedUrl = normalizeRequestUrl(urlDraft);
    onChange({
      title: titleDraft.trim(),
      requestUrl: normalizedUrl ?? "",
    });
    setUrlDraft(normalizedUrl ?? "");
  };

  const cancel = () => {
    setTitleDraft(title);
    setUrlDraft(requestUrl ?? "");
    setEditing(false);
  };

  const handleEditBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && editRef.current?.contains(next)) return;
    commit();
  };

  if (editing) {
    return (
      <div
        ref={editRef}
        className="space-y-1.5 rounded border border-blue-400 bg-white p-1.5 ring-1 ring-blue-200"
        onBlur={handleEditBlur}
        onPointerDown={stopBubble}
      >
        <textarea
          ref={titleRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          rows={2}
          placeholder=""
          className="min-h-6 w-full resize-y rounded border border-gray-200 px-1 py-0.5 text-xs font-medium text-gray-900 outline-none placeholder:text-gray-400 placeholder:italic focus:border-blue-400"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-gray-500">
            リンクURL
          </label>
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://..."
            className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-900 outline-none placeholder:text-gray-400 placeholder:italic focus:border-blue-400"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
        </div>
      </div>
    );
  }

  const isPlaceholder = !title.trim();

  return (
    <div className="flex items-start gap-1" onPointerDown={stopBubble}>
      <span
        role="button"
        tabIndex={0}
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") startEdit();
        }}
        className={[
          isPlaceholder
            ? "block min-h-6 min-w-0 flex-1 cursor-text whitespace-pre-wrap rounded px-0.5 text-xs font-medium leading-snug text-gray-400 italic hover:bg-black/5"
            : safeUrl
              ? LINK_DISPLAY_CLASS
              : PLAIN_DISPLAY_CLASS,
        ].join(" ")}
      >
        {isPlaceholder ? "Backlog" : title}
      </span>
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="依頼ページを開く"
          aria-label="依頼ページを新しいタブで開く"
          onClick={stopBubble}
          onPointerDown={stopBubble}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sky-300 text-[10px] text-sky-700 hover:bg-sky-100"
        >
          ↗
        </a>
      ) : null}
    </div>
  );
}
