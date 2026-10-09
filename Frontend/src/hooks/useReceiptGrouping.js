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
 * Same rule iOS uses for isRead after the first sync:
 * read only when status is 1 and the receipt is not still pending verification.
 * Pending verification is an unverified email eReceipt or a draft.
 * is_verify by itself is not "opened" — the legacy server sets it while copying
 * tax lines, and that must not clear the blue highlight.
 */
export const isReceiptSeen = (r) => {
  if (!r) return false;
  const raw = r.status;
  const status = raw == null || raw === "" ? -1 : Number(raw);
  if (status !== 1) return false;
  const emailId = r.fk_incoming_email_id;
  const isEReceipt =
    emailId != null && String(emailId).trim() !== "" && String(emailId) !== "0";
  const isVerify = String(r.is_verify ?? "0") === "1";
  const isDraft = String(r.is_draft ?? "0") === "1";
  const pendingVerification = (isEReceipt && !isVerify) || isDraft;
  return !pendingVerification;
};

const isNetworkReceivedReceipt = (r) =>
  r?.fk_forward_from_receipt_id != null &&
  String(r.fk_forward_from_receipt_id) !== "0";

/**
 * Blue "New" highlight for a received (network-forwarded) receipt only.
 *
 * Keyed off `status` — the read flag the receipt API returns for forwards
 * (0 => Unread, 1 => Read). The highlight shows while status is 0 (or absent)
 * and comes off once a device OPENS the receipt, which persists status=1 and
 * syncs across web/iOS/Android. (is_verify is NOT returned for forwarded
 * receipts, so it can't drive this.)
 */
export const isNewForwardedReceipt = (r) => {
  if (!r || String(r.is_draft ?? "0") === "1") return false;
  if (!isNetworkReceivedReceipt(r)) return false;
  const raw = r.status;
  const status = raw == null || raw === "" ? -1 : Number(raw);
  return status !== 1;
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
    // Sort drafts the same way as the main list: newest day, then highest
    // total, then Describe Purchase (merchant name when that field is empty),
    // then merchant, then id.
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
