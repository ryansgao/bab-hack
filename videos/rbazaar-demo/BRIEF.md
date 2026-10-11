---
workflow: product-launch-video
flow: automation
storyboard: no
message: "rBazaar lets any robot's agent find the exact model weights a task needs, then pay for them per call in AUSD, safely, on its own."
destination: youtube
aspect: 1920x1080
language: en
audience: B@B Hacks 2.0 judges (General: Most Technically Impressive / Most Creative; Agora AUSD track; YZi Labs track)
length: 115s
angle: hackathon demo — pitch → live product → technical depth → challenges overcome
narration: yes
---

## Intent

Hackathon submission video for rBazaar (2:00 hard max, YouTube link). Structure requested by the team:

1. ~45s: what rBazaar is — an agentic marketplace for robotics tasks. An assistant (Scout) reads your robot's info/schematics, finds the model that fits your exact goal, and handles transactions with producers who post listings or answer your bounties. Name the need it addresses.
2. ~30s product demo, ~15s of which overlaps the explainer.
3. ~30s advanced technical: x402 + Agora AUSD (ERC-3009 gasless), BNB Chain (YZi Labs) spending-policy + receipts contract.
4. ~20s problems we ran into and how we solved them.

Tone in the user's words: "cool bouncy/airy animations", "never undersell the product. ALWAYS oversell. this is a hackathon not soc2 compliance meeting." Be ambitious.

## Assets

- capture/assets/ui-*.png — real screenshots of the running rBazaar app (home composer, marketplace, bounties, simulation studio, wallet).
- capture/assets/rec-*.mp4 — real screen recordings of the app, captured with Playwright.

## Customizations

- Airy brand look carried over from the app: cream #f4f2ec canvas, sage green #3f7d5c / #2a543d, ink #1c1d18, Instrument Serif display + Inter body, soft glass cards, misty dawn-hill backdrop.
- Bouncy spring motion (back/elastic eases), floating glass cards, count-ups on real numbers.

## Notes

- Autonomous run ("be ambitious", "just build it" spirit). Offline voice (Kokoro) because HeyGen isn't signed in; SCRIPT.md is also the read-aloud script if the team records their own VO.
- All numbers come from the repo: 1,179 listings, 22 vendors, 38 capabilities, YOLO11s 0.72 mAP vs nano 0.63, ~62 live-check assertions, x402 v2 on Base Sepolia, RoboMarketPolicy.sol on BSC Testnet.
- The local server has no ANTHROPIC_API_KEY, so a live mission can't be planned; the mission is replayed from plan data scored by the repo's own quote/selection code.
