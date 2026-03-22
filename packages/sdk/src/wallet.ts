/**
 * @x402-miden/sdk -- MidenAgentWallet
 *
 * Agent-side wallet that wraps the Miden WASM WebClient to create and submit
 * P2ID payment notes following bobbinth's lightweight verification design.
 */

import type {
  LightweightPaymentRequirement,
  LightweightPaymentHeader,
  WalletConfig,
} from "@x402-miden/types";
import { toHex, retryWithBackoff } from "./utils.js";

/**
 * Represents a WebClient instance from the Miden WASM SDK.
 *
 * This is a minimal interface capturing the methods we invoke. The actual
 * type comes from `@aspect-build/aspect-sdk` or a future `@miden-sdk/miden-sdk`
 * package. We define it here so the wallet compiles without requiring the WASM
 * package at type-check time.
 */
interface MidenWebClient {
  new_account(params: unknown): Promise<string>;
  get_account(accountId: string): Promise<{ id: string }>;
  sync_state(): Promise<void>;
  get_balance(accountId: string, faucetId: string): Promise<bigint>;
  create_note(params: unknown): Promise<{ noteId: string; [key: string]: unknown }>;
  prove_transaction(params: unknown): Promise<unknown>;
  submit_transaction(params: unknown): Promise<unknown>;
  get_note(noteId: string): Promise<{
    id: string;
    blockNum: number;
    noteIndex: number;
    metadata: string;
    inclusionProof: string;
    [key: string]: unknown;
  }>;
}

/** Factory function type for obtaining a WebClient instance. */
type WebClientFactory = (nodeUrl?: string, storePath?: string) => Promise<MidenWebClient>;

/**
 * Global WebClient factory override. Set this before creating a wallet
 * if you need to inject a custom WASM instantiation path.
 */
let webClientFactory: WebClientFactory | null = null;

/**
 * Register a custom factory for creating WebClient instances.
 * Useful for testing or when the WASM module is loaded differently.
 */
export function setWebClientFactory(factory: WebClientFactory): void {
  webClientFactory = factory;
}

/**
 * Default factory that dynamically imports the Miden WASM SDK.
 */
async function defaultWebClientFactory(
  nodeUrl?: string,
  _storePath?: string,
): Promise<MidenWebClient> {
  // Dynamic import so the package compiles even when the WASM SDK isn't installed.
  // At runtime, the consumer must have the WASM SDK available.
  try {
    const midenSdk = await import("@aspect-build/aspect-sdk" as string);
    const client = await midenSdk.createWebClient({
      nodeUrl: nodeUrl ?? "https://rpc.testnet.miden.io",
    });
    return client as unknown as MidenWebClient;
  } catch {
    throw new Error(
      "Failed to import Miden WASM SDK. Install @aspect-build/aspect-sdk or " +
        "register a custom factory via setWebClientFactory().",
    );
  }
}

/**
 * Agent-side wallet for x402 lightweight payments on Miden.
 *
 * Wraps the Miden WASM WebClient to provide a high-level API for:
 * - Creating and submitting P2ID payment notes
 * - Obtaining inclusion proofs after network sync
 * - Querying token balances
 *
 * ## Usage
 *
 * ```typescript
 * const wallet = await MidenAgentWallet.create();
 * const header = await wallet.createAndSubmitPayment(requirement);
 * ```
 */
export class MidenAgentWallet {
  private client: MidenWebClient;
  private _accountId: string;

  private constructor(client: MidenWebClient, accountId: string) {
    this.client = client;
    this._accountId = accountId;
  }

  /**
   * Create a new MidenAgentWallet.
   *
   * If `config.accountId` is provided, the wallet attaches to that existing
   * account. Otherwise, a new basic account is created on the network.
   *
   * @param config - Optional wallet configuration.
   */
  static async create(config?: WalletConfig): Promise<MidenAgentWallet> {
    const factory = webClientFactory ?? defaultWebClientFactory;
    const client = await factory(config?.nodeUrl, config?.storePath);

    let accountId: string;
    if (config?.accountId) {
      // Verify the account exists
      const account = await client.get_account(config.accountId);
      accountId = account.id;
    } else {
      // Create a new basic account
      accountId = await client.new_account({
        type: "basic",
        storage: "offchain",
      });
    }

    return new MidenAgentWallet(client, accountId);
  }

  /** The Miden account ID for this wallet, hex-encoded. */
  get accountId(): string {
    return this._accountId;
  }

  /**
   * Create and submit a P2ID payment note according to bobbinth's
   * lightweight verification flow.
   *
   * ## Flow
   *
   * 1. **Parse requirement** -- Extract the recipient digest, asset info,
   *    note tag, and optional serial number from the 402 response.
   *
   * 2. **Create P2ID note** -- Build a pay-to-ID note targeting the server's
   *    account (`payTo`). The note carries the requested `asset` amount and
   *    uses the server's `serialNum` if provided, allowing the server to
   *    deterministically compute the expected `noteId`.
   *
   * 3. **Prove transaction** -- Generate a STARK proof for the transaction
   *    that creates the note. This proves the agent has sufficient balance
   *    and the note is correctly constructed.
   *
   * 4. **Submit to network** -- Send the proven transaction to the Miden
   *    network for inclusion in a block.
   *
   * 5. **Sync state** -- Poll the network until the transaction is included
   *    in a block and the note appears in the note tree. This gives us the
   *    block number, note index, and Sparse Merkle Path for the inclusion
   *    proof.
   *
   * 6. **Return payment header** -- Package the `noteId`, `blockNum`,
   *    `noteIndex`, `noteMetadata`, and `inclusionProof` into a
   *    `LightweightPaymentHeader` for the server to verify.
   *
   * @param requirement - The payment requirement from the 402 response.
   * @returns A payment header containing the inclusion proof.
   * @throws If the wallet has insufficient balance, the transaction fails,
   *         or the note cannot be proven to be included in a block.
   */
  async createAndSubmitPayment(
    requirement: LightweightPaymentRequirement,
  ): Promise<LightweightPaymentHeader> {
    // Step 1: Build the P2ID note creation parameters
    const noteParams: Record<string, unknown> = {
      type: "p2id",
      senderAccountId: this._accountId,
      targetAccountId: requirement.payTo,
      faucetId: requirement.asset,
      amount: requirement.amount,
      noteTag: requirement.noteTag,
      recipientDigest: requirement.recipientDigest,
    };

    // Include serial number if provided by the server (bobbinth's optional field)
    if (requirement.serialNum) {
      noteParams.serialNum = requirement.serialNum;
    }

    // Step 2: Create the P2ID note
    const noteResult = await this.client.create_note(noteParams);
    const noteId = noteResult.noteId;

    // Step 3: Prove the transaction (STARK proof)
    const provenTx = await this.client.prove_transaction({
      accountId: this._accountId,
      noteId,
    });

    // Step 4: Submit to the Miden network
    await this.client.submit_transaction(provenTx);

    // Step 5: Sync state until the note is included in a block.
    // The note needs time to be included, so we retry with backoff.
    const noteDetails = await retryWithBackoff(
      async () => {
        await this.client.sync_state();
        const note = await this.client.get_note(noteId);
        if (!note.blockNum || note.blockNum === 0) {
          throw new Error("Note not yet included in a block");
        }
        return note;
      },
      10, // up to 10 attempts
      2000, // start at 2s, doubling each time
    );

    // Step 6: Package the payment header
    return {
      noteId,
      blockNum: noteDetails.blockNum,
      noteIndex: noteDetails.noteIndex,
      noteMetadata: noteDetails.metadata,
      inclusionProof: noteDetails.inclusionProof,
    };
  }

  /**
   * Get the balance for a specific token (faucet).
   *
   * @param faucetId - The faucet account ID, hex-encoded.
   * @returns The balance as a bigint in the smallest token unit.
   */
  async getBalance(faucetId: string): Promise<bigint> {
    await this.client.sync_state();
    return this.client.get_balance(this._accountId, faucetId);
  }

  /**
   * Sync the wallet's local state with the Miden network.
   */
  async sync(): Promise<void> {
    await this.client.sync_state();
  }
}
