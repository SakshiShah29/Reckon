/* 0G Infrastructure page — 0G Compute, Storage, and iNFT management */

import { ZeroGCompute } from "@/components/zero-g-compute";
import { ZeroGStorage } from "@/components/zero-g-storage";
import { ZeroGInft } from "@/components/zero-g-inft";

export default function ZeroGPage() {
  return (
    <div className="p-5">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-white">0G Infrastructure</h1>
        <p className="text-[13px] text-[#666] mt-1">
          0G Compute, Storage, and iNFT management
        </p>
      </div>

      <div className="mt-4">
        <ZeroGCompute />
      </div>

      <div className="mt-4">
        <ZeroGStorage />
      </div>

      <div className="mt-4">
        <ZeroGInft />
      </div>
    </div>
  );
}
