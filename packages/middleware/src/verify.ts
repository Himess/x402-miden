/**
 * @x402-miden/middleware -- payment verification
 *
 * Communicates with a facilitator service to create payment requirements
 * and verify lightweight payment proofs. The facilitator runs the Rust
 * `x402-chain-miden` crate and handles the cryptographic verification
 * (noteId recomputation, SparseMerklePath validation).
 */

import type {
  LightweightPaymentHeader,
  LightweightPaymentRequirement,
  LightweightVerifyResponse,
  MidenPaywallConfig,
  PaymentRequirementResponse,
  VerifyLightweightRequest,
  PaymentRequirementRequest,
} from "@x402-miden/types";
import { DEFAULT_FACILITATOR_URL } from "@x402-miden/types";

/**
 * Client for the x402-miden facilitator service.
 *
 * The facilitator is responsible for:
 * - Generating payment requirements (recipientDigest, serialNum)
 * - Verifying lightweight payment proofs (noteId, SparseMerklePath)
 *
 * This keeps the server-side middleware thin: it only needs to call the
 * facilitator over HTTP, not run any Miden-specific crypto.
 */
export class PaymentVerifier {
  private readonly facilitatorUrl: string;

  /**
   * @param facilitatorUrl - Base URL of the facilitator service.
   *   Defaults to `http://localhost:4020`.
   */
  constructor(facilitatorUrl?: string) {
    this.facilitatorUrl = (facilitatorUrl ?? DEFAULT_FACILITATOR_URL).replace(
      /\/$/,
      "",
    );
  }

  /**
   * Request a new payment requirement from the facilitator.
   *
   * The facilitator generates the `recipientDigest` and `serialNum` for the
   * server's account, and returns a `contextId` that correlates this
   * requirement with a future verification request.
   *
   * @param config - The paywall configuration.
   * @returns The context ID and the payment requirement to send in the 402 response.
   */
  async createRequirement(
    config: MidenPaywallConfig,
  ): Promise<{ contextId: string; requirement: LightweightPaymentRequirement }> {
    const requestBody: PaymentRequirementRequest = {
      recipient: config.payTo,
      asset: config.asset,
      amount: config.amount,
      noteTag: config.noteTag ?? 0,
    };

    const response = await fetch(
      `${this.facilitatorUrl}/payment-requirement`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Facilitator /payment-requirement failed (${response.status}): ${text}`,
      );
    }

    const data: PaymentRequirementResponse = await response.json();
    return {
      contextId: data.contextId,
      requirement: data.requirement,
    };
  }

  /**
   * Verify a lightweight payment proof via the facilitator.
   *
   * The facilitator:
   * 1. Looks up the `PaymentContext` by `contextId`
   * 2. Recomputes the expected `noteId` from the stored parameters
   * 3. Validates `noteId == header.noteId`
   * 4. Verifies the `SparseMerklePath` inclusion proof
   *
   * @param contextId - The context ID from `createRequirement`.
   * @param header - The payment header from the agent.
   * @returns The verification result.
   */
  async verifyPayment(
    contextId: string,
    header: LightweightPaymentHeader,
  ): Promise<LightweightVerifyResponse> {
    const requestBody: VerifyLightweightRequest = {
      paymentContextId: contextId,
      paymentHeader: header,
    };

    const response = await fetch(
      `${this.facilitatorUrl}/verify-lightweight`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Facilitator /verify-lightweight failed (${response.status}): ${text}`,
      );
    }

    return response.json();
  }
}
