'use client';

type WorkingOverlayProps = {
  active: boolean;
  title: string;
  description: string;
  className?: string;
};

export function WorkingOverlay({
  active,
  title,
  description,
  className,
}: WorkingOverlayProps) {
  if (!active) {
    return null;
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`absolute inset-0 z-30 flex items-center justify-center ${className ?? ''}`}
    >
      <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" />
      <div className="relative mx-4 flex max-w-md flex-col items-center rounded-3xl border border-white/10 bg-gray-950/95 px-6 py-5 text-center shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/40 bg-blue-500/10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200/30 border-t-blue-300" />
        </div>
        <div className="mt-4 text-base font-semibold text-white">{title}</div>
        <div className="mt-2 text-sm text-gray-300">{description}</div>
      </div>
    </div>
  );
}
