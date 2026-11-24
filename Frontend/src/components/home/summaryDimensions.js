import { paymentDimension } from "../../utils/periodStats";
import { getPaymentDisplayFromReceipt } from "../../hooks/usePaymentDisplay";

// The label the app already shows for a receipt's payment method ("Visa *4242", "Cash" ...).
export const paymentMethodDimension = paymentDimension(getPaymentDisplayFromReceipt);
