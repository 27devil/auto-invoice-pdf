import { logger } from "../lib/logger.server";

/**
 * Minimal shape of the `admin` GraphQL client handed back by
 * `authenticate.admin()` / `unauthenticated.admin()` — kept narrow so this
 * module doesn't need to import the full Shopify app-react-router types.
 */
export interface AdminGraphqlClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export class ShopifyApiError extends Error {
  code = "SHOPIFY_API_ERROR" as const;
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a GraphQL query/mutation against the Admin API with:
 *  - retry + exponential backoff on 429 / 5xx / transient network errors (spec §59, §94)
 *  - explicit handling of both top-level `errors` and (for mutations) `userErrors` (spec §93)
 *
 * Never assumes `response.data` exists — callers get a typed, validated result
 * or a thrown ShopifyApiError.
 */
export async function runGraphql<T>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    try {
      const response = await admin.graphql(query, { variables });

      if (response.status === 429 || response.status >= 500) {
        const retryAfterHeader = response.headers?.get?.("Retry-After");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
        const delay = retryAfterMs ?? BASE_DELAY_MS * 2 ** (attempt - 1);
        logger.warn("shopify.graphql.retry", {
          status: response.status,
          attempt,
          delayMs: delay,
        });
        await sleep(delay);
        continue;
      }

      const body = (await response.json()) as GraphqlEnvelope<T>;

      if (body.errors && body.errors.length > 0) {
        throw new ShopifyApiError(
          `Shopify GraphQL returned top-level errors: ${body.errors.map((e) => e.message).join("; ")}`,
          body.errors,
        );
      }

      if (!body.data) {
        throw new ShopifyApiError("Shopify GraphQL response contained no data", body);
      }

      return body.data;
    } catch (error) {
      lastError = error;
      if (error instanceof ShopifyApiError) {
        // Don't retry on well-formed GraphQL errors — retrying won't fix a bad query.
        throw error;
      }
      // Network-level failure: retry with backoff.
      logger.warn("shopify.graphql.network_error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw new ShopifyApiError("Shopify GraphQL request failed after max retries", lastError);
}

/** Asserts a mutation's `userErrors` array is empty, throwing a typed error otherwise. */
export function assertNoUserErrors(
  userErrors: Array<{ field?: string[] | null; message: string }> | null | undefined,
  mutationName: string,
): void {
  if (userErrors && userErrors.length > 0) {
    throw new ShopifyApiError(
      `${mutationName} returned userErrors: ${userErrors
        .map((e) => `${e.field?.join(".") ?? "?"}: ${e.message}`)
        .join("; ")}`,
      userErrors,
    );
  }
}
