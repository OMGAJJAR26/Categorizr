// Browsers word the failure of a dynamic import() differently. After a deploy, or on a
// dropped connection, loading a page or modal that is fetched on demand can fail with
// one of these messages; the error screen explains that case more helpfully.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite
  /Loading (CSS )?chunk [\w-]+ failed/i,
];

export const isChunkLoadError = (error) => {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const message = typeof error === "string" ? error : String(error.message ?? "");
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};
