---
version: alpha
name: rBazaar — Dawn Glass (frame layer)
description: >
  Frame-scale design system for the rBazaar hackathon film, lifted directly from the live app
  (apps/frontend). Seeded from the editorial-forest preset (serif-led, green/cream) and re-cut to
  the product's own atoms: oat-cream canvas, sage green, warm ink, Instrument Serif display,
  Inter body, frosted-glass cards with soft long shadows, and the misty dawn-hill backdrop.
  Motion: airy and bouncy — things float in on springs and settle.
unit: the frame — 1920×1080
principle: the app is the brand · airy over dense · numbers come from the repo

colors:
  canvas: "#F4F2EC"        # oat cream, the app background
  canvas-2: "#ECE9DF"      # deeper cream for wells
  ink: "#1C1D18"           # warm near-black
  muted: "#63665D"         # secondary text
  faint: "#7C7E73"         # tertiary / chrome
  sage: "#3F7D5C"          # primary accent (buttons, active chips, prices)
  sage-dark: "#2A543D"     # pressed / deep accent
  sage-mark: "#4C7E60"     # logo square
  mint: "#DCEBE1"          # tinted chip / soft highlight
  glass: "rgba(255,255,255,0.62)"
  line: "rgba(28,29,24,0.08)"
  peach: "#E7A977"         # the warm node color in marketplace previews (sparing)
  rose: "#E8B9C4"          # dawn sky tint (gradients only)
  sky: "#CFE0EA"           # dawn sky tint (gradients only)
  alert: "#C8553D"         # risk / pedestrian alert (sparing, one frame)
  chain-ausd: "#3F7D5C"    # AUSD rendered in brand sage
  chain-bnb: "#F0B90B"     # BNB Chain yellow (only on the BNB proof chip)
  chain-base: "#0052FF"    # Base blue (only on the Base Sepolia chip)

typography:
  display-hero: { fontFamily: "Instrument Serif", px: 168, weight: 400, lineHeight: 0.92, tracking: "-0.025em" }
  display:      { fontFamily: "Instrument Serif", px: 112, weight: 400, lineHeight: 0.96, tracking: "-0.02em" }
  headline:     { fontFamily: "Instrument Serif", px: 80, weight: 400, lineHeight: 1.0, tracking: "-0.015em" }
  title-card:   { fontFamily: "Instrument Serif", px: 52, weight: 400, lineHeight: 1.04, tracking: "-0.01em" }
  stat-figure:  { fontFamily: "Instrument Serif", px: 200, weight: 400, lineHeight: 0.9, tracking: "-0.03em" }
  body:         { fontFamily: "Inter", px: 30, weight: 400, lineHeight: 1.4 }
  body-card:    { fontFamily: "Inter", px: 24, weight: 400, lineHeight: 1.4 }
  label:        { fontFamily: "Inter", px: 20, weight: 500, tracking: "0.14em", upper: true }
  chip:         { fontFamily: "Inter", px: 22, weight: 500, tracking: "0" }
  mono:         { fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace", px: 22, weight: 500 }

fonts:
  - "Instrument Serif → assets/fonts/instrument-serif-latin-400-normal.woff2 (+ italic)"
  - "Inter → assets/fonts/inter-latin-wght-normal.woff2 (variable 100–900)"

spacing:
  slide-pad: "120px"
  radius-card: "28px"
  radius-chip: "999px"
  radius-small: "14px"
  hairline: "1px solid rgba(28,29,24,0.08)"

components:
  glass-card:
    background: "rgba(255,255,255,0.62) + backdrop-filter: blur(24px) saturate(1.1)"
    border: "1px solid rgba(255,255,255,0.7)"
    shadow: "0 1px 2px rgba(28,29,24,0.03), 0 24px 80px -24px rgba(28,29,24,0.18)"
    rounded: "{spacing.radius-card}"
    description: "THE container. Every card, panel, receipt, listing floats on glass."
  chip:
    background: "{colors.mint} text {colors.sage-dark} — or glass with hairline"
    rounded: "{spacing.radius-chip}"
    typography: "{typography.chip}"
  primary-button:
    background: "{colors.sage}"
    text: "#fff"
    rounded: "{spacing.radius-chip}"
  price-tag:
    typography: "Instrument Serif number + Inter 'AUSD / call' small label in {colors.faint}"
  wordmark:
    composition: "assets/rbazaar-mark.svg (green rounded square, layers icon) + 'rBazaar' in Instrument Serif"
  backdrop:
    composition: "assets/dawn-hill.jpg at 20–35% over {colors.canvas}, with slow drifting radial blooms of rose/sky/mint (blur 120px+)"
  ui-plate:
    composition: "real app screenshot inside a glass browser frame (28px radius, soft long shadow), slight 3D tilt allowed (rotateX ≤ 8°, rotateY ≤ 10°)"
---

# rBazaar — Dawn Glass

## Overview

The film should feel like the app: morning light, frosted glass, green growth. Calm canvas, confident
serif headlines, and everything **floats** — cards drift a few px on idle, enter on springs (overshoot
then settle), and leave by lifting up and fading like mist. It's a hackathon film: oversell with
scale and momentum, never with clutter.

## The Frame

- Canvas is always oat cream with the dawn-hill backdrop + drifting color blooms (never flat white, never dark).
- One idea per frame; big Instrument Serif headline + at most 3 supporting glass cards.
- Real UI screenshots are hero props, framed as glass browser plates.
- Numbers are oversized serif figures with count-ups.
- Sage is the only strong color. Peach/rose/sky are atmosphere. Alert red appears only on the pedestrian-risk beat. BNB yellow and Base blue appear only on their chain chips.

## Typography

Instrument Serif 400 for all display (it has one weight — scale and tracking carry hierarchy; italic for
one emphasized word per headline, e.g. "paid *per call*"). Inter for body, chips, labels. Labels are small
uppercase tracked Inter in {faint}. Mono only for addresses, hashes, headers like `PAYMENT-SIGNATURE`.

## Depth & Surface

Glass cards with blur and soft long shadow; a 1px white inner border. Depth via layered parallax (backdrop
slow, cards medium, foreground chips fast). No hard offset shadows, no neon glows, no dark mode.

## Motion (house style)

- Entrances: `back.out(1.6–2.2)` springs from y+40..80 / scale 0.85–0.92, staggered 0.06–0.12s.
- Idle: gentle float (sine yoyo, 4–8px, 3–5s) on hero cards and chips.
- Counts: numbers tick up with `power2.out`.
- Exits: lift −30px + fade + blur(6px), 0.35–0.5s.
- Camera: slow push-ins (scale 1.0→1.06) on UI plates; occasional 3D tilt settle.
- Connectors: SVG paths draw on (stroke-dashoffset), tiny dots travel along them = payments.

## Composition Rules

### Do
- Keep 120px safe margins. Center or left-aligned headline with cards orbiting.
- Use real copy and numbers from the app and repo.
- Make money movement visible: AUSD coin chips flying from robot → vendor.

### Don't
- No stock-robot clipart; robots are drawn as simple line/glass forms in the brand palette.
- No more than ~12 words of headline per frame.
- No dark backgrounds, no gradients outside the atmospheric blooms.

## Numerals & Claims (hard rule)

Only these figures: 1,179 listings · 22 vendors · 38 capabilities · YOLO11s 0.72 mAP vs YOLO11n 0.63 ·
Pedestrian Guard Lite 0.004 AUSD (114 ms) vs Pro 0.020 AUSD (282 ms) · per-call 0.05 / per-mission 0.10 /
daily 5 AUSD caps · ~62 live-check assertions · x402 v2 · ERC-3009 · Base Sepolia (84532) · BSC Testnet (97) ·
AUSD 6 decimals · settle-one-at-a-time · 2 confirmations · 200-block log windows · 1,086 niche skills.
