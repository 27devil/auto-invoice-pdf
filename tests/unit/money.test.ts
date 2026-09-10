import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { toDecimal, sum, formatMoney, reconcile } from "../../server/lib/money.server";

describe("money helpers use Decimal, never native float math", () => {
  it("adds 0.1 + 0.2 exactly (the canonical float-math failure case)", () => {
    const result = toDecimal("0.1").plus(toDecimal("0.2"));
    expect(result.toFixed(2)).toBe("0.30");
    expect(result.equals(new Decimal("0.3"))).toBe(true);
    // Sanity check that this is actually testing something: native floats fail this.
    expect(0.1 + 0.2 === 0.3).toBe(false);
  });

  it("parses Shopify MoneyBag-shaped values", () => {
    const value = toDecimal({ amount: "19.99", currencyCode: "USD" });
    expect(value.toFixed(2)).toBe("19.99");
  });

  it("sums a list of decimals precisely", () => {
    const total = sum([new Decimal("10.10"), new Decimal("0.05"), new Decimal("0.05")]);
    expect(total.toFixed(2)).toBe("10.20");
  });

  it("formats with currency code and two decimals", () => {
    expect(formatMoney(new Decimal("5"), "USD")).toBe("USD 5.00");
    expect(formatMoney(new Decimal("5.005"), "USD")).toBe("USD 5.01"); // rounds, doesn't truncate
  });
});

describe("reconcile — prefer Shopify's authoritative total (spec §88)", () => {
  it("accepts a locally-computed total that matches within a cent", () => {
    const { value, reconciled, diff } = reconcile(new Decimal("100.00"), new Decimal("100.00"));
    expect(reconciled).toBe(true);
    expect(value.toFixed(2)).toBe("100.00");
    expect(diff.toFixed(2)).toBe("0.00");
  });

  it("flags a mismatch but still returns Shopify's number as authoritative", () => {
    const { value, reconciled, diff } = reconcile(new Decimal("100.50"), new Decimal("99.00"));
    expect(reconciled).toBe(false);
    expect(value.toFixed(2)).toBe("99.00"); // Shopify's total wins, not our computed one
    expect(diff.toFixed(2)).toBe("1.50");
  });

  it("tolerates sub-cent rounding noise from line-item math", () => {
    const { reconciled } = reconcile(new Decimal("49.995"), new Decimal("50.00"));
    expect(reconciled).toBe(true);
  });
});
