import { useMemo } from "react";
import { filterReceipts } from "../utils/receiptFilters";
import { sortReceipts, sortYears } from "../utils/receiptSorting";

// Only iOS/Android-drafted receipts go in the amber Draft section.
const isToBeVerified = (r) => r.is_draft === "1";

/**
 * Any forwarded receipt (email-forwarded OR network-forwarded from another user)
 * that hasn't been opened yet. Goes in the REGULAR section with a blue "New" highlight.
 * The highlight clears when the user taps to view (is_verify flips to "1").
 */
export const isNewForwardedReceipt = (r) => {
  if (!r || r.is_draft === "1" || r.is_verify !== "0") return false;
  const hasEmailId =
    r.fk_incoming_email_id != null &&
    String(r.fk_incoming_email_id) !== "0";
  const isNetworkReceived =
    r.fk_forward_from_receipt_id != null &&
    String(r.fk_forward_from_receipt_id) !== "0";
  return hasEmailId || isNetworkReceived;
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
    // Sort draft receipts newest first
    draft.sort((a, b) => Number(b.product_date || 0) - Number(a.product_date || 0));
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
        : "Unknown";
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
