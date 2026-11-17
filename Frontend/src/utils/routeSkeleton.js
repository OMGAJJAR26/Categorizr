// Which loading skeleton to show while a page's code is still downloading. Matches the
// route table in App.jsx. "auth" is the sign-in/sign-up screens (they ship with the app,
// so they never really wait); anything else unknown gets the generic page skeleton.
export const skeletonKeyForPath = (pathname) => {
  const path = String(pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === "/homepage") return "home";
  if (path === "/receipt-gallery") return "gallery";
  if (path === "/settings") return "settings";
  if (path === "/" || path === "/login" || path === "/signup") return "auth";
  return "generic";
};
