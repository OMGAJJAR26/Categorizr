import { useState, useRef, useEffect } from "react";
import { Trash2, Send, ChevronDown, Check } from "lucide-react";

// Plain inline X — deliberately NOT lucide's <X/>, whose `svg.lucide.lucide-x`
// class is hijacked by a global modal-close style (white stroke + absolute pos).
const CloseIcon = ({ size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="block"
    aria-hidden="true"
  >
    <path d="M6 6 18 18M18 6 6 18" />
  </svg>
);

/**
 * Floating action bar shown while the homepage is in multi-select mode.
 * Styled to match the homepage toolbar: a clean white pill with a solid-blue
 * primary action (Send to), an outlined destructive action (Delete), and a
 * clearly visible close control. Providers with `connected: false` are shown
 * disabled with a hint.
 *
 * NOTE: every <button> sets its padding explicitly (px/py or p-0) so it is not
 * affected by the app-wide `button { padding: 10px }` base style.
 */
const BulkActionBar = ({
  count = 0,
  total = 0,
  allSelected = false,
  onToggleSelectAll,
  onClear,
  onDelete,
  onExit,
  providers = [],        // [{ key, name, connected }]
  onSend,                // (providerKey) => void
  isDeleting = false,
  isSending = false,
}) => {
  const [showSend, setShowSend] = useState(false);
  const sendRef = useRef(null);
  const busy = isDeleting || isSending;
  const some = count > 0;

  useEffect(() => {
    const onDoc = (e) => {
      if (sendRef.current && !sendRef.current.contains(e.target)) setShowSend(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="sticky top-3 z-40 mb-4 flex justify-center px-2">
      <div className="flex items-center gap-2 sm:gap-3 rounded-full border border-gray-200 bg-white pl-3 pr-2 py-2 shadow-[0_10px_30px_-10px_rgba(30,64,175,0.35)]">
        {/* Select-all toggle + count */}
        <button
          type="button"
          onClick={onToggleSelectAll}
          className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-50 transition-colors"
          title={allSelected ? "Deselect all" : "Select all"}
        >
          <span
            className={`inline-flex items-center justify-center p-0 h-5 w-5 shrink-0 rounded-md border-2 box-border transition-colors ${
              some ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-transparent"
            }`}
          >
            <Check size={13} strokeWidth={3} className="block" />
          </span>
          <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
            {count} <span className="font-normal text-gray-500">selected</span>
          </span>
        </button>

        <span className="w-px h-7 bg-gray-200 shrink-0" />

        {/* Delete (destructive, outlined) */}
        <button
          type="button"
          onClick={onDelete}
          disabled={!some || busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-50"
        >
          <Trash2 size={15} />
          <span className="hidden sm:inline">{isDeleting ? "Deleting…" : "Delete"}</span>
        </button>

        {/* Send to (primary, solid blue — matches "Add Receipt") */}
        <div className="relative" ref={sendRef}>
          <button
            type="button"
            onClick={() => setShowSend((s) => !s)}
            disabled={!some || busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
          >
            <Send size={15} />
            <span className="hidden sm:inline">{isSending ? "Sending…" : "Send to"}</span>
            <ChevronDown size={14} className={`transition-transform ${showSend ? "rotate-180" : ""}`} />
          </button>

          {showSend && (
            <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden z-50">
              <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                Send {count} receipt{count === 1 ? "" : "s"} to
              </div>
              {providers.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={!p.connected}
                  onClick={() => {
                    setShowSend(false);
                    onSend?.(p.key);
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-gray-800 hover:bg-blue-50 disabled:text-gray-400 disabled:hover:bg-white flex items-center justify-between transition-colors"
                  title={p.connected ? "" : "Connect this tool first (Integrations)"}
                >
                  <span>{p.name}</span>
                  {p.connected ? (
                    <span className="text-[11px] font-semibold text-emerald-600">Connected</span>
                  ) : (
                    <span className="text-[11px] text-gray-400">Not connected</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear selection (subtle) */}
        {some && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="hidden sm:inline-flex px-3 py-2 rounded-full text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            Clear
          </button>
        )}

        {/* Close / exit select mode */}
        <button
          type="button"
          onClick={onExit}
          disabled={busy}
          className="inline-flex items-center justify-center p-0 h-9 w-9 shrink-0 rounded-full text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-gray-900 transition-colors disabled:opacity-40"
          title="Done"
          aria-label="Exit selection mode"
        >
          <CloseIcon size={18} />
        </button>
      </div>
    </div>
  );
};

export default BulkActionBar;
