import type { PriceBand } from "./obp-toolkit-env.ts";

export function priceInZone(price: number, band: PriceBand): boolean {
  return price >= band.min && price <= band.max;
}
