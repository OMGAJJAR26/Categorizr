// Small helpers shared by the summary cards.

// "+25.0%" rounded to one decimal, or null when there is nothing to compare with.
// Past 1,000% the decimal adds nothing, and thousands separators keep it readable.
export const yoyText = (yoy) => {
  if (yoy === null) return null;
  const digits = Math.abs(yoy) >= 1000 ? 0 : 1;
  const shown = Math.abs(yoy).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (Number(yoy.toFixed(1)) === 0) return `${shown}%`;
  return `${yoy > 0 ? "+" : "-"}${shown}%`;
};

export const CARD_BASE =
  "relative w-full h-full flex flex-col select-none rounded-2xl p-4 sm:p-5 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
export const CARD_WHITE = `${CARD_BASE} bg-white border border-slate-200/80 shadow-[0_8px_30px_rgba(29,78,216,0.08)]`;
