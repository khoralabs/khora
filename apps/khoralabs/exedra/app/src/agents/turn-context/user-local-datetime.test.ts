import { expect, test } from "bun:test";

import {
  buildUserLocalDateTimeContext,
  formatUserLocalDateTimeTurnInstruction,
  isValidIanaTimeZone,
  resolveUserTimeZone,
} from "./user-local-datetime.js";

test("resolveUserTimeZone accepts valid IANA zones and falls back to UTC", () => {
  expect(resolveUserTimeZone("America/New_York")).toBe("America/New_York");
  expect(resolveUserTimeZone("  America/Los_Angeles  ")).toBe("America/Los_Angeles");
  expect(resolveUserTimeZone("Not/AZone")).toBe("UTC");
  expect(resolveUserTimeZone(undefined)).toBe("UTC");
});

test("buildUserLocalDateTimeContext formats in the requested timezone", () => {
  const context = buildUserLocalDateTimeContext(
    "America/New_York",
    new Date("2026-06-17T18:30:00.000Z"),
  );

  expect(context.timeZone).toBe("America/New_York");
  expect(context.utcInstant).toBe("2026-06-17T18:30:00.000Z");
  expect(context.formatted).toContain("June");
  expect(context.formatted).toContain("2026");
});

test("formatUserLocalDateTimeTurnInstruction includes formatted local time", () => {
  const context = buildUserLocalDateTimeContext("UTC", new Date("2026-06-17T12:00:00.000Z"));
  const instruction = formatUserLocalDateTimeTurnInstruction(context);

  expect(instruction).toContain(context.formatted);
  expect(instruction).toContain("UTC");
  expect(isValidIanaTimeZone("UTC")).toBe(true);
});
