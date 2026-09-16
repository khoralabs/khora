import { expect, test } from "bun:test";
import { selectFanOutDeliveryMode } from "./policy";

test("network always pushes and hybrid pull is selected only after the public limit", () => {
  const hybrid = { mode: "hybrid" as const, publicPushTargetLimit: 10 };
  expect(selectFanOutDeliveryMode({ visibility: "network", fanOutPolicy: hybrid }, 50)).toBe(
    "push",
  );
  expect(
    selectFanOutDeliveryMode({ visibility: "public", fanOutPolicy: { mode: "catalog-pull" } }, 1),
  ).toBe("pull");
  expect(selectFanOutDeliveryMode({ visibility: "public", fanOutPolicy: hybrid }, 10)).toBe("push");
  expect(selectFanOutDeliveryMode({ visibility: "public", fanOutPolicy: hybrid }, 11)).toBe("pull");
});
