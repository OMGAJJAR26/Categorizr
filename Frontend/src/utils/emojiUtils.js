/**
 * Returns true if the string contains any emoji character.
 * Uses explicit Unicode codepoint ranges — no Unicode property escapes
 * so this works regardless of build-tool regex transformation.
 *
 * Covers: emoticons, misc symbols, pictographs, dingbats, flags,
 * supplemental symbols, and variation selectors.
 */
export const containsEmoji = (str) => {
  if (!str) return false;
  for (const char of str) {
    const code = char.codePointAt(0);
    if (
      (code >= 0x1F300 && code <= 0x1F9FF) || // Misc Symbols, Emoticons, Transport, Supplemental
      (code >= 0x1FA00 && code <= 0x1FAFF) || // Extended Pictographic (chess, medical, etc.)
      (code >= 0x2600  && code <= 0x27BF)  || // Misc Symbols & Dingbats
      (code >= 0x2300  && code <= 0x23FF)  || // Misc Technical (clocks, etc.)
      (code >= 0x1F000 && code <= 0x1F02F) || // Mahjong tiles
      (code >= 0x1F0A0 && code <= 0x1F0FF) || // Playing cards
      (code >= 0x1F100 && code <= 0x1F1FF) || // Enclosed Alphanumeric Supplement
      (code >= 0x1F200 && code <= 0x1F2FF) || // Enclosed CJK Letters Supplement
      (code >= 0xFE00  && code <= 0xFE0F)  || // Variation selectors (emoji modifiers)
      code === 0x200D                          // Zero-width joiner (multi-part emoji)
    ) return true;
  }
  return false;
};

/**
 * Strips all emoji characters from a string (for real-time input filtering).
 */
export const stripEmoji = (str) => {
  if (!str) return str;
  return Array.from(str).filter(ch => !containsEmoji(ch)).join("");
};
