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
 * iOS `shouldShowPendingVerificationBadge`.
 * is_verify is this verification flag (and drafts), not "the receipt was opened".
 * An eReceipt is any receipt whose fk_incoming_email_id is present and not "0".
 */
export const shouldShowPendingVerificationBadge = (r) => {
  if (!r) return false;
  const emailId = r.fk_incoming_email_id;
  const isEReceipt =
    emailId != null && String(emailId).trim() !== "" && String(emailId) !== "0";
  const isVerify = String(r.is_verify ?? "0") === "1";
  const isDraft = String(r.is_draft ?? "0") === "1";
  return (isEReceipt && !isVerify) || isDraft;
};

/**
 * iOS isRead after the first local insert:
 *   read when status == 1 and the pending-verification badge is off
 *   unread otherwise (status missing counts as -1, which is unread)
 * On the very first insert, iOS instead marks every non-pending receipt read
 * and only the next sync applies this rule. Steady state is this rule.
 */
export const isReceiptRead = (r) => {
  if (!r) return true;
  const raw = r.status != null && r.status !== "" ? r.status : r.Status;
  const status = raw == null || raw === "" ? -1 : Number(raw);
  return status === 1 && !shouldShowPendingVerificationBadge(r);
};

const isNetworkReceivedReceipt = (r) =>
  r?.fk_forward_from_receipt_id != null &&
  String(r.fk_forward_from_receipt_id) !== "0";

/**
 * Blue "New" highlight for a received (network-forwarded) receipt.
 * Highlight follows the mobile (iOS/Android) read rule EXACTLY:
 *   let status = receipt.status ?? -1
 *   isRead = (status == 1 && !shouldShowPendingVerificationBadge) ? 1 : 0
 * The highlight is the inverse — a received forward is highlighted while it is
 * UNREAD (status != 1, or still pending verification; missing status → -1 →
 * unread). isReceiptRead() above is that mobile condition, so this is !isRead.
 * Drafts never highlight here (they surface in the draft section via isToBeVerified).
 */
export const isNewForwardedReceipt = (r) => {
  if (!r || String(r.is_draft ?? "0") === "1") return false;
  if (!isNetworkReceivedReceipt(r)) return false;
  return !isReceiptRead(r);
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
