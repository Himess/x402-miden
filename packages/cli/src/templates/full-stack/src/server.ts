/**
 * Full-Stack Example -- Server
 *
 * Express server with Miden paywall middleware.
 * Run alongside the agent to see the full x402 payment flow.
 *
 * Usage:
 *   npm run dev:server
 *
 * Then in another terminal:
 *   npm run dev:agent
 */

import express from "express";
import { midenPaywall } from "@x402-miden/middleware";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const ACCOUNT_ID = process.env.MIDEN_ACCOUNT_ID ?? "0xYOUR_ACCOUNT_ID";
const FAUCET_ID =
  process.env.MIDEN_FAUCET_ID ?? "0x37d5977a8e16d8205a360820f0230f";
const PRICE = parseInt(process.env.PRICE ?? "1000000", 10);
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "http://localhost:8402";

// Free endpoint
app.get("/", (_req, res) => {
  res.json({
    service: "Miden Full-Stack Example",
    hint: "Try GET /api/data (paywalled)",
  });
});

// Paywalled endpoint
app.get(
  "/api/data",
  midenPaywall({
    payTo: ACCOUNT_ID,
    asset: FAUCET_ID,
    amount: PRICE,
    facilitatorUrl: FACILITATOR_URL,
  }),
  (_req, res) => {
    res.json({
      secret: "The answer to everything is 42.",
      paidAt: new Date().toISOString(),
    });
  },
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`  GET /          -- Info (free)`);
  console.log(`  GET /api/data  -- Secret data (${PRICE} tokens)`);
  console.log("");
  console.log("Waiting for agents to connect...");
});
