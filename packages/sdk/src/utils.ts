/**
 * @x402-miden/sdk -- utility helpers
 */

/**
 * Convert a Uint8Array to a hex string.
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert a hex string to a Uint8Array.
 * Strips an optional "0x" prefix.
 */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Validate that a string looks like a 32-byte hex value.
 */
export function isHex32(value: string): boolean {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  return /^[0-9a-fA-F]{64}$/.test(clean);
}

/**
 * Validate that a string looks like a valid hex-encoded value.
 */
export function isHex(value: string): boolean {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  return /^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0;
}

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param maxAttempts - Maximum number of attempts (including the first)
 * @param baseDelayMs - Initial delay in ms, doubled on each retry
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Parse a 402 response body into a LightweightPaymentRequirement.
 * Validates required fields and throws if the response is malformed.
 */
export function parse402ResponseBody(body: unknown): {
  recipientDigest: string;
  asset: string;
  amount: number;
  noteTag: number;
  network: string;
  payTo: string;
  serialNum?: string;
} {
  if (typeof body !== "object" || body === null) {
    throw new Error("402 response body is not an object");
  }

  const obj = body as Record<string, unknown>;

  const requiredStrings = ["recipientDigest", "asset", "network", "payTo"] as const;
  for (const key of requiredStrings) {
    if (typeof obj[key] !== "string" || (obj[key] as string).length === 0) {
      throw new Error(`402 response missing or invalid field: ${key}`);
    }
  }

  if (typeof obj.amount !== "number" || obj.amount <= 0) {
    throw new Error("402 response missing or invalid field: amount");
  }

  if (typeof obj.noteTag !== "number") {
    throw new Error("402 response missing or invalid field: noteTag");
  }

  return {
    recipientDigest: obj.recipientDigest as string,
    asset: obj.asset as string,
    amount: obj.amount as number,
    noteTag: obj.noteTag as number,
    network: obj.network as string,
    payTo: obj.payTo as string,
    serialNum: typeof obj.serialNum === "string" ? obj.serialNum : undefined,
  };
}
