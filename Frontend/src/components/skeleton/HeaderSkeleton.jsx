import FontLogo from "../../assets/categorizrFontLogo.png";
import { Skeleton, SkeletonCircle } from "./Skeleton";

// Stand-in for the signed-in <Header /> on the route-level loading screens. It has the
// same bar, height and logo but none of the header's code (menus, dialogs, animation
// library), so the loading screen stays tiny and never adds weight to the login page's
// download. The heights match the real header (80px on phones, 96px from 640px up).
const HeaderSkeleton = () => (
  <header
    aria-hidden="true"
    className="sticky top-0 z-50 bg-[#0f172a] text-white px-3 sm:px-4 md:px-6 py-2 sm:py-3 flex items-center justify-between shadow-lg shadow-blue-900/20 min-h-[80px] sm:min-h-[96px]"
  >
    <img src={FontLogo} alt="" className="h-6 sm:h-7 md:h-8 w-auto object-contain" />
    <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
      <Skeleton onDark className="h-9 w-20 sm:w-28 rounded-full" />
      <SkeletonCircle size={32} onDark />
      <div className="flex items-center gap-2">
        <SkeletonCircle size={32} onDark />
        <Skeleton onDark className="hidden sm:block h-4 w-20" />
      </div>
    </div>
  </header>
);

export default HeaderSkeleton;
