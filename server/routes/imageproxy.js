import express from "express";

const router = express.Router();

/**
 * GET /api/imageproxy?url=ENCODED_URL
 *
 * Server-side image proxy.  Fetches a remote image and pipes it back to the
 * client with permissive CORS headers so that third-party images blocked by
 * "Cross-Origin-Resource-Policy: same-origin" (e.g. logos-world.net) can be
 * displayed on the Vercel staging / production frontend.
 *
 * The request is made from the Node server (not the browser) so hotlink
 * protection is bypassed – we also spoof a Referer from categorizr.com.
 */
router.get("/", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "url query parameter is required" });
  }

  // Basic sanity check – only allow http(s) URLs
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://categorizr.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Remote server returned ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Only allow image content types
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ error: "URL does not point to an image" });
    }

    const buffer = await response.arrayBuffer();

    // Return the image with permissive CORS + resource policy headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 24 h
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("imageproxy error:", err.message);
    return res.status(502).json({ error: "Failed to fetch image" });
  }
});

export default router;
