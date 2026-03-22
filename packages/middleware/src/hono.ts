/**
 * @x402-miden/middleware -- Hono middleware
 *
 * Drop-in Hono middleware that gates routes behind a Miden payment wall.
 * Returns 402 with a `LightweightPaymentRequirement` body, then verifies
 * incoming payment headers via the facilitator.
 */

import type { MiddlewareHandler } from "hono";
import type { LightweightPaymentHeader, MidenPaywallConfig } from "@x402-miden/types";
import { X402_PAYMENT_HEADER, X402_CONTEXT_ID_HEADER } from "@x402-miden/types";
import { PaymentVerifier } from "./verify.js";

/**
 * Create a Hono middleware that requires x402 lightweight payment.
 *
 * ## Usage
 *
 * ```typescript
 * import { Hono } from 'hono';
 * import { midenPaywall } from '@x402-miden/middleware/hono';
 *
 * const app = new Hono();
 *
 * app.get('/premium', midenPaywall({
 *   payTo: '0xYOUR_ACCOUNT_ID',
 *   asset: '0xFAUCET_ID',
 *   amount: 1_000_000,
 * }), (c) => {
 *   return c.json({ data: 'premium content' });
 * });
 * ```
 *
 * ## Flow
 *
 * 1. If the request has no `X-Payment` header, the middleware calls the
 *    facilitator to create a payment requirement and returns 402.
 *
 * 2. If the request has an `X-Payment` header (JSON-encoded
 *    `LightweightPaymentHeader`), the middleware calls the facilitator
 *    to verify the payment proof. On success, it calls `next()`.
 *
 * @param config - Paywall configuration.
 * @returns Hono middleware handler.
 */
export function midenPaywall(config: MidenPaywallConfig): MiddlewareHandler {
  const verifier = new PaymentVerifier(config.facilitatorUrl);

  return async (c, next) => {
    const paymentHeaderStr = c.req.header(X402_PAYMENT_HEADER);
    const contextId = c.req.header(X402_CONTEXT_ID_HEADER);

    // Case 1: No payment header -- issue a 402 with payment requirement
    if (!paymentHeaderStr) {
      try {
        const { contextId: newContextId, requirement } =
          await verifier.createRequirement(config);

        return c.json(
          {
            ...requirement,
            contextId: newContextId,
          },
          402,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create payment requirement";
        return c.json({ error: message }, 500);
      }
    }

    // Case 2: Payment header present -- verify the proof
    if (!contextId) {
      return c.json(
        { error: `Missing ${X402_CONTEXT_ID_HEADER} header` },
        400,
      );
    }

    let paymentHeader: LightweightPaymentHeader;
    try {
      paymentHeader = JSON.parse(paymentHeaderStr);
    } catch {
      return c.json(
        { error: "Invalid X-Payment header: not valid JSON" },
        400,
      );
    }

    // Validate required fields
    if (
      !paymentHeader.noteId ||
      paymentHeader.blockNum === undefined ||
      paymentHeader.noteIndex === undefined ||
      !paymentHeader.noteMetadata ||
      !paymentHeader.inclusionProof
    ) {
      return c.json(
        {
          error:
            "Invalid X-Payment header: missing required fields " +
            "(noteId, blockNum, noteIndex, noteMetadata, inclusionProof)",
        },
        400,
      );
    }

    try {
      const result = await verifier.verifyPayment(contextId, paymentHeader);

      if (!result.valid) {
        return c.json(
          {
            error: result.error ?? "Payment verification failed",
            noteId: result.noteId,
            blockNum: result.blockNum,
          },
          402,
        );
      }

      // Payment verified -- proceed to the route handler
      await next();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Payment verification error";
      return c.json({ error: message }, 500);
    }
  };
}
