import { expect, test } from "bun:test";
import { parsePriceFromType } from "@cfd/obp-tools";
import {
  formatDealTerminalType,
  formatNegotiationType,
  parseDealPackage,
  parsePublicText,
  parseTermMonthsFromType,
} from "./encoding.ts";

test("v2 negotiation and deal round-trip price and term", () => {
  const n = formatNegotiationType(48, 18, "hello");
  expect(parsePriceFromType(n)).toBe(48);
  expect(parseTermMonthsFromType(n)).toBe(18);
  expect(parsePublicText(n)).toBe("hello");

  const d = formatDealTerminalType(45, 12);
  expect(parseDealPackage(d)).toEqual({ price: 45, termMonths: 12 });
  expect(parseDealPackage("demo.deal.v1|p=45")).toBeNull();
});
