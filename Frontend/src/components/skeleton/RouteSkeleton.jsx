import { useLocation } from "react-router-dom";
import HeaderSkeleton from "./HeaderSkeleton";
import { skeletonKeyForPath } from "../../utils/routeSkeleton";
import { Skeleton, SkeletonLines, SkeletonRegion } from "./Skeleton";
import { HomeSkeleton } from "./HomeSkeleton";
import { GalleryGridSkeleton, GalleryTitleBarSkeleton } from "./GallerySkeleton";
import { SettingsPageSkeleton } from "./SettingsSkeleton";

// A plain page: a title and a card of text. Used for pages with no dedicated layout
// (receipt detail, reports ...). Those pages have no header of their own, so neither does this.
const GenericPageSkeleton = () => (
  <div className="min-h-screen bg-[#f0f4ff]">
    <SkeletonRegion label="Loading" className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-0.5 w-12 mt-3" />
      <div className="mt-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5 sm:p-6 flex flex-col gap-6">
        <SkeletonLines lines={3} barClassName="h-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
        <Skeleton className="h-11 w-40 rounded-xl" />
      </div>
    </SkeletonRegion>
  </div>
);

const GalleryPageSkeleton = () => (
  <div className="min-h-screen bg-[#f0f4ff]">
    <HeaderSkeleton />
    <GalleryTitleBarSkeleton />
    <GalleryGridSkeleton />
  </div>
);

// Shown by <Suspense> while a lazily loaded page's code downloads. Picks the skeleton that
// mirrors the page about to appear, with a header of the same size and logo so when the
// page arrives only the content area fills in. (It deliberately avoids importing the real
// header: this file ships with the app's first download.)
const RouteSkeleton = () => {
  const { pathname } = useLocation();

  switch (skeletonKeyForPath(pathname)) {
    case "home":
      return (
        <div className="home-page">
          <HeaderSkeleton />
          <HomeSkeleton />
        </div>
      );
    case "gallery":
      return <GalleryPageSkeleton />;
    case "settings":
      return <SettingsPageSkeleton />;
    case "auth":
      // Sign-in / sign-up ship with the app and don't wait; keep a quiet spinner just in
      // case, without the signed-in header.
      return (
        <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
          <div className="w-8 h-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
        </div>
      );
    default:
      return <GenericPageSkeleton />;
  }
};

export default RouteSkeleton;
