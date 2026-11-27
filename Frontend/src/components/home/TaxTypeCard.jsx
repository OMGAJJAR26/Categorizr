import { motion as Motion } from "framer-motion";
import { Percent } from "lucide-react";
import { taxDimension } from "../../utils/periodStats";
import { useSummaryCard } from "./useSummaryCard";
import { CardControls, PeriodToggle, YoyChip } from "./cardParts";
import { CARD_WHITE } from "./cardUtils";

// A row like "Nov 2025 Total ........ $130.00".
const TotalRow = ({ label, amount, strong }) => (
  <div className="flex items-baseline gap-2">
    <span className={`text-sm whitespace-nowrap ${strong ? "font-bold text-indigo-900" : "text-slate-500"}`}>
      {label} Total
    </span>
    <span aria-hidden="true" className="flex-1 min-w-[1rem] border-b-2 border-dotted border-indigo-200 translate-y-[-3px]" />
    <span className={`tabular-nums ${strong ? "text-2xl font-extrabold text-slate-900" : "text-lg font-bold text-slate-800"}`}>
      {amount}
    </span>
  </div>
);

// One tax type at a time: the tax collected this period against the same period last year.
const TaxTypeCard = ({ receipts, taxTypes, formatCurrency }) => {
  const card = useSummaryCard({
    receipts,
    dimension: taxDimension,
    entities: taxTypes,
    noun: "Tax type",
    formatCurrency,
  });
  const { entity, summary, kind, offset } = card;
  if (!entity) return null;
  const { current, prior, yoy } = summary;

  return (
    <div {...card.rootProps} className={CARD_WHITE}>
      <p className="sr-only" aria-live="polite">{card.spoken}</p>

      <div className="overflow-hidden">
        <Motion.div {...card.slideProps(entity.key)} className="flex items-center gap-3 min-w-0">
          <span aria-hidden="true" className="shrink-0 w-11 h-11 rounded-xl bg-indigo-50 text-indigo-800 inline-flex items-center justify-center">
            <Percent size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold text-slate-900 truncate" title={entity.name}>{entity.name}</p>
            <p className="text-xs text-slate-500">Tax type</p>
          </div>
        </Motion.div>
      </div>

      <div className="mt-3"><PeriodToggle variant="wide" kind={kind} onChange={card.chooseKind} /></div>

      <div className="mt-4 overflow-hidden">
        <Motion.div {...card.slideProps(`${entity.key}|${kind}|${offset}`)} className="flex flex-col gap-2">
          <TotalRow label={prior.label} amount={formatCurrency(prior.total)} />
          <TotalRow label={current.label} amount={formatCurrency(current.total)} strong />
          <div className="mt-2 pt-3 border-t-2 border-slate-800 flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-900">Year over year</span>
            <YoyChip yoy={yoy} suffix="" />
          </div>
        </Motion.div>
      </div>

      <CardControls noun="tax type" index={card.index} count={card.count} kind={kind} offset={offset} canGoBack={card.canGoBack} onEntity={card.goEntity} onPeriod={card.goPeriod} />
    </div>
  );
};

export default TaxTypeCard;
