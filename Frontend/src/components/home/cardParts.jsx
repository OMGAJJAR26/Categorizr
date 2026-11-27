import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { PERIOD_KINDS, PERIOD_NAMES } from "../../utils/periodStats";
import { yoyText } from "./cardUtils";

// Pieces shared by the summary cards.

// The Month / Quarter / Year switch. Each card has its own look for it.
const TOGGLES = {
  navy: {
    wrap: "inline-flex items-center rounded-full bg-slate-100 p-0.5",
    btn: "w-8 h-8 rounded-full text-sm font-bold",
    on: "bg-blue-900 text-white shadow-sm",
    off: "text-slate-500 hover:text-slate-800",
    text: false,
  },
  soft: {
    wrap: "inline-flex items-center rounded-full bg-slate-100 p-1",
    btn: "w-9 h-9 rounded-full text-sm font-bold",
    on: "bg-white text-slate-900 shadow",
    off: "text-slate-500 hover:text-slate-800",
    text: false,
  },
  circle: {
    wrap: "inline-flex items-center gap-1.5",
    btn: "w-9 h-9 rounded-full text-sm font-bold border",
    on: "bg-white text-emerald-900 border-white",
    off: "text-white border-white/40 hover:border-white/80",
    text: false,
  },
  wide: {
    wrap: "grid grid-cols-3 w-full rounded-full bg-indigo-50 p-1",
    btn: "h-10 rounded-full text-sm font-semibold",
    on: "bg-indigo-800 text-white shadow",
    off: "text-indigo-950/70 hover:text-indigo-950",
    text: true,
  },
};

export const PeriodToggle = ({ variant = "navy", kind, onChange }) => {
  const t = TOGGLES[variant];
  return (
    <div data-no-swipe role="group" aria-label="Period" className={`shrink-0 ${t.wrap}`}>
      {PERIOD_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={kind === k}
          aria-label={PERIOD_NAMES[k]}
          title={PERIOD_NAMES[k]}
          onClick={() => onChange(k)}
          className={`m-0 p-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${t.btn} ${
            kind === k ? t.on : t.off
          }`}
        >
          {t.text ? PERIOD_NAMES[k] : k}
        </button>
      ))}
    </div>
  );
};

const CONTROL_TONES = {
  light: {
    text: "text-slate-500",
    btn: "text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:hover:bg-transparent disabled:hover:text-slate-500",
    line: "border-slate-100",
  },
  dark: {
    text: "text-white/75",
    btn: "text-white/80 hover:bg-white/15 hover:text-white disabled:hover:bg-transparent disabled:hover:text-white/80",
    line: "border-white/20",
  },
};

// Previous / next item with a "3 / 12" counter on the left, previous period / back to the
// current period on the right. `noun` is the singular name of the items ("merchant" ...).
export const CardControls = ({ tone = "light", noun, index, count, kind, offset, canGoBack = true, onEntity, onPeriod }) => {
  const c = CONTROL_TONES[tone];
  const unit = PERIOD_NAMES[kind].toLowerCase();
  const btn = `m-0 p-0 w-8 h-8 inline-flex items-center justify-center rounded-full disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition ${c.btn}`;
  return (
    <div data-no-swipe className="mt-auto pt-3">
      <div className={`pt-2 border-t flex items-center justify-between ${c.line}`}>
        <div className={`flex items-center gap-1 text-xs ${c.text}`}>
          <button type="button" className={btn} onClick={() => onEntity(-1)} disabled={count < 2} aria-label={`Previous ${noun}`} title={`Previous ${noun}`}>
            <ChevronLeft size={18} />
          </button>
          <span className="tabular-nums min-w-[3.5rem] text-center">{index + 1} / {count}</span>
          <button type="button" className={btn} onClick={() => onEntity(1)} disabled={count < 2} aria-label={`Next ${noun}`} title={`Next ${noun}`}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => onPeriod(offset - 1)} disabled={!canGoBack} aria-label={`Previous ${unit}`} title={`Previous ${unit}`}>
            <ChevronDown size={18} />
          </button>
          <button type="button" className={btn} onClick={() => onPeriod(0)} disabled={offset === 0} aria-label={`Back to the current ${unit}`} title={`Back to the current ${unit}`}>
            <ChevronUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

// Green / red / grey pill for the YoY figure.
export const YoyChip = ({ yoy, suffix = " YoY", className = "" }) => {
  const text = yoyText(yoy);
  if (text === null) {
    return <span className={`text-sm font-medium text-slate-400 ${className}`}>No prior-year data</span>;
  }
  const tone =
    Number(yoy.toFixed(1)) === 0
      ? "bg-slate-100 text-slate-700"
      : yoy > 0
        ? "bg-emerald-50 text-emerald-700"
        : "bg-rose-50 text-rose-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold ${tone} ${className}`}>
      {text}
      {suffix}
    </span>
  );
};
