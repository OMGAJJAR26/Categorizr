import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLast4FromPaymentApiRecord,
  getPaymentMethodListLabel,
  normalizeLast4,
  parsePaymentDisplay,
  stripLast4Suffix,
} from "./paymentMethodUtils.js";

// Reported case: a receipt saved against a payment method with no card number ends up
// with card_issuer_name "Bank of America", last_4_digit_card "0" and paymentType
// "American Express *0". The junk " *0" suffix used to survive every strip (they all
// required 3-4 digits) and then made the edit screen treat "American Express" as
// corrupt, replacing it with the issuer name and a MasterCard logo.
describe("payment last4 suffix handling", () => {
  it("strips a single-digit *0 suffix, not just 3-4 digit ones", () => {
    assert.equal(stripLast4Suffix("American Express *0"), "American Express");
    assert.equal(stripLast4Suffix("Visa *1234"), "Visa");
    assert.equal(stripLast4Suffix("Other *0009 *0009"), "Other");
    assert.equal(stripLast4Suffix("MasterCard"), "MasterCard");
    assert.equal(stripLast4Suffix(""), "");
    assert.equal(stripLast4Suffix(null), "");
  });

  it("only treats 3-4 digits as a real last4", () => {
    assert.equal(normalizeLast4("1234"), "1234");
    assert.equal(normalizeLast4("123"), "123");
    assert.equal(normalizeLast4("0"), "");
    assert.equal(normalizeLast4(""), "");
    assert.equal(normalizeLast4("12"), "");
    assert.equal(normalizeLast4("abcd"), "");
  });

  it("keeps a genuine card ending in 0000", () => {
    assert.equal(normalizeLast4("0000"), "0000");
  });

  it("parses the brand out of 'American Express *0' without inventing a last4", () => {
    assert.deepEqual(parsePaymentDisplay("American Express *0"), {
      issuer: "American Express",
      last4: "",
    });
  });

  it("still parses a real last4", () => {
    assert.deepEqual(parsePaymentDisplay("Bank of America *7110"), {
      issuer: "Bank of America",
      last4: "7110",
    });
  });

  it("does not re-append a *0 to dropdown labels", () => {
    const label = getPaymentMethodListLabel("American Express *0", "American Express");
    assert.equal(label, "American Express");
    assert.ok(!label.includes("*0"));
  });

  it("returns no last4 for API records saved without a card number", () => {
    // card_number "-" and "0" are the API's "no card number" sentinels.
    assert.equal(getLast4FromPaymentApiRecord({ card_number: "-" }), "");
    assert.equal(getLast4FromPaymentApiRecord({ card_number: "0" }), "");
    assert.equal(getLast4FromPaymentApiRecord({ card_number: "4111111111117110" }), "7110");
  });
});
