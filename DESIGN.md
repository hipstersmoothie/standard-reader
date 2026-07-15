---
name: Standard Reader
description: A warm, calm, editorial reader and living directory for standard.site publications on the AT Protocol.
# Neutrals are authored in OKLCH (the app's canonical format) and are theme-aware
# via CSS light-dark(); values below are LIGHT mode, dark equivalents noted in prose.
# The camel accent is authored in hex + Display-P3. Stitch's linter warns on
# OKLCH (it validates hex sRGB only) — accepted here to preserve the real values.
colors:
  # Neutral — warm paper + warm ink ("Almanac" palette, APP_VISION.md §8)
  page-bg: "oklch(0.985 0.007 85)"
  surface-subtle: "oklch(0.965 0.01 84)"
  surface: "oklch(0.945 0.012 83)"
  surface-strong: "oklch(0.92 0.014 80)"
  border-subtle: "oklch(0.88 0.012 75)"
  border: "oklch(0.8 0.014 70)"
  ink-muted: "oklch(0.56 0.012 65)"
  ink: "oklch(0.245 0.012 60)"
  # Primary — earthen camel / tan-brown accent
  camel-solid: "#ad7f58"
  camel-text: "#815e46"
  camel-bg: "#fefdfc"
  camel-border: "#dcbc9f"
  # Semantic state — Radix Red / Green / Yellow (not overridden by the editorial theme)
  critical-solid: "#e5484d"
  critical-text: "#ce2c31"
  success-solid: "#30a46c"
  success-text: "#218358"
  warning-solid: "#ffe629"
  warning-text: "#9e6c00"
typography:
  display:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.25rem, 5vw, 3rem)"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  heading:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  reading:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  body:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, -apple-system, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, -apple-system, Arial, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  mono:
    fontFamily: "'Spline Sans Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "normal"
rounded:
  xs: "0.3rem"
  sm: "0.4rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1.35rem"
  full: "calc(infinity * 1px)"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  "2xl": "2rem"
  "3xl": "3rem"
components:
  button-primary:
    backgroundColor: "{colors.camel-solid}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "1.75rem"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "1.75rem"
  input:
    backgroundColor: "{colors.page-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
  card:
    backgroundColor: "{colors.page-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
---

# Design System: Standard Reader

## 1. Overview

**Creative North Star: "The Living Directory"**

Standard Reader is a warm, calm, editorial reader that is also a map of an entire network. The
interface holds two jobs in one calm frame: it is a comfortable place to read long-form writing,
and it is a curator confidently surfacing publications you don't follow yet. Every screen is
judged by whether it makes the writing easier to fall into — chrome, controls, and color earn
their place or are removed. The warmth is deliberate and physical: this is the **Almanac palette**
(APP_VISION.md §8) — warm paper and warm ink in light, warm night-reading surfaces in dark — with a
single earthen **camel** accent used as the one lamp of emphasis. The system whispers; the
writing speaks.

Crucially, the warmth is disciplined. The paper is a warm off-white authored in OKLCH at a whisper
of chroma (`C ≈ 0.007–0.014`, hue ~60–85) — genuinely warm, never a loud cream, sand, or
parchment. Type is a serif/sans split on a display-vs-running-text axis: **Newsreader**, an
optically-sized editorial serif, carries every heading and all reading content — article titles,
prose, publication names — while **Atkinson Hyperlegible Next**, a legibility-first humanist sans,
carries the running UI text, labels, buttons, counts, and metadata. Surfaces are flat at rest,
separated by warm tonal borders; depth appears only where something genuinely floats.

This system explicitly rejects the algorithmic social feed (no engagement-bait, no doomscroll
density), the cold gray-and-blue SaaS dashboard (no hero-metric card templates, no console chrome),
the cluttered old-RSS-reader (no toolbar walls, no tiny type, no triple-panel density), and the
trendy AI-startup landing aesthetic (no gradient text, no glassmorphism, no tracked eyebrows). It
is a reading room, not a control panel.

**Key Characteristics:**

- Warm paper + warm ink neutrals (the Almanac palette), theme-aware light/dark via `light-dark()`.
- Disciplined warmth: whisper-chroma OKLCH off-white, never pushed to loud cream/sand.
- One earthen camel accent (`#ad7f58`), used on ≤10% of any screen: actions, selection, state.
- Newsreader (serif) for headings + reading; Atkinson Hyperlegible Next (sans) for running UI text.
- Flat by default; warm tonal borders do the separating, shadows only lift true overlays.
- Squircle corners on interactive surfaces; radii stay modest (8–12px), never over-rounded.

## 2. Colors

A warm neutral field authored in OKLCH, a single earthen camel voice, and a conventional
semantic set for state. The neutrals and the accent are theme-aware through CSS `light-dark()`;
values below are light mode with the dark equivalent noted.

### Primary

- **Camel** (`#ad7f58` solid; link/accent text `#815e46` light / `#dbb594` dark): The single
  accent — a muted, earthen tan-brown. (The source `editorialPrimary` theme labels it "terracotta,"
  but the value reads as a soft camel/tan, not orange-red clay.) Used for primary action buttons, the
  current navigation selection, focus and active states, unread markers, and links. Never decoration.
  Its rarity is the entire point. On the warm paper, accent _text_ uses the deeper brown (`#815e46`)
  so links stay legible; the brighter `#ad7f58` is for solid fills and markers.

### Neutral (the Almanac paper + ink)

- **Ink** (`oklch(0.245 0.012 60)` light / `oklch(0.92 0.01 85)` dark): Primary text — headings,
  body, high-emphasis labels. A warm near-black, never pure `#000`.
- **Ink Muted** (`oklch(0.56 0.012 65)` light / `oklch(0.62 0.012 70)` dark): Secondary text —
  bylines, timestamps, captions, metadata. This is the muted floor; do not push muted text lighter.
- **Border** (`oklch(0.8 0.014 70)`) and **Border Subtle** (`oklch(0.88 0.012 75)`): The warm tonal
  dividers that separate flat surfaces in place of shadow.
- **Surface** (`oklch(0.945 0.012 83)`) and **Surface Subtle** (`oklch(0.965 0.01 84)`): Quiet
  raised fills — hover states, secondary buttons, chips, inset panels.
- **Page** (`oklch(0.985 0.007 85)` light / `oklch(0.16 0.012 60)` dark): The paper. A warm
  off-white in light, a warm dark reading surface in dark — both first-class.

### Semantic (Radix Red / Green / Yellow — unchanged by the editorial theme)

- **Critical** (`#e5484d`, text `#ce2c31`): Errors, destructive actions, failed states.
- **Success** (`#30a46c`, text `#218358`): Confirmation, completed, healthy.
- **Warning** (`#ffe629`, text `#9e6c00`): Caution. The yellow solid takes **black** text, not white.

### Named Rules

**The One Lamp Rule.** The camel accent appears on ≤10% of any given screen. If two things on a
screen are both camel, one of them is wrong. Emphasis beyond that is carried by weight, size,
and whitespace — not more color.

**The Disciplined Warmth Rule.** The paper is warm on purpose, but at a whisper of chroma
(`C ≈ 0.007–0.014`). The warmth is carried by the serif, the reading rhythm, and the earthen accent
— never by widening the background into a loud cream, sand, or parchment. Warm off-white, not
coffee stain.

## 3. Typography

**Display / Heading / Reading Font:** Newsreader (with Georgia, "Times New Roman", serif fallbacks)
**UI / Running-Text Font:** Atkinson Hyperlegible Next (with system-ui, -apple-system, Arial)
**Mono Font:** Spline Sans Mono (with SFMono-Regular, Menlo, monospace fallbacks)

**Character:** A true contrast-axis pairing — an optically-sized editorial serif against a
legibility-first humanist sans. Newsreader gives headings and content the warmth and authority of a
good magazine; Atkinson Hyperlegible Next, designed for maximum character disambiguation, keeps the
running interface quiet, accessible, and out of the way. Metric-adjusted Capsize fallbacks
(generated into `src/styles.css`) hold the layout so text doesn't shift as the web fonts load.

### Hierarchy

- **Display** (Newsreader, 400, `clamp(2.25rem, 5vw, 3rem)`, line-height 1.25, tracking -0.025em):
  Article titles and editorial headlines — the content voice at its largest.
- **Heading** (Newsreader, 500–600, 1.25rem → 3rem responsive by level, tracking -0.025em):
  All screen and section headings (h1–h5). Serif, not sans — the headings are editorial.
- **Reading** (Newsreader, 400, ~1.125rem, line-height 1.65): Long-form article prose. Capped at
  65–75ch measure so the eye never loses its place.
- **Body** (Atkinson Hyperlegible Next, 400, 1rem, line-height 1.65): Running interface text,
  descriptions, list-row copy.
- **Label** (Atkinson Hyperlegible Next, 600, 0.85rem, tracking -0.025em): Buttons, form labels,
  nav items, chips.
- **Mono** (Spline Sans Mono, 400–500, 0.85rem): Counts, dates, handles/DIDs, and code only —
  never body copy.

### Named Rules

**The Serif-Sans Split Rule.** Newsreader carries display, headings, and reading content (titles,
prose, publication names). Atkinson carries running UI text, labels, buttons, counts, and metadata.
If a heading renders in the sans, or a button renders in the serif, the split has been broken.

**The Legible-Floor Rule.** Body and reading text never drop below their tokened size for density's
sake, and muted text never goes lighter than Ink Muted (`oklch(0.56 0.012 65)`). Atkinson
Hyperlegible was chosen for exactly this reason — reading comfort is the product.

## 4. Elevation

Flat by default. Surfaces sit on the warm paper and are separated by tonal borders, not shadow.
Depth is reserved for things that genuinely float above the reading plane — popovers, dropdown
menus, dialogs, and the mobile app-shell overlays. At rest, the strongest a resting element gets is
a hairline `shadow.xs`; larger shadows are a response to elevation, never a decorative default. In
dark mode the shadow tokens are deliberately strengthened (via `editorialShadow`) so floating
surfaces stay legible against the dark reading ground.

### Shadow Vocabulary

- **Rest** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)` — `xs`): The most a resting surface earns —
  buttons, occasionally a raised card. Barely there.
- **Floating** (`shadow.lg`, stronger on dark): Popovers, menus, autocomplete panels — things
  detached from the flow.
- **Modal** (`shadow.xl`): Dialogs and sheets over a dimmed warm backdrop
  (`overlayBackdrop` is a warm-tinted translucent, not neutral black).

### Named Rules

**The Float-To-Earn Rule.** A surface gets a shadow only when it literally floats above another
layer. If it lives in the page flow, it is flat and bordered. A resting card with a soft 16px+ drop
shadow is prohibited — that is the 2014-app tell.

## 5. Components

Built on the vendored **hip-ui** design system (copy-and-own, react-aria) styled with StyleX
tokens, re-themed with the editorial `createTheme` palette. Every interactive component ships the
full state set — default, hover, focus-visible, active, disabled, and where relevant loading and
error — because they are wired through react-aria. The overall feel is **refined and restrained**:
quiet and low-contrast at rest, precise on interaction, receding so the reading leads.

### Buttons

- **Shape:** Squircle corners at 8px (`rounded.md`, `corner-shape: squircle`), 1px border.
- **Primary:** Camel solid fill (`#ad7f58`) with contrast text; the one high-emphasis action
  per view. Small size is 1.75rem tall with `0.75rem` horizontal padding.
- **Secondary / Ghost:** Surface fill (`oklch(0.945 0.012 83)`) or transparent with Ink text and a
  tonal border; the default for everything that isn't the one primary action.
- **Hover / Focus:** Fast (`~120ms`) `ease-in-out` transition on background and text color only —
  no transform, no bounce. Focus-visible shows a camel ring. Disabled drops to 50% opacity.

### Inputs / Fields

- **Style:** Page-background fill, 1px tonal border, 8px squircle corners, Atkinson body text.
- **Focus:** Border shifts to camel with a matching focus ring; no glow, no scale.
- **Error:** Border and helper text shift to Critical red (`#e5484d` / `#ce2c31`).
- **Placeholder:** Uses Ink Muted, never a lighter gray — placeholders must stay legible.

### Chips / Tags

- **Style:** Full-pill (`rounded.full`), Surface fill, Ink Muted label; topic and filter tags.
- **State:** Selected filters take the camel accent (text or subtle camel background);
  unselected stay neutral. Reserve the pill radius for tags and toggles, not cards.

### Cards / Containers

- **Corner Style:** 12px (`rounded.lg`), squircle where supported.
- **Background:** Page or Surface Subtle; **Border:** hairline warm tonal border.
- **Shadow Strategy:** Flat at rest (see Elevation). No resting drop shadow.
- **Internal Padding:** 1rem baseline (`lg`), scaling up for featured/lead cards.
- Cards are used only where they are the right affordance (a discrete publication or article
  object). Article and feed _rows_ are the default list unit — not a wall of identical cards.

### Navigation

- **Desktop:** Persistent left sidebar — Home, Latest, Saved, Discover, Search, plus the followed-
  publications list. Atkinson labels; current item marked with the camel accent.
- **Mobile:** Top bar + bottom tab nav. Same items, same components, restructured — responsive
  behavior is structural (nav relocates), never fluid-shrinking type.
- **States:** Default (Ink Muted), hover (Ink + Surface), active/current (camel).

### Signature: The Discover Directory & Editorial Rows

The differentiator surface. A browsable directory of every known publication with recommendations,
trending, and topic browsing — presented with real editorial care (Newsreader publication names,
lead/featured treatments, "You might follow" rails), never as a flat utilitarian list. Article and
publication rows pair a Newsreader title with Atkinson metadata (byline, timestamp, source) and a
restrained camel affordance for save/follow — the recurring atom of the reading experience.

## 6. Do's and Don'ts

### Do:

- **Do** carry warmth through Newsreader, reading rhythm, generous margins, and the earthen accent —
  the background stays a whisper-chroma warm off-white.
- **Do** keep the paper at Almanac chroma (`C ≈ 0.007–0.014`, hue ~60–85); warm, never loud.
- **Do** reserve camel (`#ad7f58`) for primary actions, current selection, and state — ≤10% of
  any screen (The One Lamp Rule). Use the deeper brown (`#815e46`) for accent _text_ on light.
- **Do** use Newsreader for headings and reading content, and Atkinson Hyperlegible Next for running
  UI text, labels, and controls — never cross them (The Serif-Sans Split Rule).
- **Do** keep surfaces flat and bordered at rest; add shadow only to things that float.
- **Do** keep muted text at or above Ink Muted (`oklch(0.56 0.012 65)`) and cap reading measure at
  65–75ch — AA contrast and legibility are the baseline, not an add-on.
- **Do** honor `prefers-reduced-motion` with a crossfade or instant alternative for every transition.

### Don't:

- **Don't** widen the warm paper into a loud cream, sand, parchment, or beige, or push its chroma
  past the Almanac whisper. This is warm off-white, not a coffee-stain aesthetic.
- **Don't** design an algorithmic social feed: no engagement-bait, infinite-scroll dopamine
  mechanics, or dark patterns pushing time-on-site.
- **Don't** turn it into a cold SaaS dashboard: no hero-metric card templates, no gray-and-blue
  console chrome, no big-number/small-label stat blocks.
- **Don't** rebuild the cluttered old-RSS-reader: no toolbar walls, no triple-panel density, no
  sub-legible type.
- **Don't** reach for the trendy AI-startup landing kit: no gradient text (`background-clip: text`),
  no decorative glassmorphism, no tiny tracked uppercase eyebrows above every section.
- **Don't** put a resting drop shadow of 16px+ on a card, or pair a 1px border with a wide soft
  shadow (the ghost-card tell).
- **Don't** over-round: cards stay at 8–12px. Full-pill is for chips and toggles only, never cards
  or sections.
- **Don't** let a second camel element compete on one screen, and don't spend the accent on
  decoration.
