import { randomBytes, createCipheriv, pbkdf2Sync, createDecipheriv } from "node:crypto";
import type { BrainBlob, SealedBrainBlob } from "@reckon-protocol/types";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_DIGEST = "sha256";
const AES_ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits

/**
 * Seals a BrainBlob using AES-256-GCM encryption.
 *
 * Flow (matches ERC-7857 reference sealing pattern):
 * 1. Generate random 32-byte AES key K
 * 2. Encrypt blob via AES-256-GCM (12-byte nonce, 16-byte tag)
 * 3. PBKDF2-derive a wrapping key from owner's signed challenge string (100k iterations, SHA-256)
 * 4. Wrap K under the derived wrapping key using AES-256-GCM
 * 5. Return {ciphertext, nonce, tag, wrappedKey, salt}
 *
 * @param blob - The brain blob to encrypt
 * @param ownerSignature - Owner's signature of the challenge string, used for key derivation
 * @returns SealedBrainBlob ready for upload to 0G Storage
 */
export function sealBrainBlob(
  blob: BrainBlob,
  ownerSignature: string,
): SealedBrainBlob {
  // 1. Generate random AES-256 key
  const dataKey = randomBytes(32);

  // 2. Encrypt the blob with the data key
  const nonce = randomBytes(NONCE_LENGTH);
  const plaintext = Buffer.from(JSON.stringify(blob), "utf-8");
  const cipher = createCipheriv(AES_ALGORITHM, dataKey, nonce, {
    authTagLength: TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 3. Derive wrapping key from owner's signature via PBKDF2
  const salt = randomBytes(32);
  const wrappingKey = pbkdf2Sync(
    Buffer.from(ownerSignature, "utf-8"),
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST,
  );

  // 4. Wrap the data key under the wrapping key
  const wrapNonce = randomBytes(NONCE_LENGTH);
  const wrapCipher = createCipheriv(AES_ALGORITHM, wrappingKey, wrapNonce, {
    authTagLength: TAG_LENGTH,
  });
  const wrappedKeyData = Buffer.concat([
    wrapCipher.update(dataKey),
    wrapCipher.final(),
  ]);
  const wrapTag = wrapCipher.getAuthTag();

  // Pack wrappedKey as: wrapNonce (12) + wrappedKeyData (32) + wrapTag (16) = 60 bytes
  const wrappedKey = Buffer.concat([wrapNonce, wrappedKeyData, wrapTag]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: tag.toString("base64"),
    wrappedKey: wrappedKey.toString("base64"),
    salt: salt.toString("base64"),
  };
}

/**
 * Unseals a SealedBrainBlob by reversing the sealing process.
 *
 * @param sealed - The sealed brain blob from 0G Storage
 * @param ownerSignature - Owner's signature of the challenge string
 * @returns The decrypted BrainBlob
 * @throws Error if decryption fails (wrong key, tampered data)
 */
export function unsealBrainBlob(
  sealed: SealedBrainBlob,
  ownerSignature: string,
): BrainBlob {
  const salt = Buffer.from(sealed.salt, "base64");
  const wrappedKeyBuf = Buffer.from(sealed.wrappedKey, "base64");

  // 1. Re-derive the wrapping key from owner's signature
  const wrappingKey = pbkdf2Sync(
    Buffer.from(ownerSignature, "utf-8"),
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST,
  );

  // 2. Unwrap the data key
  // wrappedKeyBuf layout: wrapNonce (12) + wrappedKeyData (32) + wrapTag (16)
  const wrapNonce = wrappedKeyBuf.subarray(0, NONCE_LENGTH);
  const wrappedKeyData = wrappedKeyBuf.subarray(NONCE_LENGTH, NONCE_LENGTH + 32);
  const wrapTag = wrappedKeyBuf.subarray(NONCE_LENGTH + 32);

  const unwrapDecipher = createDecipheriv(AES_ALGORITHM, wrappingKey, wrapNonce, {
    authTagLength: TAG_LENGTH,
  });
  unwrapDecipher.setAuthTag(wrapTag);
  const dataKey = Buffer.concat([
    unwrapDecipher.update(wrappedKeyData),
    unwrapDecipher.final(),
  ]);

  // 3. Decrypt the blob
  const nonce = Buffer.from(sealed.nonce, "base64");
  const ciphertext = Buffer.from(sealed.ciphertext, "base64");
  const tag = Buffer.from(sealed.tag, "base64");

  const decipher = createDecipheriv(AES_ALGORITHM, dataKey, nonce, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf-8")) as BrainBlob;
}
