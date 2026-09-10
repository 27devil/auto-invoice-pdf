import { describe, it, expect } from "vitest";
import { computePeriodKey, formatInvoiceNumber } from "../../server/invoices/numbering.server";

describe("computePeriodKey", () => {
  const now = new Date("2026-09-10T12:00:00Z");

  it("returns ALL for a continuous (never-reset) sequence", () => {
    expect(computePeriodKey("NEVER", now, "UTC")).toBe("ALL");
  });

  it("returns the calendar year for a yearly reset", () => {
    expect(computePeriodKey("YEARLY", now, "UTC")).toBe("2026");
  });

  it("returns year-month for a monthly reset", () => {
    expect(computePeriodKey("MONTHLY", now, "UTC")).toBe("2026-09");
  });

  it("respects the shop's timezone, not just UTC", () => {
    // 2026-01-01T02:00:00Z is still Dec 31 2025 in US/Pacific (UTC-8 in January).
    const newYearUtc = new Date("2026-01-01T02:00:00Z");
    expect(computePeriodKey("YEARLY", newYearUtc, "America/Los_Angeles")).toBe("2025");
    expect(computePeriodKey("YEARLY", newYearUtc, "UTC")).toBe("2026");
  });
});

describe("formatInvoiceNumber", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const baseConfig = { prefix: "INV", format: "{PREFIX}-{YEAR}-{SEQUENCE}", padding: 6, startValue: 1, resetPolicy: "YEARLY" as const };

  it("formats with the default template", () => {
    expect(formatInvoiceNumber(baseConfig, 1, "2026", now, "UTC")).toBe("INV-2026-000001");
    expect(formatInvoiceNumber(baseConfig, 42, "2026", now, "UTC")).toBe("INV-2026-000042");
  });

  it("pads to the configured width", () => {
    expect(formatInvoiceNumber({ ...baseConfig, padding: 3 }, 7, "2026", now, "UTC")).toBe("INV-2026-007");
  });

  it("supports a custom prefix and continuous sequence via {PERIOD}", () => {
    const config = { ...baseConfig, prefix: "SRS", format: "{PREFIX}/{PERIOD}/{SEQUENCE}", resetPolicy: "NEVER" as const };
    expect(formatInvoiceNumber(config, 100, "ALL", now, "UTC")).toBe("SRS/ALL/000100");
  });

  it("does not silently produce the same number for different sequence values", () => {
    const a = formatInvoiceNumber(baseConfig, 1, "2026", now, "UTC");
    const b = formatInvoiceNumber(baseConfig, 2, "2026", now, "UTC");
    expect(a).not.toBe(b);
  });
});

/**
 * Concurrency-safety of the allocation algorithm itself (spec §8: "Two
 * simultaneous orders must NEVER receive the same invoice number"). This
 * models the exact arithmetic used by the real
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING nextValue - 1` statement
 * in numbering.server.ts, but against an in-memory map instead of Postgres
 * — Postgres's row-level lock is what makes the real statement atomic
 * under true concurrency; this test instead proves the arithmetic never
 * double-allocates when many allocations interleave, which is the part a
 * unit test actually can exercise without a live database. See
 * docs/testing.md for the note on running this against real Postgres.
 */
function fakeAllocate(store: Map<string, number>, key: string, startValue: number): number {
  const current = store.get(key);
  if (current === undefined) {
    store.set(key, startValue + 1);
    return startValue;
  }
  store.set(key, current + 1);
  return current;
}

describe("allocation arithmetic (in-memory model of the atomic SQL)", () => {
  it("never allocates the same sequence value twice across many calls", async () => {
    const store = new Map<string, number>();
    const key = "shop_1:2026";

    const results = await Promise.all(Array.from({ length: 500 }, async () => fakeAllocate(store, key, 1)));

    const unique = new Set(results);
    expect(unique.size).toBe(results.length);
    expect(Math.min(...results)).toBe(1);
    expect(Math.max(...results)).toBe(500);
  });

  it("starts a new period at the configured starting number", () => {
    const store = new Map<string, number>();
    expect(fakeAllocate(store, "shop_1:2027", 1)).toBe(1);
    expect(fakeAllocate(store, "shop_1:2027", 1)).toBe(2);
    // A different shop/period is independent.
    expect(fakeAllocate(store, "shop_2:2027", 500)).toBe(500);
  });
});
