import { Briefcase, User } from "lucide-react";
import { expenseTypeDimension } from "../../utils/periodStats";
import SummaryCardV2 from "./SummaryCardV2";

// Personal and Business spending, one at a time (same layout as the Merchant card).
const ExpenseTypeCard = ({ receipts, types, formatCurrency }) => (
  <SummaryCardV2
    cardId="expense-type"
    label="Expense Type"
    receipts={receipts}
    entities={types}
    dimension={expenseTypeDimension}
    formatCurrency={formatCurrency}
    renderIdentity={(type) => {
      const Icon = type.key === "business" ? Briefcase : User;
      return (
        <span aria-hidden="true" className="shrink-0 w-14 h-14 rounded-2xl bg-slate-100 text-[#14203f] inline-flex items-center justify-center">
          <Icon size={26} />
        </span>
      );
    }}
  />
);

export default ExpenseTypeCard;
