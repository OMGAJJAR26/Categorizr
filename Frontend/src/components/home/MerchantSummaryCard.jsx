import MerchantAvatar from "../MerchantAvatar";
import { merchantDimension } from "../../utils/periodStats";
import SummaryCardV2 from "./SummaryCardV2";

// One merchant at a time (see SummaryCardV2 for the layout and gestures).
const MerchantSummaryCard = ({ receipts, merchants, logoByKey, formatCurrency }) => (
  <SummaryCardV2
    cardId="merchant"
    label="Merchant"
    receipts={receipts}
    entities={merchants}
    dimension={merchantDimension}
    formatCurrency={formatCurrency}
    renderIdentity={(merchant) => (
      <MerchantAvatar
        key={merchant.key}
        name={merchant.name}
        explicitUrl={logoByKey.get(merchant.key) || ""}
        className="w-14 h-14 shrink-0"
      />
    )}
  />
);

export default MerchantSummaryCard;
