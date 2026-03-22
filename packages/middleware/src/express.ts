/**
 * @x402-miden/middleware -- Express middleware
 *
 * Drop-in Express middleware that gates routes behind a Miden payment wall.
 * Returns 402 with a `LightweightPaymentRequirement` body, then verifies
 * incoming payment headers via the facilitator.
 */

import type { Request, Response, NextFunction } from "express";
import type { LightweightPaymentHeader, MidenPaywallConfig } from "@x402-miden/types";
import { X402_PAYMENT_HEADER, X402_CONTEXT_ID_HEADER } from "@x402-miden/types";
import { PaymentVerifier } from "./verify.js";

/**
 * Create an Express middleware that requires x402 lightweight payment.
 *
 * ## Usage
 *
 * ```typescript
 * import express from 'express';
 * import { midenPaywall } from '@x402-miden/middleware';
 *
 * const app = express();
 *
 * app.get('/premium', midenPaywall({
 *   payTo: '0xYOUR_ACCOUNT_ID',
 *   asset: '0xFAUCET_ID',
 *   amount: 1_000_000,
 * }), (req, res) => {
 *   res.json({ data: 'premium content' });
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
 * @returns Express middleware function.
 */
export function midenPaywall(
  config: MidenPaywallConfig,
): (req: Request, res: Response, next: NextFunction) => void {
  const verifier = new PaymentVerifier(config.facilitatorUrl);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paymentHeaderStr = req.headers[X402_PAYMENT_HEADER.toLowerCase()] as
      | string
      | undefined;
    const contextId = req.headers[X402_CONTEXT_ID_HEADER.toLowerCase()] as
      | string
      | undefined;

    // Case 1: No payment header -- issue a 402 with payment requirement
    if (!paymentHeaderStr) {
      try {
        const { contextId: newContextId, requirement } =
          await verifier.createRequirement(config);

        res.status(402).json({
          ...requirement,
          contextId: newContextId,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create payment requirement";
        res.status(500).json({ error: message });
      }
      return;
    }

    // Case 2: Payment header present -- verify the proof
    if (!contextId) {
      res.status(400).json({
        error: `Missing ${X402_CONTEXT_ID_HEADER} header`,
      });
      return;
    }

    let paymentHeader: LightweightPaymentHeader;
    try {
      paymentHeader = JSON.parse(paymentHeaderStr);
    } catch {
      res.status(400).json({ error: "Invalid X-Payment header: not valid JSON" });
      return;
    }

    // Validate required fields
    if (
      !paymentHeader.noteId ||
      paymentHeader.blockNum === undefined ||
      paymentHeader.noteIndex === undefined ||
      !paymentHeader.noteMetadata ||
      !paymentHeader.inclusionProof
    ) {
      res.status(400).json({
        error:
          "Invalid X-Payment header: missing required fields " +
          "(noteId, blockNum, noteIndex, noteMetadata, inclusionProof)",
      });
      return;
    }

    try {
      const result = await verifier.verifyPayment(contextId, paymentHeader);

      if (!result.valid) {
        res.status(402).json({
          error: result.error ?? "Payment verification failed",
          noteId: result.noteId,
          blockNum: result.blockNum,
        });
        return;
      }

      // Payment verified -- proceed to the route handler
      next();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Payment verification error";
      res.status(500).json({ error: message });
    }
  };
}
