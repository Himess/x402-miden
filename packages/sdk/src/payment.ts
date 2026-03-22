/**
 * @x402-miden/sdk -- payment handler and fetch wrapper
 *
 * Provides `midenFetch`, an auto-handling fetch wrapper that intercepts
 * 402 Payment Required responses and automatically creates + submits
 * lightweight payments using the MidenAgentWallet.
 */

import type {
  LightweightPaymentRequirement,
  LightweightPaymentHeader,
  MidenFetchOptions,
} from "@x402-miden/types";
import { X402_PAYMENT_HEADER } from "@x402-miden/types";
import { MidenAgentWallet } from "./wallet.js";
import { parse402ResponseBody } from "./utils.js";

/**
 * Payment handler that processes 402 responses and retries with payment proof.
 *
 * When a server returns HTTP 402 with a `LightweightPaymentRequirement` body,
 * this handler:
 * 1. Parses the payment requirement
 * 2. Creates a P2ID note via the wallet
 * 3. Submits the note and obtains an inclusion proof
 * 4. Retries the original request with the payment header attached
 */
export class X402PaymentHandler {
  private wallet: MidenAgentWallet;

  constructor(wallet: MidenAgentWallet) {
    this.wallet = wallet;
  }

  /**
   * Handle a 402 Payment Required response.
   *
   * @param response - The 402 response from the server.
   * @param originalRequest - The original request that was rejected.
   * @returns The response from retrying the request with payment proof.
   * @throws If payment creation fails or the retry also returns 402.
   */
  async handlePaymentRequired(
    response: Response,
    originalRequest: Request,
  ): Promise<Response> {
    if (response.status !== 402) {
      return response;
    }

    // Parse the 402 body to get the payment requirement
    const body = await response.json();
    const requirement = parse402ResponseBody(body) as LightweightPaymentRequirement;

    // Create and submit the payment
    const paymentHeader = await this.wallet.createAndSubmitPayment(requirement);

    // Retry the original request with the payment proof
    return this.retryWithPayment(originalRequest, paymentHeader);
  }

  /**
   * Retry a request with the payment header attached.
   */
  private async retryWithPayment(
    originalRequest: Request,
    paymentHeader: LightweightPaymentHeader,
  ): Promise<Response> {
    const headers = new Headers(originalRequest.headers);
    headers.set(X402_PAYMENT_HEADER, JSON.stringify(paymentHeader));

    const retryRequest = new Request(originalRequest.url, {
      method: originalRequest.method,
      headers,
      body: originalRequest.body,
      redirect: originalRequest.redirect,
      signal: originalRequest.signal,
    });

    return fetch(retryRequest);
  }
}

/**
 * Create a fetch wrapper that automatically handles 402 Payment Required
 * responses by creating lightweight payments via the Miden network.
 *
 * ## Usage
 *
 * ```typescript
 * import { MidenAgentWallet, midenFetch } from '@x402-miden/sdk';
 *
 * const wallet = await MidenAgentWallet.create();
 * const fetch402 = midenFetch(wallet);
 *
 * // This will automatically pay if the server returns 402
 * const response = await fetch402('https://api.example.com/premium');
 * ```
 *
 * ## How it works
 *
 * 1. The wrapper makes the original fetch request.
 * 2. If the server responds with 402, the wrapper parses the payment
 *    requirement from the response body.
 * 3. The wallet creates a P2ID note, proves it, and submits it to the
 *    Miden network.
 * 4. After syncing state and obtaining an inclusion proof, the wrapper
 *    retries the original request with the payment header attached.
 * 5. The retried response is returned to the caller.
 *
 * @param wallet - The MidenAgentWallet to use for payments.
 * @param options - Optional configuration for retries and callbacks.
 * @returns A fetch-compatible function.
 */
export function midenFetch(
  wallet: MidenAgentWallet,
  options?: MidenFetchOptions,
): typeof fetch {
  const handler = new X402PaymentHandler(wallet);
  const maxRetries = options?.maxRetries ?? 1;

  const wrappedFetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);

    let response = await fetch(request.clone());

    for (let attempt = 0; attempt < maxRetries && response.status === 402; attempt++) {
      // Parse the requirement for the callback
      const clonedResponse = response.clone();
      let requirement: LightweightPaymentRequirement | undefined;

      try {
        const body = await clonedResponse.json();
        requirement = parse402ResponseBody(body) as LightweightPaymentRequirement;
      } catch {
        // If we can't parse the body, break out -- it's not an x402 response
        break;
      }

      // Notify the caller that payment is required
      if (options?.onPaymentRequired && requirement) {
        options.onPaymentRequired(requirement);
      }

      try {
        response = await handler.handlePaymentRequired(response, request.clone());

        // Notify the caller of payment success if we got past 402
        if (response.status !== 402 && options?.onPaymentSuccess) {
          // Extract the header we sent for the callback
          const headerStr = response.headers.get(X402_PAYMENT_HEADER);
          if (headerStr) {
            try {
              options.onPaymentSuccess(JSON.parse(headerStr));
            } catch {
              // Header might not be echoed back; that's fine
            }
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (options?.onPaymentError) {
          options.onPaymentError(error);
        }
        throw error;
      }
    }

    return response;
  };

  return wrappedFetch;
}
