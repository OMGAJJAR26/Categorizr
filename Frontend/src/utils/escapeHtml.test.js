import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, safeLinkUrl } from "./escapeHtml.js";

test("escapes the five characters that matter in HTML text and attributes", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("AT&T"), "AT&amp;T");
  assert.equal(escapeHtml("Lowe's"), "Lowe&#39;s");
  assert.equal(escapeHtml(`" onmouseover="x`), "&quot; onmouseover=&quot;x");
});

test("escapes & first so existing entities are shown literally, never double-decoded", () => {
  assert.equal(escapeHtml("&lt;b&gt;"), "&amp;lt;b&amp;gt;");
});

test("leaves ordinary text unchanged", () => {
  assert.equal(escapeHtml("Home Depot"), "Home Depot");
  assert.equal(escapeHtml("Visa *1111"), "Visa *1111");
  assert.equal(escapeHtml("—"), "—");
});

test("null, undefined and numbers become strings instead of throwing", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(12.5), "12.5");
});

test("safeLinkUrl keeps http(s) and inline images", () => {
  assert.equal(safeLinkUrl("https://storage.googleapis.com/b/r.png"), "https://storage.googleapis.com/b/r.png");
  assert.equal(safeLinkUrl("  http://example.com/a.pdf "), "http://example.com/a.pdf");
  assert.equal(safeLinkUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(safeLinkUrl("DATA:IMAGE/JPEG;base64,AAAA"), "DATA:IMAGE/JPEG;base64,AAAA");
});

test("safeLinkUrl drops script and non-link values", () => {
  assert.equal(safeLinkUrl("javascript:alert(1)"), "");
  assert.equal(safeLinkUrl("JavaScript:alert(1)//x.pdf"), "");
  assert.equal(safeLinkUrl("  javascript:alert(1)"), "");
  assert.equal(safeLinkUrl("vbscript:msgbox(1)"), "");
  assert.equal(safeLinkUrl("data:text/html;base64,PHNjcmlwdD4="), "");
  assert.equal(safeLinkUrl("data:application/pdf;base64,AAAA"), "");
  assert.equal(safeLinkUrl("0"), "");
  assert.equal(safeLinkUrl(""), "");
  assert.equal(safeLinkUrl(null), "");
  assert.equal(safeLinkUrl("/relative/path.png"), "");
});
