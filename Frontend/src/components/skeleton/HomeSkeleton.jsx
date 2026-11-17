import { Skeleton, SkeletonCircle, SkeletonRegion } from "./Skeleton";

// Placeholder for one receipt, in the same three responsive layouts the real list uses
// (desktop grid row / tablet card / phone card), so the right one shows at each width.
const ReceiptRowSkeleton = () => (
  <div className="mb-3">
    {/* Desktop (lg+): shares the real column template, so every column lines up. */}
    <div className="hidden lg:grid receipt-row-grid items-center border rounded-xl shadow-sm p-3 bg-white">
      <div className="col-span-8 -mt-1 -mb-1" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-16" />
      <div className="flex items-center gap-2">
        <SkeletonCircle size={32} />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-28" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex items-center justify-center gap-3 min-h-[64px]">
        <Skeleton className="h-4 w-8" />
        <SkeletonCircle size={20} />
        <SkeletonCircle size={20} />
        <SkeletonCircle size={20} />
      </div>
    </div>

    {/* Tablet (md to lg): header line, three columns, then a footer with the actions */}
    <div className="hidden md:flex lg:hidden flex-col border rounded-xl shadow-sm p-3 bg-white">
      <div className="mb-2" />
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2.5 min-h-[41px]">
          <Skeleton className="h-6 w-6" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        </div>
        <Skeleton className="h-5 w-14" />
      </div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col">
            <div className="flex items-center h-5">
              <Skeleton className="h-2.5 w-12" />
            </div>
            <div className="flex items-center h-5">
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center min-h-[60px]">
        <Skeleton className="h-4 w-2/5" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-8" />
          <SkeletonCircle size={28} />
          <SkeletonCircle size={28} />
        </div>
      </div>
    </div>

    {/* Phone: header line, merchant line, details grid, then a footer with the actions */}
    <div className="md:hidden flex flex-col gap-3 border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
      <div className="flex justify-between items-center min-h-[24px]">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-14" />
      </div>
      <div className="flex items-center gap-2 min-h-[24px]">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[["w-10", "w-20"], ["w-14", "w-24"]].map(([label, value], i) => (
          <div key={i} className="flex flex-col">
            <div className="flex items-center h-[18px]">
              <Skeleton className={`h-2.5 ${label}`} />
            </div>
            <div className="flex items-center h-[21px]">
              <Skeleton className={`h-4 ${value}`} />
            </div>
          </div>
        ))}
        <div className="col-span-2 flex flex-col">
          <div className="flex items-center h-[18px]">
            <Skeleton className="h-2.5 w-20" />
          </div>
          <div className="flex items-center h-[21px]">
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-2 h-[21px]">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="flex justify-end items-center gap-3 min-h-[61px]">
        <Skeleton className="h-4 w-8" />
        <SkeletonCircle size={28} />
        <SkeletonCircle size={28} />
      </div>
    </div>
  </div>
);

// The home screen while receipts load: the dark banner, the toolbar, the column
// headings, a year heading and a handful of receipts. Rendered below the real <Header />.
export const HomeSkeleton = ({ rows = 6 }) => (
  <SkeletonRegion label="Loading your receipts">
    <div className="home-hero">
      <div className="home-hero-slide">
        <Skeleton onDark className="h-9 sm:h-12 w-64 sm:w-[28rem] max-w-[85%]" />
        <Skeleton onDark className="h-4 w-32 mt-4" />
      </div>
    </div>

    <div className="home-main-card">
      <div className="bg-white pb-1 lg:pb-[3px]">
        {/* Phone toolbar: a row of round icon buttons */}
        <div className="md:hidden home-sticky-bar-mobile">
          <div className="flex items-center flex-nowrap w-full justify-between gap-1 h-[52px] home-mobile-icon-row">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <SkeletonCircle key={i} size={32} />
            ))}
          </div>
        </div>

        {/* Tablet / desktop toolbar: title + Add Receipt, then filter pills and icons. The
            heights include the 10px margin the real buttons carry. */}
        <div className="hidden md:flex home-sticky-bar-desktop justify-between items-center">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-[76px] lg:h-8 lg:w-[89px]" />
            <Skeleton className="h-[45px] w-[118px] lg:h-[43px] lg:w-[152px] rounded-full my-[10px]" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center h-[58px]">
              <Skeleton className="h-[38px] w-[135px] rounded-full" />
            </div>
            <div className="flex items-center h-[58px]">
              <Skeleton className="h-[38px] w-[150px] rounded-full" />
            </div>
            <div className="flex items-center h-[58px]">
              <Skeleton className="h-[38px] w-[135px] rounded-full" />
            </div>
            <div className="hidden lg:flex items-center h-[53px]">
              <Skeleton className="h-[38px] w-[202px] rounded-full" />
            </div>
            <div className="flex items-center gap-2 h-[56px] w-[250px]">
              <Skeleton className="h-5 w-28" />
              <SkeletonCircle size={36} />
              <SkeletonCircle size={36} />
            </div>
          </div>
        </div>

        {/* Column headings (desktop) */}
        <div className="hidden lg:grid home-table-header">
          {[12, 10, 14, 14, 16, 20, 10, 12].map((w, i) => (
            <div
              key={i}
              className={`flex items-center h-5 ${i === 6 ? "justify-end" : i === 7 ? "justify-center" : ""}`}
            >
              <Skeleton className="h-3" style={{ width: `${w * 4}px` }} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="home-year-header">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-28 sm:mr-[196px]" />
        </div>
        <div className="home-receipts-inner">
          {Array.from({ length: rows }).map((_, i) => (
            <ReceiptRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  </SkeletonRegion>
);

export default HomeSkeleton;
