/**
 * Basic Miden Agent
 *
 * A simple agent that uses midenFetch to automatically handle
 * 402 Payment Required responses with lightweight Miden payments.
 *
 * When the server returns 402, the agent:
 * 1. Parses the payment requirement
 * 2. Creates a P2ID note targeting the server's account
 * 3. Proves and submits the transaction
 * 4. Syncs state to obtain an inclusion proof
 * 5. Retries the request with the proof attached
 */

import { MidenAgentWallet, midenFetch } from "@x402-miden/sdk";

async function main(): Promise<void> {
  console.log("Initializing Miden agent wallet...");

  // Create a wallet. On first run this creates a new on-chain account.
  // Pass { accountId: "0x..." } to reuse an existing account.
  const wallet = await MidenAgentWallet.create({
    // nodeUrl: "https://rpc.testnet.miden.io",  // default
  });

  console.log(`Wallet account: ${wallet.accountId}`);

  // Create a fetch wrapper that auto-handles 402 responses
  const fetch402 = midenFetch(wallet, {
    onPaymentRequired: (req) => {
      console.log(`Payment required: ${req.amount} to ${req.payTo}`);
    },
    onPaymentSuccess: (header) => {
      console.log(`Payment confirmed in block ${header.blockNum}`);
    },
    onPaymentError: (err) => {
      console.error(`Payment failed: ${err.message}`);
    },
  });

  // Make a request to a paywalled endpoint.
  // If the server returns 402, the wallet automatically pays and retries.
  const url = process.env.PAYWALL_URL ?? "http://localhost:3000/premium";
  console.log(`Fetching ${url}...`);

  try {
    const response = await fetch402(url);

    if (response.ok) {
      const data = await response.json();
      console.log("Success:", JSON.stringify(data, null, 2));
    } else {
      console.error(`Request failed with status ${response.status}`);
      const text = await response.text();
      console.error(text);
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  }
}

main();
