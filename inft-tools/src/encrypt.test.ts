import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sealBrainBlob, unsealBrainBlob } from "./encrypt.js";
import type { BrainBlob } from "@reckon-protocol/types";

describe("Brain Blob Encryption", () => {
  const testBlob: BrainBlob = {
    axl_ed25519_secret: "a".repeat(64),
    ebbo_threshold_prefs: {
      minSlash: "5000000", // 5 USDC
      maxBondPct: 50,
    },
    kh_api_key: "kh_test_key_12345",
    model_config: {
      model: "Qwen3-32B",
      maxTokens: 512,
    },
    performance_history: [],
  };

  const ownerSignature = "0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";

  it("should seal and unseal a brain blob correctly", () => {
    const sealed = sealBrainBlob(testBlob, ownerSignature);

    // All fields should be base64-encoded strings
    assert.ok(sealed.ciphertext.length > 0);
    assert.ok(sealed.nonce.length > 0);
    assert.ok(sealed.tag.length > 0);
    assert.ok(sealed.wrappedKey.length > 0);
    assert.ok(sealed.salt.length > 0);

    // Unseal should return the original blob
    const unsealed = unsealBrainBlob(sealed, ownerSignature);
    assert.deepStrictEqual(unsealed, testBlob);
  });

  it("should fail to unseal with wrong signature", () => {
    const sealed = sealBrainBlob(testBlob, ownerSignature);
    const wrongSignature = "0xwrongsignature";

    assert.throws(() => {
      unsealBrainBlob(sealed, wrongSignature);
    });
  });

  it("should produce different ciphertexts for the same blob (random nonce)", () => {
    const sealed1 = sealBrainBlob(testBlob, ownerSignature);
    const sealed2 = sealBrainBlob(testBlob, ownerSignature);

    assert.notStrictEqual(sealed1.ciphertext, sealed2.ciphertext);
    assert.notStrictEqual(sealed1.nonce, sealed2.nonce);
  });

  it("should handle blob with performance history", () => {
    const blobWithHistory: BrainBlob = {
      ...testBlob,
      performance_history: [
        {
          orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          slashAmountUSDC: "12400000",
          timestamp: 1700000000,
          benchmarkPrice: "1023700000000000000",
          actualPrice: "1008900000000000000",
        },
      ],
    };

    const sealed = sealBrainBlob(blobWithHistory, ownerSignature);
    const unsealed = unsealBrainBlob(sealed, ownerSignature);
    assert.deepStrictEqual(unsealed, blobWithHistory);
  });
});
