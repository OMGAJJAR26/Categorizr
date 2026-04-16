import { useMemo } from "react";
import { filterReceipts } from "../utils/receiptFilters";
import { sortReceipts, sortYears } from "../utils/receiptSorting";

/**
 * A receipt is "to be verified" (Draft) when:
 *  - is_draft === "1"  (explicitly flagged as draft), OR
 *  - is_verify === "0" AND has fk_incoming_email_id (came via forwarded email), OR
 *  - is_verify === "0" AND has fk_original_receipt_id > 0 (linked eReceipt)
 *
 * These are displayed in a top "Draft Receipts" section, NOT in the year groups.
 */
const isToBeVerified = (r) => {
  if (r.is_draft === "1") return true;
  const hasEmailId =
    r.fk_incoming_email_id &&
    r.fk_incoming_email_id !== "0" &&
    r.fk_incoming_email_id !== 0;
  const hasOriginalId =
    r.fk_original_receipt_id &&
    r.fk_original_receipt_id !== "0" &&
    r.fk_original_receipt_id !== 0;
  return r.is_verify === "0" && (hasEmailId || hasOriginalId);
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
        ? new Date(Number(receipt.product_date) * 1000).getFullYear()
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
