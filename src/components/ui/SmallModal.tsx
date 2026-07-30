"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export function SmallModal(props: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { isOpen, onClose } = props;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const portalTarget = useMemo(() => {
    if (!mounted) return null;
    if (typeof document === "undefined") return null;
    return document.body;
  }, [mounted]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full justify-center">
        <div
          className="my-auto flex w-full max-w-lg max-h-[calc(100dvh-2rem)] min-h-0 flex-col rounded-lg border border-gray-300 bg-white shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
            <div className="text-sm font-bold text-gray-800">{props.title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
            >
              閉じる
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
        </div>
      </div>
    </div>
  );

  // body 直下へ出すことで、親要素の transform 影響を受けず常に画面中央に固定される
  return portalTarget ? createPortal(content, portalTarget) : content;
}

