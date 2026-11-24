import { motion as Motion } from "framer-motion";
import MerchantAvatar from "../MerchantAvatar";
import { merchantDimension } from "../../utils/periodStats";
import { receiptsLabel, useSummaryCard } from "./useSummaryCard";
import { CardControls, PeriodToggle } from "./cardParts";
import { CARD_WHITE, yoyText } from "./cardUtils";

const CAPTION = { M: "Monthly total", Q: "Quarterly total", Y: "Yearly total" };

const YoyBadge = ({ yoy }) => {
  const text = yoyText(yoy);
  if (text === null) return <span className="text-sm font-medium text-slate-400">No prior-year data</span>;
  if (Number(yoy.toFixed(1)) === 0) return <span className="text-sm font-semibold text-slate-600">0.0% YoY</span>;
  const up = yoy > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
      <span aria-hidden="true" className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
      {text} YoY
    </span>
  );
};

// One merchant at a time: its total for this month / quarter / year next to the same period
// a year earlier, and the year-over-year change.
const MerchantSummaryCard = ({ receipts, merchants, logoByKey, formatCurrency }) => {
  const card = useSummaryCard({
    receipts,
    dimension: merchantDimension,
    entities: merchants,
    noun: "Merchant",
    formatCurrency,
  });
  const { entity, summary, kind, offset } = card;
  if (!entity) return null;
  const { current, prior, yoy } = summary;
  const caption = `${CAPTION[kind]}${current.detail ? ` · ${current.detail}` : ""}`;

  return (
    <div {...card.rootProps} className={CARD_WHITE}>
      <p className="sr-only" aria-live="polite">{card.spoken}</p>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 overflow-hidden">
          <Motion.div {...card.slideProps(entity.key)} className="flex items-center gap-3 min-w-0">
            <MerchantAvatar
              key={entity.key}
              name={entity.name}
              explicitUrl={logoByKey.get(entity.key) || ""}
              className="w-11 h-11 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold text-slate-900 truncate" title={entity.name}>
                {entity.name}
              </p>
              <p className="text-xs text-slate-500 truncate">{caption}</p>
            </div>
          </Motion.div>
        </div>
        <PeriodToggle variant="navy" kind={kind} onChange={card.chooseKind} />
      </div>

      <div className="mt-4 overflow-hidden">
        <Motion.div {...card.slideProps(`${entity.key}|${kind}|${offset}`)} className="grid grid-cols-2 gap-4">
          <div className="min-w-0 pr-1">
            <p className="text-xs sm:text-sm text-slate-600 leading-snug">
              {current.label} ({receiptsLabel(current.count)})
            </p>
            <p className="mt-1 text-2xl xl:text-xl 2xl:text-2xl leading-tight font-bold text-slate-900 tabular-nums truncate" title={formatCurrency(current.total)}>
              {formatCurrency(current.total)}
            </p>
            <div className="mt-1 min-h-[20px]"><YoyBadge yoy={yoy} /></div>
          </div>
          <div className="min-w-0 pl-4 border-l border-slate-200">
            <p className="text-xs sm:text-sm text-slate-600 leading-snug">
              {prior.label} ({receiptsLabel(prior.count)})
            </p>
            <p className="mt-1 text-2xl xl:text-xl 2xl:text-2xl leading-tight font-bold text-slate-900 tabular-nums truncate" title={formatCurrency(prior.total)}>
              {formatCurrency(prior.total)}
            </p>
            <p className="mt-1 text-sm text-slate-400">(Prior Period)</p>
          </div>
        </Motion.div>
      </div>

      <CardControls noun="merchant" index={card.index} count={card.count} kind={kind} offset={offset} onEntity={card.goEntity} onPeriod={card.goPeriod} />
    </div>
  );
};

export default MerchantSummaryCard;
