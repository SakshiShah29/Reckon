# Reckon Dashboard — Playful Geometric Design System

## Philosophy
**"Stable Grid, Wild Decoration"** — content lives in clean readable areas;
the world around it is alive with shape, color and movement.
Memphis-inspired, cleaned up for modern DeFi dashboards.

---

## Tokens

### Colors
| Token             | Value     | Usage                               |
|-------------------|-----------|-------------------------------------|
| `background`      | `#FFFDF5` | Warm cream (page bg)                |
| `foreground`      | `#1E293B` | Slate 800 (primary text)            |
| `muted`           | `#F1F5F9` | Slate 100 (subtle backgrounds)      |
| `muted-fg`        | `#64748B` | Slate 500 (secondary text)          |
| `accent`          | `#8B5CF6` | Vivid Violet (primary actions)      |
| `secondary`       | `#F472B6` | Hot Pink (playful pop)              |
| `tertiary`        | `#FBBF24` | Amber/Yellow (optimism)             |
| `quaternary`      | `#34D399` | Emerald/Mint (freshness, success)   |
| `border`          | `#E2E8F0` | Slate 200                           |
| `card`            | `#FFFFFF` | White                               |
| `destructive`     | `#EF4444` | Red 500                             |

**Confetti rule**: rotate `accent`, `secondary`, `tertiary`, `quaternary` on
card shadows, icons, and decorative shapes.

### Typography
| Role     | Family                          | Weight      |
|----------|---------------------------------|-------------|
| Heading  | `Outfit`, system-ui, sans-serif | 700 / 800   |
| Body     | `Plus Jakarta Sans`, system-ui  | 400 / 500   |
| Mono     | `JetBrains Mono`, monospace     | 400 / 500   |

Scale ratio: **1.25** (Major Third).

### Radius
| Token        | Value    |
|--------------|----------|
| `radius-sm`  | `8px`    |
| `radius-md`  | `16px`   |
| `radius-lg`  | `24px`   |
| `radius-full`| `9999px` |

### Shadows (Hard — no blur)
| Token         | Value                          |
|---------------|--------------------------------|
| `pop`         | `4px 4px 0 0 #1E293B`         |
| `pop-hover`   | `6px 6px 0 0 #1E293B`         |
| `pop-active`  | `2px 2px 0 0 #1E293B`         |
| `soft`        | `6px 6px 0 #E2E8F0`           |
| `soft-violet` | `6px 6px 0 #DDD6FE`           |
| `soft-pink`   | `6px 6px 0 #FBCFE8`           |
| `soft-amber`  | `6px 6px 0 #FDE68A`           |
| `soft-green`  | `6px 6px 0 #A7F3D0`           |

---

## Component Patterns

### Sticker Card (`.card`)
```
bg: white | border: 2px solid #1E293B | radius: 16px
shadow: 6px 6px 0 <rotating-color>
hover: translate(-2px, -2px), shadow grows to 8px 8px
transition: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Stat Card
Each of the 4 stat cards uses a different accent for its shadow and icon circle:
1. Violet (#8B5CF6 / shadow #DDD6FE)
2. Pink (#F472B6 / shadow #FBCFE8)
3. Amber (#FBBF24 / shadow #FDE68A)
4. Emerald (#34D399 / shadow #A7F3D0)

### Badge
```
font: 11px 600 | radius: full | border: 2px solid
variants: violet, pink, amber, green, red
```

### Live Dot
```
6px circle | bg: quaternary | box-shadow glow animation
```

---

## Page Layout — Dashboard Home

```
Row 1: [StatsCards x4]                    (grid-cols-4)
Row 2: [FillChart] + [EbboOracle | Health] (grid 3:1)
Row 3: [AgentHeartbeat | Leaderboard | Challenges] (grid-cols-3)
Row 4: [ProtocolEconomics x4]             (grid-cols-4)
Footer: [PartnerLogos marquee]
```

---

## Animation

| Effect    | CSS                                                        |
|-----------|------------------------------------------------------------|
| Bounce    | `cubic-bezier(0.34, 1.56, 0.64, 1)` on hover transitions |
| Wiggle    | `rotate: 0 → 3deg → -3deg → 0` keyframe on icon hover    |
| Pop-in    | `scale(0) → scale(1)` with bounce on mount                |
| Pulse     | Soft glow pulse on live-dot (2.5s ease-in-out infinite)    |

Always respect `prefers-reduced-motion`.

---

## Accessibility
- Text: `#1E293B` on `#FFFFFF`/`#FFFDF5` → AAA contrast
- Never rely only on color — always pair with shapes and text labels
- Focus: thick colored border + hard shadow
- Min touch target: 48px
