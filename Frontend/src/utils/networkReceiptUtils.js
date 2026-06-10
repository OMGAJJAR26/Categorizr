/** Receipt forwarded to this user via Categorizr Network (not email). */
export const isNetworkReceivedReceipt = (receipt) => {
  const id = receipt?.fk_forward_from_receipt_id;
  return id != null && id !== "" && id !== "0" && id !== 0;
};
