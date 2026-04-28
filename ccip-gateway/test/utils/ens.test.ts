import { describe, it, expect } from "vitest";
import { decodeCcipRequest, computeNamehash } from "../../src/utils/ens.js";
import { encodeFunctionData, namehash, type Hex } from "viem";

const textAbi = [
  {
    name: "text",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
] as const;

const addrAbi = [
  {
    name: "addr",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const;

const addrCoinAbi = [
  {
    name: "addr",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "coinType", type: "uint256" },
    ],
    outputs: [{ type: "bytes" }],
    stateMutability: "view",
  },
] as const;

describe("decodeCcipRequest", () => {
  const node = namehash("bunni.solvers.reckonprotocol.eth");

  it("decodes text(node, key)", () => {
    const callData = encodeFunctionData({
      abi: textAbi,
      functionName: "text",
      args: [node as `0x${string}`, "reckon.reputation"],
    });
    const result = decodeCcipRequest(callData);
    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.node).toBe(node);
      expect(result.key).toBe("reckon.reputation");
    }
  });

  it("decodes addr(node)", () => {
    const callData = encodeFunctionData({
      abi: addrAbi,
      functionName: "addr",
      args: [node as `0x${string}`],
    });
    const result = decodeCcipRequest(callData);
    expect(result.type).toBe("addr");
    if (result.type === "addr") {
      expect(result.node).toBe(node);
    }
  });

  it("decodes addr(node, coinType)", () => {
    const callData = encodeFunctionData({
      abi: addrCoinAbi,
      functionName: "addr",
      args: [node as `0x${string}`, 60n],
    });
    const result = decodeCcipRequest(callData);
    expect(result.type).toBe("addr-coin");
    if (result.type === "addr-coin") {
      expect(result.node).toBe(node);
      expect(result.coinType).toBe(60n);
    }
  });

  it("returns unknown for unrecognized selector", () => {
    const callData = "0xdeadbeef0000000000000000000000000000000000000000000000000000000000000000" as Hex;
    const result = decodeCcipRequest(callData);
    expect(result.type).toBe("unknown");
  });
});

describe("computeNamehash", () => {
  it("computes namehash for solver subname", () => {
    const hash = computeNamehash("bunni", "solvers");
    expect(hash).toBe(namehash("bunni.solvers.reckonprotocol.eth"));
  });

  it("computes namehash for challenger subname", () => {
    const hash = computeNamehash("eve", "challengers");
    expect(hash).toBe(namehash("eve.challengers.reckonprotocol.eth"));
  });

  it("normalizes case", () => {
    const upper = computeNamehash("Bunni", "solvers");
    const lower = computeNamehash("bunni", "solvers");
    expect(upper).toBe(lower);
  });
});
