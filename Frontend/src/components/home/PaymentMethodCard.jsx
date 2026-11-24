import { motion as Motion } from "framer-motion";
import { parsePaymentDisplay } from "../../utils/paymentMethodUtils";
import { paymentMethodDimension } from "./summaryDimensions";
import { useSummaryCard } from "./useSummaryCard";
import { CardControls, PeriodToggle, YoyChip } from "./cardParts";
import { CARD_WHITE } from "./cardUtils";

// A little bank card: chip, the brand and the last four digits.
const CardFace = ({ brand, last4 }) => {
  // Long names ("American Express", "Bank of America") get a smaller type so no word is cut.
  const size = brand.length > 14 ? "text-[10px]" : brand.length > 8 ? "text-[11px]" : "text-[13px]";
  return (
    <div
      aria-hidden="true"
      className="shrink-0 w-[104px] h-[116px] rounded-2xl bg-[#14253f] p-3 flex flex-col justify-between shadow-md"
    >
      <span className="block w-8 h-6 rounded-md bg-[#e8c877]" />
      <div className="min-w-0">
        <p className={`${size} font-extrabold tracking-wide text-white uppercase leading-tight line-clamp-3`}>
          {brand}
        </p>
        {last4 && <p className="mt-1 text-[11px] tracking-[0.2em] text-white/70">•••• {last4}</p>}
      </div>
    </div>
  );
};

// One payment method at a time, shown as a card.
const PaymentMethodCard = ({ receipts, methods, formatCurrency }) => {
  const card = useSummaryCard({
    receipts,
    dimension: paymentMethodDimension,
    entities: methods,
    noun: "Payment method",
    formatCurrency,
  });
  const { entity, summary, kind, offset } = card;
  if (!entity) return null;
  const { current, prior, yoy } = summary;
  const { issuer, last4 } = parsePaymentDisplay(entity.name);
  const brand = issuer || entity.name;

  return (
    <div {...card.rootProps} className={CARD_WHITE}>
      <p className="sr-only" aria-live="polite">{card.spoken}</p>

      <div className="flex items-start gap-4">
        <Motion.div {...card.slideProps(entity.key)} className="shrink-0">
          <CardFace brand={brand} last4={last4} />
        </Motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-500 leading-snug break-words">Spend on {brand}</p>
          <div className="mt-2"><PeriodToggle variant="soft" kind={kind} onChange={card.chooseKind} /></div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden">
        <Motion.div {...card.slideProps(`${entity.key}|${kind}|${offset}`)}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-3xl xl:text-[1.65rem] 2xl:text-3xl leading-tight font-extrabold text-slate-900 tabular-nums">
              {formatCurrency(current.total)}
            </p>
            {yoy !== null && <YoyChip yoy={yoy} />}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {current.label} · {yoy === null ? "no spend in " : "was "}
            {yoy !== null && <strong className="text-slate-800">{formatCurrency(prior.total)}</strong>}
            {yoy !== null ? " in " : ""}
            {prior.label}
          </p>
        </Motion.div>
      </div>

      <CardControls noun="payment method" index={card.index} count={card.count} kind={kind} offset={offset} onEntity={card.goEntity} onPeriod={card.goPeriod} />
    </div>
  );
};

export default PaymentMethodCard;
