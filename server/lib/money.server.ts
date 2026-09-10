import Decimal from "decimal.js";
import type { Money } from "../shopify/types";

/** All money math goes through Decimal — never native floats (spec §87, §88). */

export function toDecimal(money: Money | string | number): Decimal {
  if (typeof money === "object") return new Decimal(money.amount);
  return new Decimal(money);
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Decimal(0));
}

/** Formats a Decimal as a fixed 2-decimal string for display/PDF/email use. */
export function formatMoney(value: Decimal, currency: string): string {
  const amount = value.toFixed(2);
  return `${currency} ${amount}`;
}

export function toPrismaDecimalInput(value: Decimal): string {
  // Prisma's Decimal fields accept string input; avoids float round-trips.
  return value.toFixed(4);
}

/**
 * Reconciliation guard (spec §88): if our locally-summed line items disagree
 * with Shopify's authoritative order total by more than a cent of rounding
 * slack, we trust Shopify's number and log the discrepancy rather than
 * silently diverging.
 */
export function reconcile(locallyComputed: Decimal, authoritative: Decimal, toleranceCents = 1): {
  value: Decimal;
  reconciled: boolean;
  diff: Decimal;
} {
  const diff = locallyComputed.minus(authoritative).abs();
  const tolerance = new Decimal(toleranceCents).dividedBy(100);
  const reconciled = diff.lessThanOrEqualTo(tolerance);
  return { value: authoritative, reconciled, diff };
}
