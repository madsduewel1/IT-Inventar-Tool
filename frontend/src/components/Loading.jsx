export function Spinner({ size = 28, className = '' }) {
  return (
    <span className={`spinner ${className}`} style={{ width: size, height: size }} aria-label="Wird geladen" role="status" />
  );
}

export function PageLoader({ text = 'Wird geladen…', className = '' }) {
  return (
    <div className={`flex min-h-56 flex-col items-center justify-center gap-4 ${className}`}>
      <Spinner size={36} />
      <div className="text-sm text-muted">{text}</div>
    </div>
  );
}

export function SkeletonBlock({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function ListSkeleton({ rows = 6, card = false }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        card ? (
          <div key={i} className="card overflow-hidden p-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-3.5 w-2/5 rounded" />
                <SkeletonBlock className="h-3 w-3/5 rounded" />
              </div>
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
            <SkeletonBlock className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-3.5 w-2/5 rounded" />
              <SkeletonBlock className="h-3 w-1/2 rounded" />
            </div>
          </div>
        )
      ))}
    </div>
  );
}