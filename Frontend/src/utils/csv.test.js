import assert from "node:assert/strict";
import test from "node:test";

import { csvCell, objectsToCsv } from "./csv.js";

/** Minimal RFC-style row split, enough to prove commas stay inside a field. */
function parseCsvRow(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

test("csvCell quotes values that contain commas", () => {
  assert.equal(csvCell("September 10, 2026"), '"September 10, 2026"');
  assert.equal(csvCell('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvCell("1800PetMeds"), "1800PetMeds");
});

test("receipt csv keeps each value under its label when the date contains a comma", () => {
  const csv = objectsToCsv([
    {
      "Receipt ID": "191257",
      Date: "September 10, 2026",
      Merchant: "1800PetMeds",
      "Expense Type": "Personal",
      "Expense Category": "Auto Expenses",
      "Payment Method": "American Express",
      Subtotal: "42713.68",
      "Total Tax": "4271.56",
      Total: "46987.25",
      Description: "Testing Descriptions",
      Notes: "Testing Descriptions",
    },
  ]);

  const [, row] = csv.split("\r\n");
  const cells = parseCsvRow(row);
  assert.deepEqual(cells, [
    "191257",
    "September 10, 2026",
    "1800PetMeds",
    "Personal",
    "Auto Expenses",
    "American Express",
    "42713.68",
    "4271.56",
    "46987.25",
    "Testing Descriptions",
    "Testing Descriptions",
  ]);
});
