export function CanvasBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-full min-h-0 min-w-[1280px] flex-1 flex-col overflow-hidden bg-[#f0f0f0]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, #c8c8c8 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        aria-hidden
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col p-4">
        {children}
      </div>
    </div>
  );
}
