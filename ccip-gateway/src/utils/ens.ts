import { type Hex, decodeAbiParameters } from "viem";
import { namehash, normalize } from "viem/ens";

const TEXT_SELECTOR = "0x59d1d43c" as const;
const ADDR_SELECTOR = "0x3b3b57de" as const;
const ADDR_COIN_SELECTOR = "0xf1cb7e06" as const;

export type DecodedRequest =
  | { type: "text"; node: Hex; key: string }
  | { type: "addr"; node: Hex }
  | { type: "addr-coin"; node: Hex; coinType: bigint }
  | { type: "unknown"; selector: Hex };

export function decodeCcipRequest(callData: Hex): DecodedRequest {
  const selector = callData.slice(0, 10).toLowerCase() as Hex;
  const params = `0x${callData.slice(10)}` as Hex;

  switch (selector) {
    case TEXT_SELECTOR: {
      const [node, key] = decodeAbiParameters(
        [{ type: "bytes32" }, { type: "string" }],
        params
      );
      return { type: "text", node: node as Hex, key };
    }
    case ADDR_SELECTOR: {
      const [node] = decodeAbiParameters([{ type: "bytes32" }], params);
      return { type: "addr", node: node as Hex };
    }
    case ADDR_COIN_SELECTOR: {
      const [node, coinType] = decodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }],
        params
      );
      return { type: "addr-coin", node: node as Hex, coinType };
    }
    default:
      return { type: "unknown", selector };
  }
}

export function computeNamehash(
  label: string,
  namespace: "solvers" | "challengers"
): Hex {
  return namehash(normalize(`${label}.${namespace}.reckonprotocol.eth`));
}
