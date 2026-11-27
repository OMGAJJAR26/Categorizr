import { motion as Motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { PERIOD_KINDS, PERIOD_NAMES } from "../../utils/periodStats";
import { receiptsLabel, useSummaryCard } from "./useSummaryCard";
import { yoyText } from "./cardUtils";

// The card layout used for the Merchant card (and Expense Types): the item's name and a
// short line for the period, the total, an optional year-over-year block, a vertical
// M / Q / Y / YoY switch on the right, and a footer with the item arrows and the
// "previous period" / "back to now" buttons.
//
// The YoY switch only hides things: the total keeps its size and the block below it keeps
// its space, so the card never resizes or jumps when YoY is turned on or off.

const NAVY = "#14203f";

const pillTone = (yoy) => {
  if (yoy === null || Number(yoy.toFixed(1)) === 0) return { pill: "bg-slate-100 text-slate-700", text: "text-slate-600" };
  return yoy > 0
    ? { pill: "bg-[#d9f6e5] text-[#12703f]", text: "text-[#12703f]" }
    : { pill: "bg-[#fde2e4] text-[#b4232f]", text: "text-[#b4232f]" };
};

const footerBtn =
  "m-0 p-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition";

// `label` is the small caps title ("Merchant"); `renderIdentity(entity)` draws the logo / icon.
const SummaryCardV2 = ({ receipts, entities, dimension, label, cardId, renderIdentity, formatCurrency }) => {
  const card = useSummaryCard({ receipts, dimension, entities, noun: label, formatCurrency, cardId });
  const { entity, summary, kind, offset, showYoy } = card;
  if (!entity) return null;
  const { current, prior, yoy } = summary;
  const tone = pillTone(yoy);
  const diff = current.total - prior.total;
  const diffText = `${diff >= 0 ? "+" : "-"}${formatCurrency(Math.abs(diff))}`;
  const hasYoy = yoy !== null;
  const hidden = showYoy ? "" : "invisible";

  return (
    <div
      {...card.rootProps}
      className="relative w-full h-full min-h-[372px] flex flex-col select-none rounded-[22px] bg-white border border-slate-200 shadow-[0_8px_30px_rgba(20,32,63,0.08)] px-5 pt-4 pb-3 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <p className="sr-only" aria-live="polite">{card.spoken}</p>

      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>

      <div className="mt-2 flex-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
        <div className="min-w-0 flex flex-col">
          <div className="overflow-hidden">
            <Motion.div {...card.slideProps(entity.key)} className="flex items-center gap-3 min-w-0">
              {renderIdentity(entity)}
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight truncate" style={{ color: NAVY }} title={entity.name}>
                  {entity.name}
                </p>
                <p className="text-sm text-slate-500 truncate">{card.subtitle}</p>
              </div>
            </Motion.div>
          </div>

          <div className="mt-4 overflow-hidden">
            <Motion.div {...card.slideProps(`${entity.key}|${kind}|${offset}`)}>
              <p className="text-sm text-slate-500">
                {current.label} ({receiptsLabel(current.count)})
              </p>
              <p
                className="mt-1 text-[42px] leading-none font-extrabold tabular-nums truncate"
                style={{ color: NAVY }}
                title={formatCurrency(current.total)}
              >
                {formatCurrency(current.total)}
              </p>

              <div className={`mt-3 min-h-[32px] flex flex-wrap items-center gap-x-3 gap-y-1 ${hidden}`} aria-hidden={!showYoy}>
                {hasYoy ? (
                  <>
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 h-8 text-sm font-bold ${tone.pill}`}>
                      {yoy >= 0 ? <ArrowUp size={14} strokeWidth={3} /> : <ArrowDown size={14} strokeWidth={3} />}
                      {yoyText(Math.abs(yoy))} YoY
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${tone.text}`}>{diffText}</span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-slate-400">No prior-year data</span>
                )}
              </div>

              <div className={`mt-3 pt-3 border-t border-slate-200 flex items-start justify-between gap-3 ${hidden}`} aria-hidden={!showYoy}>
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">
                    {prior.label} ({receiptsLabel(prior.count)})
                  </p>
                  <p className="text-xs text-slate-400">Prior period</p>
                </div>
                <p className="text-xl font-semibold tabular-nums" style={{ color: NAVY }}>
                  {formatCurrency(prior.total)}
                </p>
              </div>
            </Motion.div>
          </div>
        </div>

        <div
          data-no-swipe
          className="self-start mt-1 w-[72px] rounded-[26px] border-2 p-1.5 flex flex-col items-stretch gap-1.5"
          style={{ borderColor: NAVY }}
        >
          <div role="group" aria-label="Period" className="flex flex-col gap-1.5">
            {PERIOD_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                aria-label={PERIOD_NAMES[k]}
                title={PERIOD_NAMES[k]}
                onClick={() => card.chooseKind(k)}
                className={`m-0 p-0 h-12 w-full rounded-xl text-base font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  kind === k ? "text-white" : "hover:bg-slate-100"
                }`}
                style={kind === k ? { backgroundColor: NAVY } : { color: NAVY }}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="h-px w-8 self-center bg-slate-300" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={showYoy}
            title="Show year over year"
            onClick={card.toggleYoy}
            className={`m-0 p-0 h-12 w-full rounded-xl text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              showYoy ? "bg-[#86e6b4] text-[#0b3b24]" : "border border-dashed border-slate-400 text-slate-600 hover:bg-slate-50"
            }`}
          >
            YoY
          </button>
        </div>
      </div>

      <div data-no-swipe className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <button type="button" className={footerBtn} onClick={() => card.goEntity(-1)} disabled={card.count < 2} aria-label={`Previous ${label.toLowerCase()}`} title={`Previous ${label.toLowerCase()}`}>
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-[4.5rem] text-center leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: NAVY }}>
              {card.index + 1} of {card.count}
            </p>
          </div>
          <button type="button" className={footerBtn} onClick={() => card.goEntity(1)} disabled={card.count < 2} aria-label={`Next ${label.toLowerCase()}`} title={`Next ${label.toLowerCase()}`}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => card.goPeriod(offset - 1)}
            disabled={!card.canGoBack}
            aria-label={card.canGoBack ? `Go back to ${card.backLabel}` : "No earlier data"}
            title={card.canGoBack ? `Go back to ${card.backLabel}` : "No earlier data"}
            className="m-0 p-0 h-10 px-3 inline-flex items-center gap-1 rounded-xl border border-slate-300 text-sm font-bold disabled:opacity-35 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition"
            style={{ color: NAVY }}
          >
            <ChevronDown size={16} />
            {card.backLabel}
          </button>
          <button
            type="button"
            onClick={() => card.goPeriod(0)}
            disabled={offset === 0}
            aria-label={offset === 0 ? "Already at the current period" : `Back to ${card.upLabel}`}
            title={offset === 0 ? "Already at the current period" : `Back to ${card.upLabel}`}
            className="m-0 p-0 h-10 px-2 inline-flex items-center gap-1 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800 disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition"
          >
            <ChevronUp size={16} />
            {card.upLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SummaryCardV2;
