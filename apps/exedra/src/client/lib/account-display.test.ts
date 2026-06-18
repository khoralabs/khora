import { expect, test } from "bun:test";

import type { AccountProfile } from "@shared/accounts/row";

import { accountDescriptionSubtitle, formatAccountDisplayName } from "@/lib/account-display";

const profile = (overrides: Partial<AccountProfile>): AccountProfile => ({
  userId: "user-1",
  registryUserId: "alex@example.com",
  fullName: null,
  avatarUrl: null,
  jobFunction: null,
  ...overrides,
});

test("formatAccountDisplayName prefers full name", () => {
  expect(formatAccountDisplayName(profile({ fullName: "Alex Morgan" }))).toBe("Alex Morgan");
});

test("formatAccountDisplayName falls back to email local part", () => {
  expect(formatAccountDisplayName(profile({ registryUserId: "alex@example.com" }))).toBe("alex");
});

test("accountDescriptionSubtitle prefers job function", () => {
  expect(
    accountDescriptionSubtitle(
      profile({ jobFunction: "Product manager", registryUserId: "a@b.c" }),
    ),
  ).toBe("Product manager");
});

test("accountDescriptionSubtitle falls back to email", () => {
  expect(accountDescriptionSubtitle(profile({ registryUserId: "alex@example.com" }))).toBe(
    "alex@example.com",
  );
});
