import { useMemo } from "react";
import { filterReceipts } from "../utils/receiptFilters";
import { sortReceipts, sortYears, compareByDayThenTotal } from "../utils/receiptSorting";

/**
 * Receipts that belong in the amber "Draft / To Be Verified" section.
 * Mirrors the isDraft condition in ReceiptDetail.jsx exactly:
 *   1. iOS/Android manually-drafted receipts (is_draft === "1")
 *   2. Email-received eReceipts (fk_incoming_email_id set, NOT a network-forward)
 *      that haven't been saved yet (is_verify !== "1")
 */
const isToBeVerified = (r) => {
  if (!r) return false;
  if (r.is_draft === "1") return true;
  const hasEmailId =
    r.fk_incoming_email_id != null &&
    r.fk_incoming_email_id !== "0" &&
    r.fk_incoming_email_id !== 0 &&
    r.fk_incoming_email_id !== null;
  const isNetworkReceived =
    r.fk_forward_from_receipt_id != null &&
    r.fk_forward_from_receipt_id !== "0" &&
    r.fk_forward_from_receipt_id !== 0;
  return hasEmailId && !isNetworkReceived && String(r?.is_verify ?? "0") !== "1";
};

/**
 * Network-forwarded receipts (sent from another Categorizr user via the app)
 * that haven't been opened yet. Goes in the REGULAR section with a blue "New" highlight.
 * Email-received receipts (fk_incoming_email_id) are drafts — they use isToBeVerified instead.
 */
export const isNewForwardedReceipt = (r) => {
  if (!r || r.is_draft === "1" || r.is_verify !== "0") return false;
  // Respect the cross-device read state: a received receipt the user already
  // opened on ANOTHER device (the mobile app sets status="1" when read) should
  // not re-highlight here on a synced device. The highlight clears when the
  // receipt is read anywhere — via is_verify (opened on the WebApp) OR status
  // (read on mobile). Tradeoff: status can occasionally be flipped by the mobile
  // app / auto-refresh, which may clear the highlight before it's viewed here.
  if (String(r.status ?? "0") === "1") return false;
  const isNetworkReceived =
    r.fk_forward_from_receipt_id != null &&
    String(r.fk_forward_from_receipt_id) !== "0";
  return isNetworkReceived;
};

/** @deprecated Use isNewForwardedReceipt instead */
export const isNewForwardedEmailReceipt = isNewForwardedReceipt;

export const useReceiptGrouping = (receipts, filters, sortConfig, searchTerm) => {
  // Split ALL receipts into draft vs regular BEFORE applying user filters.
  // Draft receipts bypass the normal filter/sort pipeline and are shown in a
  // dedicated section at the top of the list.
  const { draftReceipts, regularReceipts } = useMemo(() => {
    const all = receipts || [];
    const draft = [];
    const regular = [];
    all.forEach((r) => {
      if (isToBeVerified(r)) draft.push(r);
      else regular.push(r);
    });
    // Sort drafts the same way as the main list: newest day first, then largest
    // total → smallest for that day, then a stable id tiebreaker (so Split /
    // Duplicate drafts keep the same order across logout/login).
    draft.sort(compareByDayThenTotal);
    // Apply the same filters to drafts so they respect active filter selections
    const filteredDraft = filterReceipts(draft, filters, searchTerm);
    return { draftReceipts: filteredDraft, regularReceipts: regular };
  }, [receipts, filters, searchTerm]);

  const filteredReceipts = useMemo(() => {
    return filterReceipts(regularReceipts, filters, searchTerm);
  }, [regularReceipts, filters, searchTerm]);

  const sortedReceipts = useMemo(() => {
    return sortReceipts(filteredReceipts, sortConfig);
  }, [filteredReceipts, sortConfig]);

  const { groupedReceipts, yearTotals, sortedYears } = useMemo(() => {
    if (!sortedReceipts.length) {
      return { groupedReceipts: {}, yearTotals: {}, sortedYears: [] };
    }

    // Group by year
    const groupedByYear = sortedReceipts.reduce((acc, receipt) => {
      const year = receipt.product_date
        ? new Date(Number(receipt.product_date) * 1000).getUTCFullYear()
        : "No Date";
      if (!acc[year]) acc[year] = [];
      acc[year].push(receipt);
      return acc;
    }, {});

    // Calculate year totals
    const yearTotals = {};
    Object.keys(groupedByYear).forEach((year) => {
      yearTotals[year] = groupedByYear[year].reduce(
        (sum, r) => sum + (Number(r.purchasePrice) || 0),
        0
      );
    });

    // Sort years based on sortConfig
    const sortedYears = sortYears(groupedByYear, yearTotals, sortConfig);

    return {
      groupedReceipts: groupedByYear,
      yearTotals,
      sortedYears,
    };
  }, [sortedReceipts, sortConfig]);

  return {
    draftReceipts,
    groupedReceipts,
    yearTotals,
    sortedYears,
    filteredReceipts: sortedReceipts,
  };
};
