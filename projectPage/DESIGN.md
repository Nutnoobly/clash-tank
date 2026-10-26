---
name: ClashTank
description: Compact Thai project overview with real vehicle photography.
colors:
  accent: "#ff7a1a"
  accent-soft: "#fff2e8"
  ink: "#24272c"
  muted: "#646c76"
  line: "#e0e4e9"
  page: "#f2f4f6"
  surface: "#fff"
typography:
  headline:
    fontFamily: "Anuphan, 'Noto Sans Thai', Tahoma, sans-serif"
    fontSize: "clamp(29px, 2.8vw, 42px)"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-.025em"
  body:
    fontFamily: "Anuphan, 'Noto Sans Thai', Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.95
  label:
    fontFamily: "Anuphan, 'Noto Sans Thai', Tahoma, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  card: "16px"
  resource: "15px"
  node: "10px"
  viewer: "18px"
spacing:
  compact: "10px"
  gap: "16px"
  inset: "24px"
components:
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  tab-selected:
    textColor: "{colors.accent}"
    padding: "12px 13px 14px"
  resource-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.resource}"
    padding: "10px 24px"
  broker-node:
    backgroundColor: "{colors.accent-soft}"
    rounded: "{rounded.node}"
  poster-viewer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.viewer}"
---

# Design System: ClashTank

## Overview
White cards, cool gray framing, local Thai typography and real vehicle photographs create a compact, practical project overview. Orange marks the brand, selected controls, controller link and MQTT node.

## Colors
The single accent is the user-confirmed exact orange, including its contrast exception on white. Ink carries primary text; muted carries supporting copy; line separates surfaces. Accent-soft highlights the broker and viewer hover states.

## Typography
Local Anuphan weights (400, 500, 600, 700) serve all text. Intro headlines use the headline token; section titles are (15–17px), resource titles (15px/500), and supporting labels at least (12px). Intro prose uses the body token and a maximum width of (72ch).

## Layout
Centered logo above a full-browser layout, with desktop content padding (12px 16px). The upper row is approximately 60/40 (1.46:1): scrollable intro and gallery. The middle row is 50/50: architecture and four resource rows. A full-width five-member strip follows. The desktop layout fills viewport height, with a (680px) minimum and (16px) main gaps; the page has no enclosing border, outer radius, width cap or height cap.

At (1200px), spacing tightens. At (1000px), the layout becomes content-height with padding (12px 14px). At (680px), padding becomes (10px) and cards stack in reading order; the intro remains internally scrollable, and members scroll horizontally with snap points. At (370px), the headline and tab gaps tighten.

## Elevation & Depth
Cards are flat, defined by thin neutral borders and white surfaces. Gallery arrows use a small floating shadow; the modal uses a stronger shadow and dim backdrop. Focus uses a visible ink outline (2px), offset (4px).

## Shapes
Cards use the card radius. Resource rows and diagram nodes use their own radii. Gallery arrows are circular, and the selected gallery dot stretches into a pill. Photos fill their gallery card edge to edge.

## Components
- **Brand navigation:** centered wordmark; clicking returns to the overview tab and page top. A focusable skip link targets the intro.
- **Intro tabs:** three bottom tabs (ภาพรวม / แนวคิด / ฟีเจอร์), muted by default, orange with a (3px) underline when selected. Click, Left/Right, Home and End select panels; switching resets intro scroll and preserves one keyboard tab stop.
- **Gallery:** four real photos with cover cropping, previous/next arrows and four dot buttons. Arrows wrap; Left/Right keys work within the gallery. Selected dots expose pressed state, and image changes update a polite status message.
- **Architecture:** readable HTML node labels over SVG connectors; the central MQTT node uses accent-soft and an orange border.
- **Resource rows:** icon, title, supporting label and trailing action indicator. Available rows warm on hover; the controller icon and arrow use orange. Pending video has a disabled link state and neutral dot. Poster opens the viewer.
- **Members:** five slots with portraits or neutral person placeholders and supporting labels; mobile slots retain a fixed width (108px).
- **Poster viewer:** native modal with Close, Escape and outside-click dismissal; focus returns to its trigger. An image fits initially and on resize, with zoom from (50–300%) in (25%) steps and a fit control. A supplied file can render in an iframe; the original opens separately. Missing content shows the pending state; failed images show an error.
- **Motion:** short state transitions (200–250ms); arrow scaling and dot expansion use the shared easing. Reduced-motion preference removes transitions and smooth scrolling.
