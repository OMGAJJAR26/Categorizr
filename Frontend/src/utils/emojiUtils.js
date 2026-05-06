/**
 * Returns true if the string contains any emoji characters.
 * Uses Unicode Extended_Pictographic + common symbol ranges.
 */
export const containsEmoji = (str) => {
  if (!str) return false;
  // Extended pictographic covers virtually all emoji (faces, objects, symbols, flags…)
  return /\p{Extended_Pictographic}/u.test(str);
};
