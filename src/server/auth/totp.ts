import { createHmac, randomBytes, createHash } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encodes a buffer or Uint8Array into a Base32 string (RFC 4648).
 */
export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Uint8Array buffer (RFC 4648).
 */
export function base32Decode(input: string): Uint8Array {
  const cleanInput = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const index = BASE32_ALPHABET.indexOf(cleanInput[i]!);
    if (index === -1) {
      throw new Error(`Invalid Base32 character encountered: ${cleanInput[i]}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Generates a cryptographically random Base32 TOTP secret.
 */
export function generateTotpSecret(bytes = 20): string {
  const random = randomBytes(bytes);
  return base32Encode(random);
}

/**
 * Computes the 6-digit TOTP token for a given Base32 secret and timestamp.
 */
export function generateTotpCode(
  secret: string,
  timestamp: number = Date.now(),
  stepSeconds = 30,
  digits = 6,
): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / stepSeconds);

  // Counter must be an 8-byte big-endian integer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = createHmac("sha1", key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation as per RFC 4226 / RFC 6238
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  const modulo = Math.pow(10, digits);
  const code = (binary % modulo).toString().padStart(digits, "0");
  return code;
}

/**
 * Verifies a TOTP token against a secret with allowed clock-skew window.
 * Default window = 1 step backward and 1 step forward (total 90-second window).
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  options: {
    timestamp?: number;
    window?: number;
    stepSeconds?: number;
    digits?: number;
  } = {},
): boolean {
  if (!code || typeof code !== "string") return false;
  const sanitizedCode = code.trim().replace(/\s+/g, "");
  const digits = options.digits ?? 6;
  if (sanitizedCode.length !== digits || !/^\d+$/.test(sanitizedCode)) {
    return false;
  }

  const timestamp = options.timestamp ?? Date.now();
  const window = options.window ?? 1;
  const stepSeconds = options.stepSeconds ?? 30;

  try {
    for (let offset = -window; offset <= window; offset++) {
      const checkTimestamp = timestamp + offset * stepSeconds * 1000;
      const expectedCode = generateTotpCode(
        secret,
        checkTimestamp,
        stepSeconds,
        digits,
      );
      if (expectedCode === sanitizedCode) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Formats an otpauth:// URL for authenticator apps.
 */
export function generateTotpUri(options: {
  issuer: string;
  accountName: string;
  secret: string;
  stepSeconds?: number;
  digits?: number;
}): string {
  const issuer = encodeURIComponent(options.issuer.trim());
  const accountName = encodeURIComponent(options.accountName.trim());
  const secret = options.secret.trim();
  const digits = options.digits ?? 6;
  const period = options.stepSeconds ?? 30;

  return `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${digits}&period=${period}`;
}

/**
 * Generates single-use backup recovery codes.
 */
export function generateBackupCodes(count = 8): {
  rawCodes: string[];
  hashedCodes: string[];
} {
  const rawCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const raw =
      `${randomBytes(4).toString("hex")}-${randomBytes(4).toString("hex")}`.toLowerCase();
    rawCodes.push(raw);
    hashedCodes.push(hashBackupCode(raw));
  }

  return { rawCodes, hashedCodes };
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

export function verifyAndConsumeBackupCode(
  inputCode: string,
  hashedCodes: string[],
): { valid: boolean; remainingHashedCodes: string[] } {
  const inputHash = hashBackupCode(inputCode);
  const matchIndex = hashedCodes.indexOf(inputHash);

  if (matchIndex === -1) {
    return { valid: false, remainingHashedCodes: hashedCodes };
  }

  const remainingHashedCodes = [...hashedCodes];
  remainingHashedCodes.splice(matchIndex, 1);
  return { valid: true, remainingHashedCodes };
}
