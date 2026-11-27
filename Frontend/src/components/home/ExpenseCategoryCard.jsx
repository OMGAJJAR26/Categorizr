import { motion as Motion } from "framer-motion";
import { Fuel, HeartPulse, Plane, ShoppingBasket, Tag, Utensils } from "lucide-react";
import { categoryDimension } from "../../utils/periodStats";
import { useSummaryCard } from "./useSummaryCard";
import { CardControls, PeriodToggle } from "./cardParts";
import { CARD_BASE, yoyText } from "./cardUtils";

// A fitting icon for the common categories; anything else gets a tag.
const iconFor = (name) => {
  const n = name.toLowerCase();
  if (/grocer|supermarket/.test(n)) return ShoppingBasket;
  if (/food|dining|restaurant|meal|coffee/.test(n)) return Utensils;
  if (/travel|flight|airfare|hotel/.test(n)) return Plane;
  if (/fuel|gas|petrol/.test(n)) return Fuel;
  if (/health|medical|pharmacy/.test(n)) return HeartPulse;
  return Tag;
};

// The big percentage shrinks as it gets longer ("+30,669%") so it never crowds the bars.
const bigSize = (text) => {
  if (text === null) return "text-3xl text-white/70";
  if (text.length >= 9) return "text-2xl";
  if (text.length >= 7) return "text-3xl";
  return "text-4xl xl:text-[2rem] 2xl:text-4xl";
};

// Bars for the earlier and the current period, scaled to the larger of the two.
const Bars = ({ prior, current }) => {
  const max = Math.max(prior, current, 0);
  const pct = (v) => (max > 0 ? Math.max(8, Math.round((Math.max(v, 0) / max) * 100)) : 8);
  return (
    <div aria-hidden="true" className="flex items-end gap-3 h-24 shrink-0">
      <div className="w-11 rounded-t-xl bg-white/45 transition-[height] duration-300" style={{ height: `${pct(prior)}%` }} />
      <div className="w-11 rounded-t-xl bg-white transition-[height] duration-300" style={{ height: `${pct(current)}%` }} />
    </div>
  );
};

// One expense category at a time, on a green card with the year-over-year change up front.
const ExpenseCategoryCard = ({ receipts, categories, formatCurrency }) => {
  const card = useSummaryCard({
    receipts,
    dimension: categoryDimension,
    entities: categories,
    noun: "Expense category",
    formatCurrency,
  });
  const { entity, summary, kind, offset } = card;
  if (!entity) return null;
  const { current, prior, yoy } = summary;
  const Icon = iconFor(entity.name);
  const text = yoyText(yoy);

  return (
    <div {...card.rootProps} className={`${CARD_BASE} bg-[#226b47] text-white shadow-[0_8px_30px_rgba(34,107,71,0.25)]`}>
      <p className="sr-only" aria-live="polite">{card.spoken}</p>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 overflow-hidden">
          <Motion.div {...card.slideProps(entity.key)} className="flex items-center gap-2.5 min-w-0">
            <Icon size={22} className="shrink-0" aria-hidden="true" />
            <p className="text-base sm:text-lg font-bold truncate" title={entity.name}>{entity.name}</p>
          </Motion.div>
        </div>
        <PeriodToggle variant="circle" kind={kind} onChange={card.chooseKind} />
      </div>

      <div className="mt-4 overflow-hidden">
        <Motion.div {...card.slideProps(`${entity.key}|${kind}|${offset}`)}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className={`font-extrabold leading-none tabular-nums ${bigSize(text)}`}>
                {text ?? "—"}
              </p>
              <p className="mt-1.5 text-sm text-white/80">
                {text === null ? "no prior-year data" : "year over year"}
              </p>
            </div>
            <Bars prior={prior.total} current={current.total} />
          </div>
          <div className="mt-3 pt-3 border-t border-white/25 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-white/75">{prior.label}</p>
              <p className="text-base font-bold tabular-nums truncate">{formatCurrency(prior.total)}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-xs text-white/75">{current.label}</p>
              <p className="text-base font-bold tabular-nums truncate">{formatCurrency(current.total)}</p>
            </div>
          </div>
        </Motion.div>
      </div>

      <CardControls tone="dark" noun="expense category" index={card.index} count={card.count} kind={kind} offset={offset} canGoBack={card.canGoBack} onEntity={card.goEntity} onPeriod={card.goPeriod} />
    </div>
  );
};

export default ExpenseCategoryCard;
