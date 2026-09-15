import { expect, test } from "bun:test";
import { createFanOutMaintenanceTick } from "./maintenance-tick";

test("maintenance tick runs reconcile and GC only after their intervals", async () => {
  let now = 0;
  const reconcile: number[] = [];
  const gc: number[] = [];
  const tick = createFanOutMaintenanceTick({
    reconcileEveryMs: 60_000,
    gcEveryMs: 3_600_000,
    now: () => now,
    reconcile: async () => {
      reconcile.push(now);
    },
    gc: async () => {
      gc.push(now);
    },
  });
  await tick();
  now = 1_000;
  await tick();
  now = 60_000;
  await tick();
  now = 3_600_000;
  await tick();
  expect(reconcile).toEqual([0, 60_000, 3_600_000]);
  expect(gc).toEqual([0, 3_600_000]);
});
