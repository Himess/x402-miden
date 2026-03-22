/**
 * @x402-miden/middleware
 *
 * Server-side middleware for x402 lightweight payment verification on Miden.
 *
 * Provides drop-in middleware for Express and Hono that gates routes behind
 * a payment wall. The middleware communicates with a facilitator service
 * (running the Rust `x402-chain-miden` crate) to create payment requirements
 * and verify lightweight payment proofs.
 *
 * @example Express
 * ```typescript
 * import express from 'express';
 * import { midenPaywall } from '@x402-miden/middleware';
 *
 * const app = express();
 * app.get('/premium', midenPaywall({
 *   payTo: '0xYOUR_ACCOUNT_ID',
 *   asset: '0xFAUCET_ID',
 *   amount: 1_000_000,
 * }), (req, res) => {
 *   res.json({ data: 'premium content' });
 * });
 * ```
 *
 * @example Hono
 * ```typescript
 * import { Hono } from 'hono';
 * import { midenPaywall } from '@x402-miden/middleware/hono';
 *
 * const app = new Hono();
 * app.get('/premium', midenPaywall({
 *   payTo: '0xYOUR_ACCOUNT_ID',
 *   asset: '0xFAUCET_ID',
 *   amount: 1_000_000,
 * }), (c) => c.json({ data: 'premium content' }));
 * ```
 */

// Default export is Express middleware
export { midenPaywall } from "./express.js";
export { PaymentVerifier } from "./verify.js";

// Re-export types
export type { MidenPaywallConfig } from "@x402-miden/types";
