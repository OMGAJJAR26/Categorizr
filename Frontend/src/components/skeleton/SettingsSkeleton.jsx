import HeaderSkeleton from "./HeaderSkeleton";
import { Skeleton, SkeletonCircle, SkeletonRegion } from "./Skeleton";

// One list item: an icon, two lines of text and a couple of action buttons - the shape of
// a merchant / category / payment method / tax type / network contact.
const ListRowSkeleton = () => (
  <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl bg-white">
    <SkeletonCircle size={36} />
    <div className="flex-1 flex flex-col gap-2">
      <Skeleton className="h-4 w-1/2 max-w-[220px]" />
      <Skeleton className="h-3 w-1/3 max-w-[140px]" />
    </div>
    <SkeletonCircle size={28} />
    <SkeletonCircle size={28} />
  </div>
);

// Just the list rows (used where a panel already shows its own heading and controls).
export const SkeletonListRows = ({ rows = 3, label = "Loading" }) => (
  <SkeletonRegion label={label} className="flex flex-col gap-3">
    {Array.from({ length: rows }).map((_, i) => (
      <ListRowSkeleton key={i} />
    ))}
  </SkeletonRegion>
);

// My Account: a menu of four action rows (Edit Profile, Change Password, Delete Account,
// Logoff). Each is a bordered row with a 40px icon tile, a label with a smaller line under it
// and a chevron. The real rows are buttons, so they carry the global 10px vertical margin
// (hence my-[10px]). The label and the line under it are fixed wording, so they are drawn as
// shaded invisible text (.skeleton-text): the rows then wrap and grow exactly like the real
// ones, even on narrow phones where the longer lines break onto a second line.
const MY_ACCOUNT_ROWS = [
  { label: "Edit Profile", sub: "Update your name and email" },
  { label: "Change Password", sub: "Set a new secure password" },
  { label: "Delete Account", sub: "Permanently remove your account" },
  { label: "Logoff", sub: "Sign out of Categorizr" },
];

export const MyAccountPanelSkeleton = () => (
  <SkeletonRegion label="Loading your account" className="flex flex-col gap-2">
    {MY_ACCOUNT_ROWS.map(({ label, sub }) => (
      <div
        key={label}
        className="flex items-center gap-4 my-[10px] bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm"
      >
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0" aria-hidden="true">
          <p className="text-sm font-semibold">
            <span className="skeleton-text">{label}</span>
          </p>
          <p className="text-xs mt-0.5">
            <span className="skeleton-text">{sub}</span>
          </p>
        </div>
        <Skeleton className="h-4 w-4 shrink-0" />
      </div>
    ))}
  </SkeletonRegion>
);

// Inside a "Manage ..." panel (merchants, categories, payment methods, tax types): a narrow
// column with an Add button on the right, a search box, then the list. The heights include
// the 10px margin the real buttons / inputs carry, so the panel doesn't jump when it fills in.
export const SettingsPanelSkeleton = ({ rows = 5 }) => (
  <SkeletonRegion label="Loading" className="max-w-lg flex flex-col gap-4">
    <div className="flex justify-end">
      <Skeleton className="h-9 w-[76px] rounded-xl my-[10px]" />
    </div>
    <div className="flex items-center h-[62px]">
      <Skeleton className="h-[42px] w-full rounded-xl" />
    </div>
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 h-[58px] px-3 border border-slate-200 rounded-xl bg-white"
        >
          <Skeleton className="h-7 w-7" />
          <Skeleton className="h-4 flex-1 max-w-[220px]" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-7 w-7" />
          </div>
        </div>
      ))}
    </div>
  </SkeletonRegion>
);

// Height of every nav item in each Settings group. The real items are buttons, which carry a
// global 10px vertical margin (hence my-[10px]); the "Soon" items are a little taller.
const SIDEBAR_GROUPS = [[42, 42], [42, 42, 42, 42], [42, 48, 48, 48]];

const SidebarSkeleton = () => (
  <aside
    aria-hidden="true"
    className="flex flex-col h-full bg-white/95 border-r border-slate-200/80 w-72 flex-shrink-0"
  >
    <div className="px-4 py-5 border-b border-slate-200/80">
      <Skeleton className="h-10 w-[101px] mt-[10px] mb-4" />
    </div>
    <div className="flex-1 px-3 py-4 flex flex-col gap-5">
      {SIDEBAR_GROUPS.map((heights, g) => (
        <div key={g}>
          <div className="flex items-center h-[15px] px-2 mb-2">
            <Skeleton className="h-2.5 w-20" />
          </div>
          <div className="flex flex-col gap-1">
            {heights.map((h, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 my-[10px]" style={{ height: h }}>
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 flex-1 max-w-[160px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="px-3 py-4 border-t border-slate-200/80">
      <div className="flex items-center gap-2.5 px-3 my-[10px] h-[42px]">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  </aside>
);

// The whole Settings page (header, sidebar, breadcrumb, title and a panel) for the moment
// its code is still downloading. Settings opens on My Account, so that is the panel shown.
export const SettingsPageSkeleton = () => (
  <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-blue-50/30 flex flex-col">
    <HeaderSkeleton />
    <div className="flex flex-1 overflow-hidden" style={{ minHeight: "calc(100vh - 60px)" }}>
      <div className="hidden lg:flex flex-col h-auto sticky top-0 self-start" style={{ minHeight: "calc(100vh - 60px)" }}>
        <SidebarSkeleton />
      </div>
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white/90 border-b border-slate-200 px-6 py-4 flex items-center gap-3 min-h-[93px]">
          <Skeleton className="lg:hidden h-8 w-8 rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
        <div className="px-4 sm:px-6 py-7">
          <div className="mb-5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-8 w-36 mt-2" />
            <Skeleton className="h-0.5 w-12 mt-3" />
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4 sm:p-6">
            <MyAccountPanelSkeleton />
          </div>
        </div>
      </main>
    </div>
  </div>
);

export default SettingsPageSkeleton;
