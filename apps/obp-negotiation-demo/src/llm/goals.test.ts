import { expect, test } from "bun:test";
import { DEFAULT_NEGOTIATION_GOALS, goalsToPriceBand, priceInZone, termInZone } from "./goals.ts";

test("priceInZone", () => {
  const band = { min: 40, max: 50 };
  expect(priceInZone(45, band)).toBe(true);
  expect(priceInZone(39, band)).toBe(false);
  expect(priceInZone(51, band)).toBe(false);
});

test("termInZone", () => {
  const g = {
    buyerMax: 50,
    sellerMin: 40,
    sellerMinTermMonths: 12,
    buyerMaxTermMonths: 24,
  };
  expect(termInZone(18, g)).toBe(true);
  expect(termInZone(10, g)).toBe(false);
  expect(termInZone(30, g)).toBe(false);
});

test("DEFAULT_NEGOTIATION_GOALS has a non-empty joint price and term zone", () => {
  const g = DEFAULT_NEGOTIATION_GOALS;
  expect(g.sellerMin).toBeLessThanOrEqual(g.buyerMax);
  expect(g.sellerMinTermMonths).toBeLessThanOrEqual(g.buyerMaxTermMonths);
  const band = goalsToPriceBand(g);
  expect(priceInZone(g.sellerMin, band)).toBe(true);
  expect(priceInZone(g.buyerMax, band)).toBe(true);
  expect(termInZone(g.sellerMinTermMonths, g)).toBe(true);
  expect(termInZone(g.buyerMaxTermMonths, g)).toBe(true);
});
