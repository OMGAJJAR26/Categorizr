import { useMemo } from "react";
import { filterReceipts } from "../utils/receiptFilters";
import { sortReceipts, sortYears } from "../utils/receiptSorting";

/**
 * A receipt is "to be verified" (Draft / eReceipt) when it was forwarded via
 * email to the app (fk_incoming_email_id is set) and has not yet been verified.
 *
 * "Received" receipts forwarded within the Categorizr Network have
 * fk_forward_from_receipt_id > 0 — those are NOT drafts; they go in the
 * regular list with a blue "Received" badge.
 *
 * Rules:
 *  - is_draft === "1"  → always a draft
 *  - fk_incoming_email_id non-null/non-zero AND is_verify === "0" → eReceipt to verify
 */
const isToBeVerified = (r) => {
  if (r.is_draft === "1") return true;
  const hasEmailId =
    r.fk_incoming_email_id &&
    r.fk_incoming_email_id !== "0" &&
    r.fk_incoming_email_id !== 0 &&
    r.fk_incoming_email_id !== null;
  // Explicitly exclude "Received" network receipts (fk_forward_from_receipt_id set)
  const isNetworkReceived =
    r.fk_forward_from_receipt_id &&
    r.fk_forward_from_receipt_id !== "0" &&
    r.fk_forward_from_receipt_id !== 0;
  if (isNetworkReceived) return false;
  return hasEmailId && r.is_verify === "0";
};

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
    return { draftReceipts: draft, regularReceipts: regular };
  }, [receipts]);

  const filteredDraftReceipts = useMemo(() => {
    return filterReceipts(draftReceipts, filters, searchTerm);
  }, [draftReceipts, filters, searchTerm]);

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
    draftReceipts: filteredDraftReceipts,
    groupedReceipts,
    yearTotals,
    sortedYears,
    filteredReceipts: sortedReceipts,
  };
};
