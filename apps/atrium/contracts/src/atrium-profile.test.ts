import { describe, expect, test } from "bun:test";
import { parseAtriumRegistrationMetadata } from "./atrium-profile.ts";

describe("parseAtriumRegistrationMetadata", () => {
  test("empty metadata", () => {
    expect(parseAtriumRegistrationMetadata(undefined)).toEqual({});
    expect(parseAtriumRegistrationMetadata({})).toEqual({});
  });

  test("display fields", () => {
    expect(
      parseAtriumRegistrationMetadata({ displayName: " Ada ", bio: " hi " }),
    ).toEqual({ displayName: "Ada", bio: "hi" });
  });

  test("strips legacy client ids", () => {
    expect(
      parseAtriumRegistrationMetadata({ profileId: "u1", id: "x", displayName: "N" }),
    ).toEqual({ displayName: "N" });
  });

  test("rejects invalid bounds", () => {
    expect(() =>
      parseAtriumRegistrationMetadata({ displayName: "x".repeat(201) }),
    ).toThrow(/invalid registration metadata/i);
  });
});
