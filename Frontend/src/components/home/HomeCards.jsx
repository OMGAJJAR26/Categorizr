import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useData } from "../../context/DataContext";
import { useCurrency } from "../../context/CurrencyContext";
import {
  categoryDimension,
  expenseTypeDimension,
  listEntities,
  merchantDimension,
  taxDimension,
} from "../../utils/periodStats";
import { normalizeMerchantKey } from "../../utils/merchantListUtils";
import { mergeVisibleOrder, moveWithin, normalizeOrder, sameOrder } from "../../utils/cardOrder";
import ExpenseTypeCard from "./ExpenseTypeCard";
import ReorderableCard from "./ReorderableCard";
import MerchantSummaryCard from "./MerchantSummaryCard";
import PaymentMethodCard from "./PaymentMethodCard";
import ExpenseCategoryCard from "./ExpenseCategoryCard";
import TaxTypeCard from "./TaxTypeCard";
import { paymentMethodDimension } from "./summaryDimensions";

const looseKey = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Keep only the items the user still has in Settings (so hidden / deleted ones do not
// reappear from old receipts). If that list is not ready, or would leave nothing, show all.
const onlyKnown = (items, knownNames, keyOf) => {
  const known = new Set((knownNames || []).map(keyOf).filter(Boolean));
  if (!known.size) return items;
  const kept = items.filter((item) => known.has(item.key));
  return kept.length ? kept : items;
};

// Left to right. `label` is what the Cards menu shows.
const CARD_LIST = [
  { id: "expenseType", label: "Expense Type" },
  { id: "merchant", label: "Merchant" },
  { id: "payment", label: "Payment Method" },
  { id: "category", label: "Expense Category" },
  { id: "tax", label: "Tax Type" },
];

const DEFAULT_ORDER = CARD_LIST.map((c) => c.id);
const ORDER_KEY = "home_cards_order";
const readOrder = () => {
  try {
    return normalizeOrder(JSON.parse(localStorage.getItem(ORDER_KEY) || "null"), DEFAULT_ORDER);
  } catch {
    return DEFAULT_ORDER;
  }
};

const VISIBLE_KEY = "home_cards_visible";
const allOn = () => Object.fromEntries(CARD_LIST.map((c) => [c.id, true]));
const readVisible = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(VISIBLE_KEY) || "null");
    if (saved && typeof saved === "object") return { ...allOn(), ...saved };
  } catch {
    /* unreadable: show everything */
  }
  return allOn();
};

const NO_RECEIPTS = [];
const CARD_WIDTH = 380; // px, from tablet width up; on phones the cards stack full width

// The "Cards" button and the list of cards it can show or hide.
const CardsMenu = ({ visible, onChange, onAll, orderChanged, onResetOrder }) => {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const count = CARD_LIST.filter((c) => visible[c.id]).length;

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="m-0 px-3 h-10 inline-flex items-center gap-2 rounded-xl border border-[#14203f] bg-white text-sm font-semibold text-[#14203f] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <LayoutGrid size={16} aria-hidden="true" />
        Cards
        <span className="min-w-[22px] h-[22px] px-1.5 inline-flex items-center justify-center rounded-full bg-[#14203f] text-xs font-bold text-white tabular-nums">
          {count}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Show cards"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[250px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(20,32,63,0.18)]"
        >
          <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Show cards</p>
          <ul className="flex flex-col">
            {CARD_LIST.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 px-1 py-2 rounded-lg cursor-pointer hover:bg-slate-50 text-[15px] font-semibold text-[#14203f]">
                  <input
                    type="checkbox"
                    checked={!!visible[c.id]}
                    onChange={() => onChange(c.id)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`m-0 w-5 h-5 rounded-md border-2 inline-flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                      visible[c.id] ? "bg-[#2b3f78] border-[#2b3f78] text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    {visible[c.id] && <Check size={14} strokeWidth={3} />}
                  </span>
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
            <button type="button" onClick={() => onAll(true)} className="m-0 p-1 text-sm font-semibold text-[#2b3f78] hover:underline">
              Show all
            </button>
            <button type="button" onClick={() => onAll(false)} className="m-0 p-1 text-sm font-semibold text-[#2b3f78] hover:underline">
              Hide all
            </button>
          </div>
          {orderChanged && (
            <button
              type="button"
              onClick={onResetOrder}
              className="mt-1 w-full m-0 p-1 text-left text-sm font-semibold text-[#2b3f78] hover:underline"
            >
              Reset card order
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// The summary cards at the top of the home page: Expense Type, Merchant, Payment Method,
// Expense Category and Tax Type, in a row that scrolls sideways (stacked on phones).
//
// `receipts` is what the list below is currently showing: saved receipts that pass the
// filters and search, so the cards always add up exactly what the user has filtered to.
// A card with nothing to show is left out.
const HomeCards = ({ receipts, hasAnyReceipts }) => {
  const {
    isMerchantHidden,
    merchantsWithImages,
    expenseCategories: visibleCategoryNames,
    taxData,
  } = useData();
  const { formatCurrency } = useCurrency();
  const saved = receipts || NO_RECEIPTS;

  const [visible, setVisible] = useState(readVisible);
  const persist = (next) => {
    try {
      localStorage.setItem(VISIBLE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: still applies for this visit */
    }
  };
  const toggleCard = (id) =>
    setVisible((v) => {
      const next = { ...v, [id]: !v[id] };
      persist(next);
      return next;
    });
  const setAll = (on) => {
    const next = Object.fromEntries(CARD_LIST.map((c) => [c.id, on]));
    persist(next);
    setVisible(next);
  };

  const [order, setOrder] = useState(readOrder);
  const commitOrder = (next) => {
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: the new order still applies for this visit */
    }
  };

  // Side by side from tablet width up, stacked on phones: that decides which way cards drag.
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // While a card is lifted, scroll the row (or the page, on phones) when it is dragged to an edge.
  const strip = useRef(null);
  const [lifting, setLifting] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!lifting) return undefined;
    const track = (e) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", track);
    let raf = 0;
    const EDGE = 80;
    const tick = () => {
      const { x, y } = pointer.current;
      if (wide && strip.current) {
        const r = strip.current.getBoundingClientRect();
        if (x < r.left + EDGE) strip.current.scrollLeft -= 14;
        else if (x > r.right - EDGE) strip.current.scrollLeft += 14;
      } else if (!wide) {
        if (y < EDGE + 60) window.scrollBy(0, -12);
        else if (y > window.innerHeight - EDGE) window.scrollBy(0, 12);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", track);
      cancelAnimationFrame(raf);
    };
  }, [lifting, wide]);

  const expenseTypes = useMemo(() => listEntities(saved, expenseTypeDimension), [saved]);

  // Every merchant with a saved receipt, minus the ones the user hid or deleted. (The
  // merchant dropdowns also drop "starter" stores the account never saved, which would
  // hide busy merchants such as Home Depot here, so that rule is not used.)
  const merchants = useMemo(() => {
    const all = listEntities(saved, merchantDimension);
    const shown = all.filter((m) => !isMerchantHidden(m.name));
    return shown.length ? shown : all;
  }, [saved, isMerchantHidden]);
  const methods = useMemo(() => listEntities(saved, paymentMethodDimension), [saved]);
  const categories = useMemo(
    () => onlyKnown(listEntities(saved, categoryDimension), visibleCategoryNames, looseKey),
    [saved, visibleCategoryNames],
  );
  const taxTypes = useMemo(
    () =>
      onlyKnown(
        listEntities(saved, taxDimension),
        (taxData || []).map((t) => t?.tax_name),
        looseKey,
      ),
    [saved, taxData],
  );

  const logoByKey = useMemo(() => {
    const map = new Map();
    (merchantsWithImages || []).forEach((m) => {
      if (m?.name && m.image) map.set(normalizeMerchantKey(m.name), m.image);
    });
    return map;
  }, [merchantsWithImages]);

  // Sideways scrolling: arrows appear at an end only while there is more that way.
  const [more, setMore] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setMore({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);
  useEffect(() => {
    const el = strip.current;
    measure();
    if (!el) return undefined;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  });
  const scrollBy = (dir) => strip.current?.scrollBy({ left: dir * (CARD_WIDTH + 16), behavior: "smooth" });

  if (!hasAnyReceipts) return null;

  const cards = [
    {
      id: "expenseType",
      show: expenseTypes.length > 0,
      node: <ExpenseTypeCard receipts={saved} types={expenseTypes} formatCurrency={formatCurrency} />,
    },
    {
      id: "merchant",
      show: merchants.length > 0,
      node: <MerchantSummaryCard receipts={saved} merchants={merchants} logoByKey={logoByKey} formatCurrency={formatCurrency} />,
    },
    {
      id: "payment",
      show: methods.length > 0,
      node: <PaymentMethodCard receipts={saved} methods={methods} formatCurrency={formatCurrency} />,
    },
    {
      id: "category",
      show: categories.length > 0,
      node: <ExpenseCategoryCard receipts={saved} categories={categories} formatCurrency={formatCurrency} />,
    },
    {
      id: "tax",
      show: taxTypes.length > 0,
      node: <TaxTypeCard receipts={saved} taxTypes={taxTypes} formatCurrency={formatCurrency} />,
    },
  ];
  const shown = cards
    .filter((c) => visible[c.id] && c.show)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const shownIds = shown.map((c) => c.id);
  const anyChosen = CARD_LIST.some((c) => visible[c.id]);

  // Hidden cards keep their slot while the visible ones are rearranged.
  const rearrange = (ids) => commitOrder(mergeVisibleOrder(order, ids));
  const moveCard = (id, delta) => rearrange(moveWithin(shownIds, id, delta));

  return (
    <section aria-label="Summary cards" className="px-3 sm:px-4 md:px-6 pt-3 pb-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-slate-400">Press and hold a card to rearrange</p>
        <CardsMenu
          visible={visible}
          onChange={toggleCard}
          onAll={setAll}
          orderChanged={!sameOrder(order, DEFAULT_ORDER)}
          onResetOrder={() => commitOrder(DEFAULT_ORDER)}
        />
      </div>

      {anyChosen && shown.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">No receipts match the current filters.</p>
      )}

      {shown.length > 0 && (
        <div className="relative">
          <Reorder.Group
            as="div"
            axis={wide ? "x" : "y"}
            values={shownIds}
            onReorder={rearrange}
            layoutScroll
            ref={strip}
            className="flex flex-col md:flex-row gap-4 items-stretch md:overflow-x-auto md:pb-2"
          >
            {shown.map((c) => (
              <ReorderableCard
                key={c.id}
                id={c.id}
                onLift={setLifting}
                onMove={moveCard}
                className="min-w-0 md:w-[380px] md:shrink-0"
              >
                {c.node}
              </ReorderableCard>
            ))}
          </Reorder.Group>
          {more.left && (
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Scroll cards left"
              className="hidden md:inline-flex absolute left-1 top-1/2 -translate-y-1/2 m-0 p-0 w-10 h-10 items-center justify-center rounded-full bg-white/95 border border-slate-300 shadow-md text-[#14203f] hover:bg-white"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {more.right && (
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Scroll cards right"
              className="hidden md:inline-flex absolute right-1 top-1/2 -translate-y-1/2 m-0 p-0 w-10 h-10 items-center justify-center rounded-full bg-white/95 border border-slate-300 shadow-md text-[#14203f] hover:bg-white"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default HomeCards;
