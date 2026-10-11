---
format: 1920x1080
duration: 114s
message: "rBazaar lets any robot's agent find the exact model weights a task needs, then pay for them per call in AUSD, safely, on its own."
arc: Future Pacing (imagine → name product → remove pain → mechanism → live demo → tech proof → hard problems solved → brand)
audience: B@B Hacks 2.0 judges (Technical / Creative, Agora AUSD, YZi Labs)
mode: autonomous
music: none
captions: skipped (on-screen kinetic type already carries every key phrase; frames are dense with real UI; no word timestamps from local TTS)
---

## Video direction

- **Palette (frame.md roles):** every frame paints its OWN full-bleed background clip: canvas `#F4F2EC` + `assets/dawn-hill.jpg` at ~28% opacity (cover, slight blur 2px) + 2–3 very large blurred color blooms (rose `#E8B9C4`, sky `#CFE0EA`, mint `#DCEBE1`, blur ≥120px, opacity 0.35–0.55) that drift a few dozen px across the frame on ONE finite tween. Ink `#1C1D18` text, muted `#63665D`, sage `#3F7D5C` the only strong accent (buttons, selected states, prices, check marks), sage-dark `#2A543D` for pressed/deep. Alert `#C8553D` ONLY in Frames 8 & 13 (risk / bug states). Peach `#E7A977` for "uncertain/pending". BNB yellow `#F0B90B` only on the BNB chip (F11, F15). Base blue `#0052FF` only on Base Sepolia chips (F9, F10, F15).
- **Type:** Instrument Serif 400 for every headline / number (italic for ONE emphasized word per headline, in sage). Inter for body, chips, labels (labels = small uppercase tracked, faint). Mono (`JetBrains Mono, ui-monospace, Menlo`) only for code/headers/addresses. Fonts are local: `assets/fonts/instrument-serif-latin-400-normal.woff2`, `…-italic.woff2`, `assets/fonts/inter-latin-wght-normal.woff2` — declare with @font-face in each frame.
- **Surfaces:** frosted glass cards (white 62% + backdrop blur 24px, 1px white-70% border, radius 28px, soft long shadow `0 1px 2px rgba(28,29,24,.03), 0 24px 80px -24px rgba(28,29,24,.18)`). Real UI screenshots sit inside a glass "app window" plate (radius 22px, 1px hairline, long soft shadow) — never raw full-bleed.
- **Motion grammar — AIRY + BOUNCY (the user explicitly asked for "cool bouncy/airy animations", so the playful-overshoot exception is sanctioned for this film):** small things (chips, pills, coins, icons, badges, nodes, cards ≤ 500px) enter with a soft spring settle — gentle overshoot (`back.out(1.5)`-class, never elastic, never > ~8% overshoot) from y+40..70 / scale .86–.92 with opacity 0→1, staggered 0.07–0.12s. Large things (UI plates, headlines, full panels) enter on long-tail `power3`/`expo.out` settles (smooth, no overshoot). Hero cards may take ONE finite float drift (4–6px, over the hold) — this is the "airy" feel; never `repeat`/`yoyo`, never everything floating at once (screensaver). Exits are the harness transitions; only Frame 15 has its own exit.
- **Reveal model:** VO-paced. At t=0 only what the VO is saying is on screen; every further element reveals on its spoken cue (cue times are given per Scene). Back half of each frame keeps receiving reveals; final window holds.
- **Rhythm / held beats:** F3 (lockup breather), end of F9 ("Mug delivered" hold), F15 (end card). Everything else develops to the VO.
- **Keep content in the top ~83%** where practical (no captions, but keep bottom calm).
- **Negative list:** no dark backgrounds, no neon / purple-blue "AI" gradients, no stock robot clipart (robots are line-drawn in sage + glass or real 3D footage), no fake browser chrome beyond a minimal glass window, no front-load-then-freeze (slideshow), no everything-floating (screensaver), no lazy breathing loops, no back-half slow pans on held text, no `Math.random`/`Date.now`, no CSS transitions/keyframes for motion, no invented numbers (use only frame.md § Numerals).

## Frame 1 — A body, not a brain

- scene: Kinetic serif type on the dawn backdrop: "Your robot has a body." then a line-drawn robot arm self-draws; the job token cycles (spot a person · grip an avocado · read a label) and lands on "needs a new brain."
- voiceover: "Your robot has a body. Every new job needs a new brain."
- duration: 4.112s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- type: hook
- persuasion: Pain validation through contrast (hardware is done; intelligence per task is the bottleneck)
- beat: curiosity + tension
- blueprint: kinetic-type-beats (Adapt)
- focal: inline SVG robot arm (line art)
- roles: dawn-hill = background (dim ~28%)
- sfx: pop, pop, pop, sparkle
- asset_candidates: assets/dawn-hill.jpg — misty dawn backdrop

Adapt: keep the in-place token swap as the signature; add a self-drawing robot-arm line illustration as the non-text beat.
Scene 1 (0.0–1.5s): backdrop + blooms already present. Headline "Your robot has a *body*." (display, ink, "body" italic sage) assembles per-word (`dynamic-content-sequencing`) left-of-center, upper third. At the same time a minimal 6-axis robot arm (sage 4px strokes, rounded joints as small frosted-glass circles, base on a short line "bench") self-draws on the right half (`svg-path-draw`), ~45% of frame height. Asymmetric 55/45, 3 depth layers.
Scene 2 (1.5–2.7s): headline lifts and shrinks up-left; new line "Every new job…" appears beneath with an in-place token pill (glass pill, sage text) cycling by hard cut `spot a person` → `grip an avocado` → `read a label` (`discrete-text-sequence`), one pop per token; a tiny matching icon (person / avocado / label) springs onto the arm's gripper per token.
Scene 3 (2.7–4.1s): the line resolves to "needs a new *brain*." (display, "brain" italic sage, spring-pop on the word); a small glowing frosted orb (sage core) drops onto the arm's wrist with an ambient glow bloom (`ambient-glow-bloom`). Hold still (arm does ONE subtle wrist tilt).

narrativeRole: open on the real bottleneck in robotics — per-task intelligence — in outcome language.
keyMessage: robots need new skills per job.

## Frame 2 — Which one fits?

- scene: Glass model cards pile in around a small robot glyph with question chips (fits my arm? my sensors? my budget?), then the clutter shoves to the edges and "And how does a robot pay?" builds center
- voiceover: "The models exist. But which one fits your arm, your sensors, your budget? And how does a robot pay?"
- duration: 6.395s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-problem.html
- type: pain_point
- persuasion: Pain agitation (choice overload + missing payment rail)
- beat: overwhelm
- blueprint: overwhelm-surround (Adapt — clutter-shove-to-question variant)
- focal: center robot glyph + model-card cloud
- roles: dawn-hill = background (dim ~28%)
- sfx: whoosh-short, pop, pop, pop, whoosh
- asset_candidates: assets/dawn-hill.jpg — backdrop

Adapt: use the clutter-shove-to-question resolution (no avatar morph): accumulation → push-in shoves clutter to the edges → two-part serif question builds in the opened center.
Scene 1 (0.0–1.3s) "The models exist.": a small frosted robot-arm glyph sits dead center; ~12 small glass model cards spring in scattered around it in 3 depth layers (far ones smaller + 3px blur): "YOLO11n", "YOLO11s", "Faster R-CNN", "SSD Lite", "OWL-ViT", "YOLO11 Pose", "YOLO11 Seg", "Grasp planner", "Force controller", "A* planner", "VLA policy", "ACT policy" — each card = tiny icon + name + a faint price line ("0.001 AUSD/call" style). Staggered spring pops by index, cluster→outward (`center-outward-expansion`).
Scene 2 (1.3–4.3s): question chips pop next to the robot as the VO names them — "fits my *arm*?" (1.4s), "my *sensors*?" (2.8s), "my *budget*?" (3.5s) — sage-outline glass pills with a "?" badge; meanwhile 6 more cards keep piling in from the edges, density rising (slow zoom-out underneath, `multi-phase-camera`).
Scene 3 (4.3–6.4s): push-in: all cards + chips shove outward to the frame edges with motion blur (`motion-blur-streak`), opening the center; serif question builds per-word "And how does a robot *pay*?" (display, "pay" italic sage) with a small coin glyph + "?" spring-popping after "pay". Hold.

narrativeRole: name the need — discovery + fit + payment for robot skills is unsolved.
keyMessage: fit and payment are the missing pieces.

## Frame 3 — Meet rBazaar

- scene: The green layers mark springs in, "rBazaar" letters cascade in Instrument Serif, tagline "where robots buy skills" rises
- voiceover: "Meet R-Bazaar, where robots buy skills."
- duration: 3.124s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/03-intro.html
- type: product_intro
- persuasion: Category creation
- beat: relief + intrigue
- blueprint: logo-assemble-lockup (Reproduce — parts-assembly into spring bloom)
- focal: assets/rbazaar-mark.svg
- roles: rbazaar-mark = cutout (hero); dawn-hill = background
- sfx: whoosh-cinematic, sparkle
- asset_candidates: assets/rbazaar-mark.svg — official logo mark; assets/dawn-hill.jpg — backdrop

Scene 1 (0.0–1.1s): clean stage. The mark builds: three stacked rounded layer-plates (the lucide Layers3 shape, white strokes) slide up one after another, then the green `#4C7E60` rounded square blooms behind them from scale 0 (spring settle) with an ambient glow; mark ~200px, left of center so the lockup centers.
Scene 2 (0.9–2.0s): "rBazaar" wordmark (display-hero, ink) cascades in letter-by-letter to the right of the mark; the "r" lands in italic sage.
Scene 3 (1.6–3.1s): tagline "where robots *buy skills*" (title-card, muted ink; "buy skills" sage) rises under the lockup on a power3 settle. Hold still — held breather beat.

narrativeRole: name the product right after the pain.
keyMessage: rBazaar = a marketplace where robots buy skills.

## Frame 4 — Scout does the shopping

- scene: Constellation around the Scout orb: Robot Card + schematic on the left, goal → skill nodes on top, producer listings on the right with AUSD coins flowing, a bounty card + producer reply at the bottom
- voiceover: "Scout, your robot's agent, reads its specs and schematics, splits your goal into skills, and buys them from producers. Nothing fits? It posts a bounty."
- duration: 10.192s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-scout.html
- type: product_intro
- persuasion: Mechanism reveal (agent does discovery + fit + payment + requests)
- beat: clarity + aspiration
- blueprint: constellation-hub (Adapt)
- focal: Scout orb (hub)
- roles: ui2x-bounties-cards = supporting (crop of the "Gentle grasp for ripe avocados" bounty card with its producer submission — in the 3840x2160 image the card spans ~x 2160–3270, y 120–1210; scale it down into a glass card); dawn-hill = background
- sfx: pop, whoosh-short, pop, ping, ping, ping, notification
- asset_candidates: assets/ui2x-bounties-cards.jpg — real bounty cards with producer submissions; assets/dawn-hill.jpg — backdrop

Adapt: keep nodes springing into a ring around a held hub; nodes arrive in VO groups and payments animate along the connectors.
Scene 1 (0.0–1.6s) "Scout, your robot's agent": center hub = frosted glass sphere (~220px) with a sage glowing core and a tiny layers glyph; label "Scout" (title-card) + "your robot's buying agent" (body, muted) under it. Spring in + glow bloom.
Scene 2 (1.6–3.6s) "reads its specs and schematics": LEFT node: "Robot Card" glass card slides in from the left — rows: 6-axis arm · parallel jaw · rgb · depth · wrist_force · 1.5 kg payload · Jetson Orin; plus a small "schematic.pdf" file chip tucked behind it. A scan-line sweeps the card, then an SVG connector draws to the hub (`svg-path-draw`).
Scene 3 (3.6–5.3s) "splits your goal into skills": TOP: goal pill "Pick up the red mug" pops, then splits into three skill pills — detect · grasp · place — connected hub→goal by drawn lines.
Scene 4 (5.3–7.4s) "and buys them from producers": RIGHT: three producer listing cards spring in staggered (styled like the real marketplace cards: category label, serif name, "by vendor", serif price + "AUSD / call"): "Penny Detector · by budget bots · 0.001", "Feather Grip · by feathertouch · 0.009", "A* Route Planner · by navigation lab · 0.001". Then three small sage AUSD coins (circle with "A") travel hub→each card along the connectors, one ping each.
Scene 5 (7.4–10.2s) "Nothing fits? It posts a bounty.": BOTTOM: a flag icon pops with "Wanted" chip, then the real bounty card crop ("Gentle grasp for ripe avocados · $0.06 … Avocado Cradle Grasp by feathertouch · $0.007 / call") rises into a glass card; a small reply bubble "producer submitted ✓" springs off its corner (notification). Hold the full constellation (hub gets one finite float).

narrativeRole: explain the whole loop in one picture — robot info in, model out, transactions handled, bounties for gaps.
keyMessage: an agent that shops, pays, and requests skills for your robot.

## Frame 5 — A real marketplace

- scene: Real Marketplace screenshot on a tilted glass plate scrolling, oversized count-ups 1,179 listings · 22 vendors · 38 capabilities, then model chips with benchmark numbers
- voiceover: "Nearly twelve hundred listings. Twenty-two vendors. Real, benchmarked models."
- duration: 5.492s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/05-marketplace.html
- type: social_proof
- persuasion: Statistical proof
- beat: confidence
- blueprint: dataviz-countup (Adapt — Product_Intro scroll-to-hero)
- focal: assets/ui2x-marketplace-full.jpg
- roles: ui2x-marketplace-full = supporting plate (tilted, right 60%); ui2x-marketplace = fallback; dawn-hill = background
- sfx: whoosh, pop, pop
- asset_candidates: assets/ui2x-marketplace.jpg — real marketplace grid; assets/ui2x-marketplace-full.jpg — full page plate for scroll

Adapt: the tilted card plane is the REAL marketplace screenshot; the stats are the hero metrics; keep the hands-off scroll + bookend push.
Scene 1 (0.0–1.8s) "Nearly twelve hundred listings": the marketplace plate rises from below into a 3D tilt (rotateX ~16°, rotateY ~-10°) on the right ~60% of frame and slowly scrolls its content (`3d-page-scroll`); on the left, "1,179" (stat-figure, ink) counts up 0→1,179 (`counting-dynamic-scale`) with label "listings" (label style).
Scene 2 (1.8–3.0s) "Twenty-two vendors": "22" vendors counts up beneath (smaller serif), then "38 capabilities" pops beside it.
Scene 3 (3.0–5.5s) "Real, benchmarked models": the plate tilts toward flat (tilt-to-flatten) with a gentle push that eases back; a row of glass chips springs in along the lower-left: "YOLO11s · 0.72 mAP", "YOLO11n · 0.63 mAP", "Faster R-CNN", "OWL-ViT · open vocab", "benchmarked on COCO". Hold.

narrativeRole: prove the marketplace is real and deep before the demo.
keyMessage: breadth is real, not a mock.

## Frame 6 — Demo: just ask

- scene: Real rBazaar composer — the mission types live into the glass prompt box, then the green send button presses
- voiceover: "Watch. Pick up the red mug, set it on the tray, and slow down if someone walks in."
- duration: 6.507s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/06-demo-ask.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: anticipation
- blueprint: prompt-type-submit-generate (Reproduce — composer types, ends on submit)
- focal: assets/ui2x-home.jpg
- roles: ui2x-home = hero UI plate (full frame inside a glass window); ui2x-home-typed = reference for the exact typed line-wrap/position (use as the final-state check)
- sfx: whoosh-short, typing, click
- asset_candidates: assets/ui2x-home.jpg — real composer; assets/ui2x-home-typed.jpg — composer with the mission typed

Coordinates (CSS px of the 1920x1080 app; images are 2x): composer glass box x 741–1401, y 366–512; placeholder text baseline starts at x 764, y 399 (Inter ~15px, color #9a9c94); typed text in the real UI wraps after "…Slow down if a person" onto line 2 "walks into the cell." (see ui2x-home-typed.jpg, line-height ~22px); send button center (1370, 481), 34px, sage.
Scene 1 (0.0–0.8s) "Watch.": glass app window holding ui2x-home.jpg settles in from scale .94 (power3) filling ~92% of frame; a small "LIVE DEMO" chip (sage dot + label) pops top-left of the window.
Scene 2 (0.8–4.9s): camera zooms to the composer (`coordinate-target-zoom`, ~1.7x, composer centered); a cream patch hides the placeholder, and the mission types character-by-character in the UI's own Inter at matching size/position with a blinking caret (`discrete-text-sequence` + `context-sensitive-cursor`): "Pick up the red mug on the cluttered workbench and set it on the tray. Slow down if a person walks into the cell." — typing completes by ~4.7s; the send button turns from grey to sage the moment text exists.
Scene 3 (4.9–6.5s): a soft custom cursor arrives at the send button and presses it (`press-release-spring` + `cursor-click-ripple`); the button shows a spinner glyph; hold.

narrativeRole: start the live demo with a plain-language goal.
keyMessage: you just describe the outcome.

## Frame 7 — Demo: skill graph + scoring

- scene: The real mission page: the 6-shard execution plan cascades in, then the provider comparison panel — selected card glows, excluded providers struck with reasons; criteria pills price · speed · quality · risk
- voiceover: "Claude builds a skill graph. Scout scores every listing on price, speed, quality and risk, and drops anything this robot can't run."
- duration: 9.539s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-demo-plan.html
- type: feature_showcase
- persuasion: Authority through transparency (explainable selection)
- beat: control
- blueprint: agent-progress-theater (Adapt)
- focal: assets/mission-execplan.jpg
- roles: mission-execplan = hero UI plate (Scenes 1–2); mission-providers = hero UI plate (Scene 3, the provider column close-up); mission-planned = optional brief establishing flash
- sfx: click-soft, pop, pop, pop, pop, error, chime
- asset_candidates: assets/mission-execplan.jpg — real execution plan + provider comparison; assets/mission-providers.jpg — provider comparison close-up; assets/mission-planned.jpg — mission page header

Adapt: trigger = the plan arriving; working theater = status chip "Claude · decomposing" → "6 skills"; receipt = the real plan rows revealing + the scored provider list with check/strike.
Coordinates (CSS px of 1920x1080; images are 2x): mission-execplan.jpg — left plan column x 503–921; rows: 01 y 90–189, 02 y 221–322, 03 y 351–452, 04 y 481–583, 05 y 612–713, 06 y 742–843; "Run simulation" bar y 863–902; right provider panel x 968–1638, summary banner y 322–368, Selected card y 400–548. mission-providers.jpg — Selected card x 968–1617, y 189–340; Alternative cards y 356–506 and y 520–670; Excluded "Clutter Scout R-CNN" y 683–817, "Warehouse Watch" y 831–965, "Penny Detector" y 979–1080.
Scene 1 (0.0–1.8s) "Claude builds a skill graph": glass window with mission-execplan.jpg (provider panel masked/dimmed at first); a status chip "Claude · building skill graph" with a spinning loader pops above the window; the six plan rows reveal top→bottom via clip-mask wipes, staggered (`dynamic-content-sequencing`), each row with a soft pop; chip flips to "✓ 6 skills · 1 bounty".
Scene 2 (1.8–5.6s) "scores every listing on price, speed, quality and risk": camera glides right onto the provider panel (`viewport-change`) as it undims; four glass criteria pills spring in across the top as each word is spoken — "price" (2.6s), "speed" (3.3s), "quality" (3.9s), "risk" (4.5s); a sage glow ring draws around the Selected card and its score "0.277" gets a keyword glow (`asr-keyword-glow`).
Scene 3 (5.6–9.5s) "and drops anything this robot can't run": crossfade the plate to mission-providers.jpg (aligned so the Selected card doesn't jump); the three Excluded cards each get an alert-red strike line drawn across (`svg-path-draw`) + a red "✕ excluded" pill pop, staggered; reason chips float out beside them: "different execution mode", "object class unsupported"; final stamp chip "16 providers scored · 1 selected" springs bottom-right. Hold.

narrativeRole: show the intelligence: decomposition + explainable, constraint-aware selection.
keyMessage: Scout picks the right model for THIS robot.

## Frame 8 — Demo: risk spikes, Scout upgrades

- scene: Real 3D workcell footage; a person alert slides in; risk gauge sweeps 0.07 → 0.74; Pedestrian Guard Lite (0.004) vs Pro (0.020) split-tilt cards; Pro gets "Selected"
- voiceover: "A person steps in. Risk spikes, so Scout upgrades on the fly, to the sharper two-cent detector."
- duration: 6.659s
- transition_in: crossfade
- status: animated
- src: compositions/frames/08-demo-risk.html
- type: feature_showcase
- persuasion: Risk reversal (safety scales with stakes)
- beat: tension → relief
- blueprint: comparison-split (Adapt)
- focal: assets/ui2x-market-pedestrian.jpg
- roles: rec-mission-viewport = supporting footage — a PRE-CROPPED 1698x688 (2.47:1), 8.0s, silent clip of the real live 3D workcell (arm approaches, grasps, lifts the red mug). Declare it as an approved frame video: `<video data-frame-video="approved" src="assets/rec-mission-viewport.mp4" muted data-start="0.15" data-duration="6.4" data-track-index="..." data-frame-video-x="110" data-frame-video-y="150" data-frame-video-width="1000" data-frame-video-height="405" data-frame-video-fit="cover">`. The assembler hoists it to the host root as a STATIC rect that renders ABOVE frame content: never animate it, never place anything over that rect; draw its glass window plate (radius 22, border, shadow) as a frame element 10px larger on every side behind it; overlays may only touch the plate border outside the rect; ui2x-market-pedestrian = the two cards (crop from the 2x image; CSS coords ×2 = image px: Lite card COLLAPSED at CSS x 503–871, y 304–557 → image x 1006–1742, y 608–1114; Pro card EXPANDED with its details "Robots 6dof arm, mobile base · Sensors rgb · Objects person · Quality 79% measured benchmark" at CSS x 887–1255, y 302–732 → image x 1774–2510, y 604–1464). Show the Lite card at the same width as Pro; its shorter height is fine (align tops); dawn-hill = background
- sfx: notification, riser, impact-bass-1, pop, chime
- asset_candidates: assets/ui2x-market-pedestrian.jpg — real Pedestrian Guard Lite vs Pro listings; assets/rec-mission-viewport.mp4 — real live 3D workcell clip

Adapt: keep the two cards entering from opposite wings with mirrored rotateY tilts and the inner-edge badge pops; precede them with the risk event (footage + gauge).
Layout: static footage window top-left (video rect x 110–1110, y 150–555; plate behind it); risk gauge top-right (x ~1200–1800, y ~150–555); comparison zone across the lower band (y ~590–900, cards scaled so the Pro card's expanded details fit).
Scene 1 (0.0–1.2s) "A person steps in.": the window plate springs in and the live footage appears inside it (arm reaching for the red mug); a frosted person-silhouette badge (alert-red 3px outline, glass fill, ~150px) slides in from the right and docks on the plate's right border (touching the border, not the video); an alert chip "⚠ person in cell · 1.1 m" pops on the plate's top border (notification).
Scene 2 (1.2–2.0s) "Risk spikes": right side: a semicircular risk gauge springs in; needle + arc sweep from 0.07 to 0.74 while the arc color shifts sage → alert red and the number counts (`stat-bars-and-fills` / `counting-dynamic-scale`); impact on landing.
Scene 3 (2.0–3.6s) "so Scout upgrades on the fly": in the lower band, the two real listing cards arrive from opposite wings with mirrored book-open tilts (`split-tilt-cards`): left "Pedestrian Guard Lite · 0.004 AUSD · 114 ms", right "Pedestrian Guard Pro · 0.020 AUSD · 282 ms · 79% measured" (real crops), with a small "→ upgrade" arrow between them.
Scene 4 (3.6–6.7s) "to the sharper two-cent detector": the Lite card dims to 55% with a pill "was selected · below risk floor" at its inner edge; the Pro card gets a sage "✓ Selected · risk 0.74" pill pop at its inner edge (the one overshoot) + a sage glow ring; small chip under the gauge "arm speed capped". Hold.

narrativeRole: the wow moment — risk-aware model routing changes robot behavior and spend.
keyMessage: it spends more only when safety demands it.

## Frame 9 — Demo: paid, per call

- scene: Real Simulation-studio footage of the arm carrying the mug to the tray; AUSD coins fly from the robot wallet to vendors; receipts assemble; "Mug delivered" stamp
- voiceover: "Every call settles as a gasless A U S D micropayment, with an on-chain receipt. Mug delivered."
- duration: 7.792s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/09-demo-pay.html
- type: benefit_highlight
- persuasion: Friction reduction
- beat: triumph
- blueprint: grid-card-assemble (Adapt — accumulating receipt list)
- focal: assets/rec-studio-run.mp4
- roles: rec-studio-viewport = hero footage — a PRE-CROPPED 1480x828 (1.787:1), 7.6s, silent clip of the real Simulation-studio LIVE SIMULATOR: the arm carries the red mug and sets it on the tray (release visible at ~5.7s into the clip). Declare it as an approved frame video: `<video data-frame-video="approved" src="assets/rec-studio-viewport.mp4" muted data-start="0.1" data-duration="7.6" data-track-index="..." data-frame-video-x="100" data-frame-video-y="170" data-frame-video-width="1000" data-frame-video-height="560" data-frame-video-fit="cover">`. The assembler hoists it to the host root as a STATIC rect that renders ABOVE frame content: never animate it, never place anything over that rect; draw its glass window plate as a frame element 10px larger on every side behind it; stamps/overlays may only sit on the plate border or outside the rect; ui2x-wallet = supporting (crop ONLY the "Spending allowance" block — CSS x 520–790, y 425–530 → image x 1040–1580, y 850–1060: "Per purchase 0.050 AUSD · Per mission 0.100 AUSD · Session remaining 5.000 AUSD"; never show the "Wallet setup needed" notice below it)
- sfx: ping, ping, ping, pop, pop, pop, sparkle
- asset_candidates: assets/rec-studio-viewport.mp4 — real Simulation studio live simulator clip; assets/ui2x-wallet.jpg — real wallet + spending allowance

Adapt: the accumulating list is the receipt ledger; the live footage is the proof running alongside.
Scene 1 (0.0–3.0s) "Every call settles as a gasless AUSD micropayment": left ~55%: glass window with the live footage (arm carrying the red mug). Right: a "Scout wallet · Base Sepolia" glass chip at top; three sage AUSD coins hop (spring arcs) from the wallet chip to three vendor chips ("Scene Object Locator Lite", "Simulated Grasp Planner Lite", "Object Placement Lite") one after another (ping each); tag chip "gasless · ERC-3009 · robot holds 0 ETH" pops.
Scene 2 (3.0–5.0s) "with an on-chain receipt": receipt rows assemble in a vertical list under the wallet (`grid-card-assemble`), each glass row: amount "0.0006 AUSD" (serif) · vendor · "settled ✓" sage pill · link chips "Base tx ↗" (Base-blue dot) and "BNB audit ↗" (BNB-yellow dot); 4 rows, staggered pops.
Scene 3 (5.0–7.8s) "Mug delivered.": as the footage shows the mug released on the tray, a big sage check stamp "Mug delivered ✓" springs in directly BELOW the footage window (y ~760–880, left-aligned with it, never over the video rect) (sparkle); a small summary chip "mission spend 0.003 / 1.00" settles under the list. Hold (held beat).

narrativeRole: close the demo loop — payment, receipts, task done.
keyMessage: autonomous, metered, auditable spending.

## Frame 10 — x402 + AUSD

- scene: Stations on a wide canvas panned by one camera: x402 × AUSD title → model answers "402 Payment Required" → robot signs ERC-3009 transferWithAuthorization → facilitator settles on Base Sepolia → PAYMENT-RESPONSE + inference result; a packet travels the connector
- voiceover: "Under the hood: x four-oh-two with Agora's A U S D. The model answers payment required, the robot signs a gasless transfer, we settle on Base, and inference runs."
- duration: 12.005s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/10-x402.html
- type: feature_showcase
- persuasion: Technical authority
- beat: awe
- blueprint: spatial-pan-stations (Reproduce)
- focal: the "402" station
- roles: dawn-hill = background
- sfx: whoosh-cinematic, impact-bass-2, typing, chime, sparkle
- asset_candidates: none — diagram

Canvas: one oversized horizontal world (~4 frames wide) with 5 stations joined by a thin sage connector line; a sage packet dot travels the line between stations as the camera pans (`viewport-change`), each pan a long-tail glide.
Scene 1 (0.0–1.0s) "Under the hood": Station 0 centered: label "UNDER THE HOOD" then serif "x402 × *AUSD*".
Scene 2 (1.0–3.4s) "x four-oh-two with Agora's AUSD": beneath the title an "Agora AUSD" glass chip (sage coin "A") springs in with sub-line "fully reserved digital dollar · 6 decimals" and a mono chip "0xa901…22dC · Base Sepolia (84532)"; a second chip "x402 v2 · exact scheme".
Scene 3 (3.4–5.6s) "The model answers payment required": pan to Station 1 — a glass "model endpoint" card (`POST /inference`) and a giant serif "402" slamming in (impact) with "Payment Required" beneath, plus a mono header chip `PAYMENT-REQUIRED: exact · AUSD · 0.0006`.
Scene 4 (5.6–7.8s) "the robot signs a gasless transfer": pan to Station 2 — robot-wallet card; a mono code card types (`discrete-text-sequence`): `transferWithAuthorization(from: robot, to: vendor, value: 600, validBefore, nonce)` and a pill "ERC-3009 · gasless"; header chip `PAYMENT-SIGNATURE`.
Scene 5 (7.8–9.2s) "we settle on Base": pan to Station 3 — "facilitator" card with a Base-blue chip "Base Sepolia"; a sage check springs; sub-chips "facilitator pays gas", "robot holds 0 ETH".
Scene 6 (9.2–12.0s) "and inference runs": pan to Station 4 — `PAYMENT-RESPONSE` chip, then an "inference ✓" result card (bbox icon over a tiny red-mug glyph, "detections returned"); then the camera pulls back to show all five stations on the line at once (bookend). Hold.

narrativeRole: Agora track proof — real x402 v2 + gasless AUSD.
keyMessage: pay-per-request stablecoin rails, implemented for real.

## Frame 11 — BNB Chain allowance

- scene: Floating glass contract window "RoboMarketPolicy.sol · BSC Testnet": caps rows count up, 13 vendor-allowlist chips flow in, a signature passes the check() gate, record() drops a receipt into a ledger; custody strip owner → mission float → vendors
- voiceover: "For Y-Z-i Labs, the robot's allowance lives on BNB Chain: spend caps and a vendor allowlist, checked before every signature."
- duration: 9.595s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/11-bnb.html
- type: feature_showcase
- persuasion: Trust by verifiability (tamper-evident spending rules)
- beat: confidence + control
- blueprint: device-surface-showcase (Adapt — floating-window hero, cursorless stepwise flow)
- focal: contract window (reconstructed UI)
- roles: dawn-hill = background
- sfx: whoosh, pop, pop, pop, click, chime
- asset_candidates: none — contract UI reconstruction

Adapt: the "device" is a floating glass contract window; its panel advances through caps → allowlist → check/record.
Scene 1 (0.0–1.2s) "For YZi Labs": top-left chip row springs in: "YZi Labs track" (glass) + BNB chip (BNB-yellow dot) "BNB Chain · BSC Testnet (97)".
Scene 2 (1.2–3.6s) "the robot's allowance lives on BNB Chain": a large floating glass window rises with a 3D tilt that settles flat (power3): title bar "RoboMarketPolicy.sol" (mono) + "deployed · BSC Testnet" pill; left rail lists functions `check()` `record()` `setPolicy()`; main panel header "Robot allowance · robot_001".
Scene 3 (3.6–4.6s) "spend caps": three cap rows populate with count-ups (serif numbers + "AUSD"): "per call 0.05", "per mission 0.10", "per day 5.00".
Scene 4 (4.6–6.2s) "and a vendor allowlist": 13 small mono hash chips (`0x3f1a…`, `0x9be2…` style abbreviated keccak hashes, index-derived) flow into a wrap grid + label "13 vendors allow-listed".
Scene 5 (6.2–9.6s) "checked before every signature": below the window a "signature request · 0.0006 AUSD" card slides toward a gate labelled `check()`; the gate flashes sage and stamps "✓ approved"; then a small receipt chip drops into a ledger stack labelled `record() · receipts`; a custody strip settles under everything: "Owner treasury → Mission float (0.10) → Vendor payout addresses" with arrows drawing. Hold.

narrativeRole: YZi Labs track proof — trusted agent spending with tamper-evident logs.
keyMessage: the agent's spending rules are on-chain.

## Frame 12 — Numbers that hold up

- scene: Two bars race (matcher 75% vs keyword 40%), then a giant "62" live checks count-up with a checklist cascade; small YOLO11 mAP chip
- voiceover: "Our matcher beats keyword search, seventy-five to forty. Sixty-two live checks guard every payment."
- duration: 6.943s
- transition_in: crossfade
- status: animated
- src: compositions/frames/12-numbers.html
- type: feature_showcase
- persuasion: Statistical proof
- beat: confidence
- blueprint: dataviz-countup (Adapt — Key_Feature montage, light surface)
- focal: the "62" figure
- roles: dawn-hill = background
- sfx: whoosh-short, riser, impact-bass-2, pop
- asset_candidates: none — data viz

Adapt: keep the montage structure (instrument beats + one zoom punch) on the light glass system.
Scene 1 (0.0–1.6s) "Our matcher beats keyword search": label "MATCHING MODEL · TF-IDF + LOGISTIC REGRESSION"; two horizontal glass bar tracks appear, labeled "rBazaar matcher" and "keyword search".
Scene 2 (1.6–3.4s) "seventy-five to forty": bars fill (`stat-bars-and-fills`) — sage to 75%, grey to 40% — with serif counters counting 0→75% / 0→40%; caption "top-1 on unseen phrasings".
Scene 3 (3.4–6.9s) "Sixty-two live checks guard every payment": one zoom punch to a giant serif "62" counting up (`counting-dynamic-scale`) with "live on-chain checks" under it; a checklist cascades on the right with sage checks: Replay · Allowance limits · Concurrency · x402 protocol · Reconciliation · Accounting (no AUSD created or lost); small chip bottom-left "YOLO11s 0.72 mAP · YOLO11n 0.63". Hold.

narrativeRole: technical-impressiveness proof with measured numbers.
keyMessage: measured, tested, not hand-waved.

## Frame 13 — What broke

- scene: "What broke?" then three bug→fix glass cards assemble in a triptych; each flips from alert-red bug state to sage fix state
- voiceover: "What broke? Parallel payments collided, so they now settle in order. The SDK rejected A U S D until we allow-listed it. Laggy nodes showed stale balances, so we wait for confirmations."
- duration: 13.52s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/13-broke.html
- type: feature_showcase
- persuasion: Credibility through candor
- beat: grit → competence
- blueprint: grid-card-assemble (Adapt — triptych of flip cards)
- focal: the three bug→fix cards
- roles: dawn-hill = background
- sfx: glitch-1, chime, error, chime, glitch-2, chime
- asset_candidates: none

Adapt: the grid is a triptych; each tile carries its own bug→fix micro-animation, revealed on its VO cue.
Scene 1 (0.0–0.9s) "What broke?": serif "What *broke*?" (display, "broke" italic alert-red) springs in center, then glides to the top-left as the section title.
Scene 2 (0.9–4.4s): Card 1 rises (left third). Bug state (0.9–2.6): header "nonce collisions" with three tx packets (small glass pills "tx") converging and shaking with a red flash (glitch). Fix state (2.6–4.4): card flips (rotateY) to sage side: "settle one at a time" — the packets line up in a neat queue and slide through a gate one by one; ✓.
Scene 3 (4.6–7.9s): Card 2 rises (middle). Bug: mono error chip `x402: asset not allowed (AUSD)` with a red ✕. Fix (6.4s): flips to "explicit asset allowlist · cap = per-call limit" ✓ with a sage AUSD coin sliding into an "allowed" slot.
Scene 4 (8.1–13.5s): Card 3 rises (right). Bug: balance readout flickering "0.000 AUSD" vs "0.100 AUSD" between two RPC node icons (red). Fix (10.2s): flips to "wait 2 confirmations + poll" ✓ — two confirmation ticks fill, balance settles at 0.100. Hold all three.

narrativeRole: show engineering depth through the real problems hit.
keyMessage: we hit real-chain problems and solved them.

## Frame 14 — Never pay twice

- scene: A payment packet freezes mid-flight → tag "uncertain" → a magnifier scans chain blocks (authorizationState, 200-block windows) → resolves to "settled" with recovered tx; then a shield stamps "never pays twice"
- voiceover: "A payment that dies mid-flight is reconciled from the chain, so robots never pay twice."
- duration: 6.36s
- transition_in: crossfade
- status: animated
- src: compositions/frames/14-reconcile.html
- type: feature_showcase
- persuasion: Risk reversal
- beat: relief + confidence
- blueprint: agent-progress-theater (Adapt)
- focal: the payment packet + status chip
- roles: dawn-hill = background
- sfx: glitch-3, whoosh-short, chime, impact-bass-1
- asset_candidates: none

Adapt: trigger = the frozen payment; working theater = chain scan with status swaps; receipt = settled ✓ + shield.
Scene 1 (0.0–1.8s) "A payment that dies mid-flight": a glass payment packet ("0.0006 AUSD → vendor") flies left→right along a dotted path and freezes halfway with a small crack glyph; status chip flips to peach "uncertain · allowance held".
Scene 2 (1.8–3.6s) "is reconciled from the chain": a row of chain-block tiles slides in beneath; a magnifier glass sweeps across them in windows (a bracket labelled "200-block window" steps along); mono chip `authorizationState(robot, nonce) → used`; status chip swaps peach → sage "settled ✓ · tx recovered".
Scene 3 (3.6–6.4s) "so robots never pay twice": the packet completes its flight; a sage shield badge springs center with "never pays twice" (title-card) and a small "no double spend · no lost receipt" line. Hold.

narrativeRole: finish the challenges beat with the hardest one solved.
keyMessage: robust by design.

## Frame 15 — rBazaar

- scene: Mark + wordmark lock up center; tagline "Skills for every robot, paid per call."; chip row Agora AUSD · x402 · BNB Chain · Base Sepolia · Claude; repo URL
- voiceover: "R-Bazaar. Skills for every robot, paid per call."
- duration: 5.349s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/15-outro.html
- type: branding
- persuasion: Brand recall
- beat: inevitability
- blueprint: logo-assemble-lockup (Reproduce — Brand_Outro)
- focal: assets/rbazaar-mark.svg
- roles: rbazaar-mark = cutout (hero); dawn-hill = background (can rise to ~40% here)
- sfx: whoosh-cinematic, sparkle
- asset_candidates: assets/rbazaar-mark.svg — logo mark

Scene 1 (0.0–1.0s) "R-Bazaar.": the mark draws on (layer strokes draw, green square blooms) and the "rBazaar" wordmark slides out beside it into a centered lockup (display-hero).
Scene 2 (1.0–3.3s) "Skills for every robot, paid per call.": tagline rises under the lockup: "Skills for every robot, paid *per call*." (headline, "per call" italic sage).
Scene 3 (3.3–5.35s): a chip row springs in under the tagline — "Agora AUSD" · "x402" · "BNB Chain" (yellow dot) · "Base Sepolia" (blue dot) · "Claude"; then "github.com/ryansgao/bab-hack" (mono, muted) fades up; final 0.5s everything softly fades to the cream canvas (the film's only real exit).

narrativeRole: brand lockup + where to find it.
keyMessage: remember rBazaar.
