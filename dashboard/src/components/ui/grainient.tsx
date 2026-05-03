"use client";

/**
 * Grainient — CSS-only animated mesh gradient with film grain.
 * Uses @keyframes for buttery 60fps, no JS animation loop.
 */
export function Grainient({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* ── Mesh blobs ── */}
      <div className="landing-mesh absolute inset-[-60%] w-[220%] h-[220%]" />

      {/* ── Grain overlay (SVG turbulence) ── */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.09] mix-blend-overlay">
        <filter id="grain-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </div>
  );
}
