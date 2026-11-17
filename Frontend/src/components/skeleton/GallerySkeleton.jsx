import { Skeleton, SkeletonRegion } from "./Skeleton";

// The grid of receipt-image tiles while the gallery loads. Same grid, gaps and square
// tiles as the real gallery, so it reflows at the same breakpoints. (The real tiles are
// <button>s, which carry a global 10px vertical margin; the my-[10px] mirrors it.)
export const GalleryGridSkeleton = ({ tiles = 28 }) => (
  <SkeletonRegion label="Loading receipt images" className="px-2 py-3 sm:px-4 sm:py-4">
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2 sm:gap-2.5">
      {Array.from({ length: tiles }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-md my-[10px]" />
      ))}
    </div>
  </SkeletonRegion>
);

// The dark "back + title" strip under the header, for when the whole page is still loading.
export const GalleryTitleBarSkeleton = () => (
  <div
    aria-hidden="true"
    className="sticky top-[52px] sm:top-[60px] z-40 bg-[#0f172a] px-3 sm:px-4 py-3 flex items-center shadow-md"
  >
    {/* The real back button is 34px square plus the global 10px vertical margin. */}
    <Skeleton onDark className="h-[34px] w-[34px] -ml-1 my-[10px] rounded-full" />
    <div className="flex-1 flex justify-center pr-7">
      <Skeleton onDark className="h-5 w-40" />
    </div>
  </div>
);

export default GalleryGridSkeleton;
