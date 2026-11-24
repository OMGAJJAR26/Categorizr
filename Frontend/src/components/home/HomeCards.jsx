import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useData } from "../../context/DataContext";
import { useCurrency } from "../../context/CurrencyContext";
import { isToBeVerified } from "../../hooks/useReceiptGrouping";
import {
  categoryDimension,
  listEntities,
  merchantDimension,
  taxDimension,
} from "../../utils/periodStats";
import { normalizeMerchantKey } from "../../utils/merchantListUtils";
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

const OPEN_KEY = "home_summary_cards_open";
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
};

// The row of summary cards at the top of the home page: Merchant, Payment Method, Expense
// Category and Tax Type. Cards ignore the list's filters and search: they always summarise
// everything saved. A card with nothing to show is left out.
const HomeCards = () => {
  const {
    receipts,
    isMerchantHidden,
    merchantsWithImages,
    expenseCategories: visibleCategoryNames,
    taxData,
  } = useData();
  const { formatCurrency } = useCurrency();
  // On phones the four cards stack and push the receipts far down, so they can be folded
  // away (the choice is remembered). From tablet width up they are always shown.
  const [open, setOpen] = useState(readOpen);
  const toggleOpen = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* storage unavailable: still toggles for this visit */
      }
      return !v;
    });
  };

  // Drafts ("to be verified") are not saved receipts yet, so they do not count.
  const saved = useMemo(() => (receipts || []).filter((r) => !isToBeVerified(r)), [receipts]);

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

  if (!merchants.length && !methods.length && !categories.length && !taxTypes.length) return null;

  return (
    <section aria-label="Summary cards" className="px-3 sm:px-4 md:px-6 pt-4 pb-3 sm:pt-5">
      <div className="md:hidden flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700">Summary</h2>
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-controls="home-summary-cards"
          className="m-0 p-0 min-h-[36px] inline-flex items-center gap-1 px-2 rounded-full text-sm font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {open ? "Hide" : "Show"}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      <div
        id="home-summary-cards"
        className={`${open ? "grid" : "hidden md:grid"} grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch`}
      >
        {merchants.length > 0 && (
          <div className="min-w-0">
            <MerchantSummaryCard receipts={saved} merchants={merchants} logoByKey={logoByKey} formatCurrency={formatCurrency} />
          </div>
        )}
        {methods.length > 0 && (
          <div className="min-w-0">
            <PaymentMethodCard receipts={saved} methods={methods} formatCurrency={formatCurrency} />
          </div>
        )}
        {categories.length > 0 && (
          <div className="min-w-0">
            <ExpenseCategoryCard receipts={saved} categories={categories} formatCurrency={formatCurrency} />
          </div>
        )}
        {taxTypes.length > 0 && (
          <div className="min-w-0">
            <TaxTypeCard receipts={saved} taxTypes={taxTypes} formatCurrency={formatCurrency} />
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeCards;
