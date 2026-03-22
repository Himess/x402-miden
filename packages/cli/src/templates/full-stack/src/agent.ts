/**
 * Full-Stack Example -- Agent
 *
 * Agent that connects to the local paywall server, automatically
 * pays for content via Miden lightweight payments, and displays
 * the premium data.
 *
 * Usage:
 *   1. Start the server:  npm run dev:server
 *   2. Start the agent:   npm run dev:agent
 */

import { MidenAgentWallet, midenFetch } from "@x402-miden/sdk";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

async function main(): Promise<void> {
  console.log("=== Miden Agent ===");
  console.log("");

  // Step 1: Create the wallet
  console.log("Creating wallet...");
  const wallet = await MidenAgentWallet.create();
  console.log(`Account: ${wallet.accountId}`);
  console.log("");

  // Step 2: Create the auto-paying fetch wrapper
  const fetch402 = midenFetch(wallet, {
    onPaymentRequired: (req) => {
      console.log(`[Payment] Server requires ${req.amount} tokens`);
      console.log(`[Payment] Recipient: ${req.payTo}`);
      console.log(`[Payment] Creating P2ID note...`);
    },
    onPaymentSuccess: (header) => {
      console.log(`[Payment] Confirmed in block ${header.blockNum}`);
      console.log(`[Payment] Note ID: ${header.noteId}`);
    },
    onPaymentError: (err) => {
      console.error(`[Payment] Failed: ${err.message}`);
    },
  });

  // Step 3: Fetch free content
  console.log("Fetching free endpoint...");
  const freeResponse = await fetch(`${SERVER_URL}/`);
  const freeData = await freeResponse.json();
  console.log("Free response:", JSON.stringify(freeData, null, 2));
  console.log("");

  // Step 4: Fetch paywalled content (auto-pays)
  console.log("Fetching paywalled endpoint...");
  console.log("(This will trigger the x402 payment flow)");
  console.log("");

  try {
    const paidResponse = await fetch402(`${SERVER_URL}/api/data`);

    if (paidResponse.ok) {
      const paidData = await paidResponse.json();
      console.log("");
      console.log("Premium data received:");
      console.log(JSON.stringify(paidData, null, 2));
    } else {
      console.error(`Failed with status ${paidResponse.status}`);
      const text = await paidResponse.text();
      console.error(text);
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  }
}

main();
