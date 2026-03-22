/**
 * @x402-miden/sdk
 *
 * Agent-side SDK for x402 lightweight payments on the Miden network.
 *
 * @example
 * ```typescript
 * import { MidenAgentWallet, midenFetch } from '@x402-miden/sdk';
 *
 * const wallet = await MidenAgentWallet.create();
 * const fetch402 = midenFetch(wallet);
 *
 * const response = await fetch402('https://api.example.com/premium');
 * ```
 */

export { MidenAgentWallet, setWebClientFactory } from "./wallet.js";
export { X402PaymentHandler, midenFetch } from "./payment.js";
export { toHex, fromHex, isHex, isHex32, parse402ResponseBody } from "./utils.js";

// Re-export types that consumers commonly need
export type {
  LightweightPaymentRequirement,
  LightweightPaymentHeader,
  WalletConfig,
  MidenFetchOptions,
} from "@x402-miden/types";
