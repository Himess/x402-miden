/**
 * @x402-miden/types
 *
 * Shared wire-format types for x402 lightweight payment verification on Miden.
 * These types match the Rust crate `x402-chain-miden` exactly.
 *
 * @see https://github.com/0xMiden/node/issues/1796 -- bobbinth's lightweight design
 * @see https://github.com/pabloyarce/x402-chain-miden -- Rust implementation
 */

// ---------------------------------------------------------------------------
// 402 Response -- what the server sends to the agent
// ---------------------------------------------------------------------------

/**
 * Payment requirement returned by the server in a 402 response.
 *
 * The agent uses these fields to construct a P2ID note targeting the server's
 * account. The `serialNum` is optional per bobbinth's design -- when provided,
 * the server can deterministically compute the expected noteId to verify the
 * payment without running a full node.
 */
export interface LightweightPaymentRequirement {
  /** Recipient digest, hex-encoded, 32 bytes. Identifies the server's account commitment. */
  recipientDigest: string;

  /** Faucet account ID, hex-encoded. Identifies the token being requested. */
  asset: string;

  /** Amount in the smallest token unit (u64). */
  amount: number;

  /** Note tag (u32). Used for note filtering and routing. */
  noteTag: number;

  /** CAIP-2 network identifier, e.g. "miden:testnet". */
  network: string;

  /** Server's Miden account ID, hex-encoded. The P2ID note target. */
  payTo: string;

  /** Serial number, hex-encoded, 32 bytes. Optional per bobbinth's design. */
  serialNum?: string;
}

// ---------------------------------------------------------------------------
// Payment proof -- what the agent sends back to the server
// ---------------------------------------------------------------------------

/**
 * Lightweight payment header sent by the agent after creating and submitting
 * a P2ID note. Contains everything the server needs to verify payment
 * via Sparse Merkle Path verification.
 */
export interface LightweightPaymentHeader {
  /** Note ID, hex-encoded, 32 bytes. Uniquely identifies the created P2ID note. */
  noteId: string;

  /** Block number (u32) in which the note was included. */
  blockNum: number;

  /** Index (u16) of the note within the block's note tree. */
  noteIndex: number;

  /** Hex-encoded NoteMetadata. Contains sender, tag, note type, and aux data. */
  noteMetadata: string;

  /** Hex-encoded SparseMerklePath proving note inclusion in the block's note tree. */
  inclusionProof: string;
}

// ---------------------------------------------------------------------------
// Server-side state
// ---------------------------------------------------------------------------

/**
 * Server-side payment context created when a 402 response is issued.
 * Stored by the facilitator or the server itself to correlate incoming
 * payment proofs with the original payment requirement.
 */
export interface PaymentContext {
  /** Recipient digest, hex-encoded, 32 bytes. */
  recipientDigest: string;

  /** Faucet account ID, hex-encoded. */
  assetFaucetId: string;

  /** Amount in the smallest token unit. */
  amount: number;

  /** Note tag (u32). */
  noteTag: number;

  /** Serial number, hex-encoded, 32 bytes. */
  serialNum: string;

  /** Creation timestamp in epoch seconds. */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Verification result
// ---------------------------------------------------------------------------

/**
 * Result of lightweight payment verification. Returned by the facilitator
 * or the server's own verification logic.
 */
export interface LightweightVerifyResponse {
  /** Whether the payment proof is valid. */
  valid: boolean;

  /** The verified note ID, hex-encoded. */
  noteId: string;

  /** Block number where the note was found. */
  blockNum: number;

  /** Error message if verification failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Facilitator API types
// ---------------------------------------------------------------------------

/**
 * Request to the facilitator to create a new payment requirement.
 * The facilitator generates the `recipientDigest`, `serialNum`, and
 * returns a `contextId` for later verification.
 */
export interface PaymentRequirementRequest {
  /** Server's Miden account ID, hex-encoded. */
  payTo: string;

  /** Faucet account ID, hex-encoded. */
  asset: string;

  /** Amount in the smallest token unit. */
  amount: number;

  /** Note tag (u32). */
  noteTag: number;

  /** CAIP-2 network identifier, e.g. "miden:testnet". */
  network: string;
}

/**
 * Response from the facilitator when creating a payment requirement.
 */
export interface PaymentRequirementResponse {
  /** Unique context ID for correlating the verification request. */
  contextId: string;

  /** The payment requirement to send in the 402 response. */
  requirement: LightweightPaymentRequirement;
}

/**
 * Request to the facilitator to verify a lightweight payment proof.
 */
export interface VerifyLightweightRequest {
  /** Context ID returned when the payment requirement was created. */
  contextId: string;

  /** The payment header sent by the agent. */
  paymentHeader: LightweightPaymentHeader;
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/**
 * Configuration for the MidenAgentWallet.
 */
export interface WalletConfig {
  /** Miden node RPC URL. Defaults to testnet. */
  nodeUrl?: string;

  /** Path to local store (for persistent state). */
  storePath?: string;

  /** Existing account ID to use. If omitted, a new account is created. */
  accountId?: string;
}

/**
 * Options for midenFetch, the auto-handling fetch wrapper.
 */
export interface MidenFetchOptions {
  /** Maximum number of payment retry attempts. Defaults to 1. */
  maxRetries?: number;

  /** Callback invoked when a 402 response is received and payment begins. */
  onPaymentRequired?: (requirement: LightweightPaymentRequirement) => void;

  /** Callback invoked when payment succeeds. */
  onPaymentSuccess?: (header: LightweightPaymentHeader) => void;

  /** Callback invoked when payment fails. */
  onPaymentError?: (error: Error) => void;
}

/**
 * Configuration for the server-side paywall middleware.
 */
export interface MidenPaywallConfig {
  /** Server's Miden account ID, hex-encoded. */
  payTo: string;

  /** Faucet account ID, hex-encoded. */
  asset: string;

  /** Price in the smallest token unit. */
  amount: number;

  /** Note tag (u32). Defaults to 0. */
  noteTag?: number;

  /** CAIP-2 network identifier. Defaults to "miden:testnet". */
  network?: string;

  /** Facilitator URL for payment requirement creation and verification. */
  facilitatorUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Miden testnet CAIP-2 network identifier. */
export const MIDEN_TESTNET = "miden:testnet";

/** Default Miden mainnet CAIP-2 network identifier. */
export const MIDEN_MAINNET = "miden:mainnet";

/** HTTP header used to carry the payment header from agent to server. */
export const X402_PAYMENT_HEADER = "X-Payment";

/** HTTP header used to carry the payment context ID. */
export const X402_CONTEXT_ID_HEADER = "X-Payment-Context";

/** Default facilitator URL. */
export const DEFAULT_FACILITATOR_URL = "http://localhost:8402";
