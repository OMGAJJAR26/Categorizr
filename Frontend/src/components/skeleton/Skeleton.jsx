// Building blocks for skeleton (placeholder) loading screens. Each page skeleton in this
// folder is assembled from these and reuses the page's own layout classes, so the
// placeholders sit exactly where the real content will appear and nothing jumps when the
// data arrives. The shimmer styles live in styles.css (.skeleton); users who ask their
// device to reduce motion get still blocks.

// One grey block. Size and shape come from the className (Tailwind); it gets a default
// radius unless the caller supplies a rounded-* class.
export const Skeleton = ({ className = "", style, onDark = false }) => {
  const radius = /\brounded/.test(className) ? "" : "rounded-md";
  return (
    <div
      aria-hidden="true"
      className={`skeleton ${onDark ? "skeleton-on-dark" : ""} ${radius} ${className}`}
      style={style}
    />
  );
};

export const SkeletonCircle = ({ size = 32, className = "", onDark = false }) => (
  <Skeleton
    onDark={onDark}
    className={`rounded-full shrink-0 ${className}`}
    style={{ width: size, height: size }}
  />
);

// A short stack of text-like bars; the last one is shorter, like a paragraph's last line.
export const SkeletonLines = ({ lines = 3, className = "", barClassName = "h-3", lastWidth = "60%" }) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={barClassName}
        style={{ width: i === lines - 1 && lines > 1 ? lastWidth : "100%" }}
      />
    ))}
  </div>
);

// Wraps a whole skeleton screen so assistive tech announces "Loading…" once instead of
// reading every placeholder block.
export const SkeletonRegion = ({ label = "Loading", className = "", children }) => (
  <div role="status" aria-busy="true" aria-live="polite" className={className}>
    <span className="sr-only">{label}…</span>
    {children}
  </div>
);
