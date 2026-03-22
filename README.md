# x402-miden

TypeScript monorepo for **x402 lightweight payment verification** on the Miden network.

Implements the payment protocol defined by bobbinth in [0xMiden/node#1796](https://github.com/0xMiden/node/issues/1796), matching the Rust implementation in [x402-chain-miden](https://github.com/pabloyarce/x402-chain-miden).

## Lightweight Payment Flow

```
Agent                              Server
  |-- GET /resource ------------------>|
  |<-- 402 {recipientDigest, asset,    |
  |    noteTag, payTo, serialNum} -----|
  |                                    |
  | Create P2ID note (server's serialNum)
  | STARK prove + submit to network
  | sync_state() -> inclusion proof
  |                                    |
  |-- {noteId, blockNum, noteIndex,    |
  |    noteMetadata, inclusionProof} ->|
  |                                    |
  |    NoteId == expected?             |
  |    SparseMerklePath.verify()       |
  |<-- 200 OK -------------------------|
```

The agent creates a P2ID (pay-to-ID) note targeting the server's account, proves
it via STARK, and submits to the Miden network. After syncing state, the agent
sends back a lightweight inclusion proof. The server verifies the note ID matches
expectations and validates the Sparse Merkle Path -- no full node required.

## Packages

| Package | Description |
|---------|-------------|
| `@x402-miden/types` | Shared wire-format types matching the Rust crate |
| `@x402-miden/sdk` | Agent-side SDK with WASM WebClient integration |
| `@x402-miden/middleware` | Express and Hono server middleware for paywalls |
| `create-miden-agent` | CLI scaffolding tool for new projects |

## Quick Start

### Agent (client) side

```typescript
import { MidenAgentWallet, midenFetch } from '@x402-miden/sdk';

const wallet = await MidenAgentWallet.create();
const fetch402 = midenFetch(wallet);

const response = await fetch402('https://api.example.com/premium-data');
const data = await response.json();
```

### Server (paywall) side

```typescript
import express from 'express';
import { midenPaywall } from '@x402-miden/middleware';

const app = express();

app.get('/premium', midenPaywall({
  payTo: '0xYOUR_ACCOUNT_ID',
  asset: '0xFAUCET_ID',
  amount: 1_000_000,
}), (req, res) => {
  res.json({ data: 'premium content' });
});
```

### Scaffold a new project

```bash
npx create-miden-agent my-app
```

## Development

```bash
npm install
npm run build
```

## Related

- [x402-chain-miden](https://github.com/pabloyarce/x402-chain-miden) -- Rust implementation
- [0xMiden/node#1796](https://github.com/0xMiden/node/issues/1796) -- Lightweight payment verification design
- [x402 protocol](https://www.x402.org/) -- HTTP 402 payment protocol
