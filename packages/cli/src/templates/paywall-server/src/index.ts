/**
 * Miden Paywall Server
 *
 * Express server that gates premium content behind x402 lightweight
 * payment verification on the Miden network.
 *
 * When a client requests a paywalled route without a payment header,
 * the middleware returns 402 with a LightweightPaymentRequirement.
 * Once the client submits a valid payment proof (inclusion proof from
 * the Miden network), the middleware verifies it via the facilitator
 * and allows the request through.
 */

import express from "express";
import { midenPaywall } from "@x402-miden/middleware";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Your Miden account ID (receives the payments)
const ACCOUNT_ID = process.env.MIDEN_ACCOUNT_ID ?? "0xYOUR_ACCOUNT_ID";

// Faucet ID for the token you accept
const FAUCET_ID =
  process.env.MIDEN_FAUCET_ID ?? "0x37d5977a8e16d8205a360820f0230f";

// Price in smallest token units
const PRICE = parseInt(process.env.PRICE ?? "1000000", 10);

// Facilitator URL (runs the Rust x402-chain-miden verification)
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "http://localhost:8402";

// ---------------------------------------------------------------------------
// Free routes
// ---------------------------------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    service: "Miden Paywall Server",
    endpoints: {
      "/": "This info page (free)",
      "/premium": `Premium content (${PRICE} tokens)`,
      "/premium/data": `Premium data endpoint (${PRICE} tokens)`,
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Paywalled routes
// ---------------------------------------------------------------------------

const paywall = midenPaywall({
  payTo: ACCOUNT_ID,
  asset: FAUCET_ID,
  amount: PRICE,
  facilitatorUrl: FACILITATOR_URL,
});

app.get("/premium", paywall, (_req, res) => {
  res.json({
    message: "Welcome to premium content!",
    data: "This content was unlocked by a Miden lightweight payment.",
    timestamp: new Date().toISOString(),
  });
});

app.get("/premium/data", paywall, (_req, res) => {
  res.json({
    items: [
      { id: 1, value: "Premium item A" },
      { id: 2, value: "Premium item B" },
      { id: 3, value: "Premium item C" },
    ],
    generatedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Miden Paywall Server running on http://localhost:${PORT}`);
  console.log(`  Account:     ${ACCOUNT_ID}`);
  console.log(`  Faucet:      ${FAUCET_ID}`);
  console.log(`  Price:       ${PRICE}`);
  console.log(`  Facilitator: ${FACILITATOR_URL}`);
  console.log("");
  console.log("Endpoints:");
  console.log(`  GET /           -- Service info (free)`);
  console.log(`  GET /premium    -- Premium content (paywalled)`);
});
