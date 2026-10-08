import html2pdf from "html2pdf.js";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * html2canvas paints a blank page when the source is not in the document,
 * when an iframe is in the tree, or when a cross-origin image taints the canvas.
 * Mount the markup, inline images we can read, and drop the rest.
 */
async function preparePdfHost(htmlContent) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    "width:1200px",
    "background:#ffffff",
  ].join(";");
  host.innerHTML = htmlContent;
  document.body.appendChild(host);

  host.querySelectorAll("iframe").forEach((frame) => {
    const note = document.createElement("div");
    note.className = "image-notice";
    note.textContent =
      "Receipt PDF is stored with this receipt and is not embedded in this export.";
    frame.replaceWith(note);
  });

  const images = [...host.querySelectorAll("img")];
  for (const img of images) {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
    try {
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (!String(blob.type || "").startsWith("image/")) throw new Error("not-image");
      img.setAttribute("src", await blobToDataUrl(blob));
    } catch {
      const note = document.createElement("div");
      note.className = "image-notice";
      note.textContent = "Receipt image is stored with this receipt.";
      img.replaceWith(note);
    }
  }

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  return host;
}

export async function renderHtmlToPdfBlob(htmlContent, options = {}) {
  const host = await preparePdfHost(htmlContent);
  try {
    return await html2pdf()
      .set({
        margin: options.margin ?? 10,
        filename: options.filename || "report.pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          backgroundColor: "#ffffff",
        },
        jsPDF: options.jsPDF || {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
        },
        enableLinks: options.enableLinks ?? false,
      })
      .from(host)
      .outputPdf("blob");
  } finally {
    host.remove();
  }
}

export async function downloadHtmlPdf(htmlContent, options = {}) {
  const blob = await renderHtmlToPdfBlob(htmlContent, options);
  const filename = options.filename || "report.pdf";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
