import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLstToMint,
  calculateSolToReturn,
  getCurrentExchangeRate,
  PROTOCOL_START_TIMESTAMP,
} from "./conversion.js";

const ONE_SOL = 1_000_000_000n;
const ONE_YEAR_SECONDS = 31_536_000;

test("minting at protocol start is 1 SOL to 1 LST", () => {
  const issued = calculateLstToMint(ONE_SOL, PROTOCOL_START_TIMESTAMP);
  assert.equal(issued, ONE_SOL);
});

test("minting after one year applies 6 percent APR", () => {
  const issued = calculateLstToMint(ONE_SOL, PROTOCOL_START_TIMESTAMP + ONE_YEAR_SECONDS);
  assert.equal(issued, 943_396_226n);
});

test("redeeming after one year returns 1.06 SOL for 1 LST", () => {
  const returned = calculateSolToReturn(ONE_SOL, PROTOCOL_START_TIMESTAMP + ONE_YEAR_SECONDS);
  assert.equal(returned, 1_060_000_000n);
});

test("exchange rate grows linearly with simple APR", () => {
  const rate = getCurrentExchangeRate(PROTOCOL_START_TIMESTAMP + ONE_YEAR_SECONDS);
  assert.equal(rate, 1.06);
});

test("partial amounts round down conservatively", () => {
  const halfSolMint = calculateLstToMint(500_000_000n, PROTOCOL_START_TIMESTAMP + ONE_YEAR_SECONDS);
  assert.equal(halfSolMint, 471_698_113n);

  const smallRedeem = calculateSolToReturn(123_456_789n, PROTOCOL_START_TIMESTAMP + ONE_YEAR_SECONDS);
  assert.equal(smallRedeem, 130_864_196n);
});
