import { isChunkLoadError } from "../utils/chunkLoadError";

// Plain links/reloads only: this screen must keep working when a context provider
// or the router is the thing that crashed.
export default function ErrorFallback({ error }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const chunkFailure = isChunkLoadError(error);

  let title = "Something went wrong";
  let message =
    "Sorry, this page ran into a problem. Reloading usually fixes it. If it keeps happening, please try again in a little while.";
  if (offline) {
    title = "You're offline";
    message = "Check your internet connection, then reload the page.";
  } else if (chunkFailure) {
    title = "This page couldn't load";
    message =
      "The app may have just been updated, or your connection dropped while loading. Reload to continue.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div role="alert" className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-500"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1 className="text-base font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-700 leading-relaxed">{message}</p>
        <button
          type="button"
          autoFocus
          onClick={() => window.location.reload()}
          className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors m-0"
        >
          Reload page
        </button>
        <a
          href="/homepage"
          className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          Go to homepage
        </a>
        {import.meta.env.DEV && error?.message && (
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-2 text-left text-[11px] text-slate-600 whitespace-pre-wrap">
            {String(error.message)}
          </pre>
        )}
      </div>
    </div>
  );
}
