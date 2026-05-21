export const TAX_RATE_DECIMAL_LIMIT_MSG =
  "Maximum tax rate of 99.999% exceeded.";
export const TAX_RATE_WHOLE_LIMIT_MSG =
  "Maximum tax rate of 99.999% exceeded.";

const TAX_RATE_MAX = 99.999;

/** Clamp tax rate; flags when input exceeds digit limits (before clamp). */
export function parseTaxRateInput(raw) {
  let v = String(raw ?? "").replace(/%/g, "").replace(/[^\d.]/g, "");
  const dotIdx = v.indexOf(".");
  let rejectKind = null;
  if (dotIdx !== -1) {
    v = v.slice(0, dotIdx + 1) + v.slice(dotIdx + 1).replace(/\./g, "");
    const [whole = "", dec = ""] = v.split(".");
    if (dec.length > 3) rejectKind = "decimal";
    else if (whole.length > 2) rejectKind = "whole";
    v = whole.slice(0, 2) + "." + dec.slice(0, 3);
  } else if (v.length > 2) {
    rejectKind = "whole";
    v = v.slice(0, 2);
  }
  const num = parseFloat(v);
  if (!isNaN(num) && num > TAX_RATE_MAX) rejectKind = "whole";
  const message =
    rejectKind === "decimal"
      ? TAX_RATE_DECIMAL_LIMIT_MSG
      : rejectKind === "whole"
        ? TAX_RATE_WHOLE_LIMIT_MSG
        : "";
  return { value: v, rejected: !!rejectKind, message };
}

export function getTaxRateKeydownLimitMessage(currentValue, key, selectionStart = null) {
  if (!/^\d$/.test(key)) return null;
  const str = String(currentValue ?? "").replace(/%/g, "").trim();
  const dotIdx = str.indexOf(".");
  const pos =
    selectionStart == null ? str.length : Math.max(0, selectionStart);

  if (dotIdx !== -1) {
    if (pos <= dotIdx) {
      const whole = str.slice(0, dotIdx);
      if (whole.length >= 2) return TAX_RATE_WHOLE_LIMIT_MSG;
    } else {
      const dec = str.slice(dotIdx + 1).replace(/\./g, "");
      if (dec.length >= 3) return TAX_RATE_DECIMAL_LIMIT_MSG;
    }
    return null;
  }

  if (str.length >= 2) return TAX_RATE_WHOLE_LIMIT_MSG;
  return null;
}

export function createTaxRateKeyDownHandler(currentValue, showAlert) {
  return (e) => {
    if (e.ctrlKey || e.metaKey) return;
    const allowed = [
      "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Tab", "Enter", "Home", "End",
    ];
    if (allowed.includes(e.key)) return;
    if (/^\d$/.test(e.key)) {
      const start = e.target?.selectionStart ?? null;
      const msg = getTaxRateKeydownLimitMessage(currentValue, e.key, start);
      if (msg) {
        e.preventDefault();
        showAlert(msg);
      }
      return;
    }
    if (e.key === ".") {
      if (String(currentValue ?? "").includes(".")) e.preventDefault();
      return;
    }
    e.preventDefault();
  };
}
