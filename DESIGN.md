# Kryleos Forge — Design System

**Version:** 1.0 · June 2026
**Category reference:** Visual identity, UI patterns, and design decisions for the Desktop multi-agent coding workspace.

---

## Product Context

Kryleos Forge is a desktop multi-agent coding workspace. Developers orchestrate AI agents (researcher, developer, debugger, custom) across their projects, run commands, review code, and manage plans — all from one Electron application.

The memorable thing this design serves:

> **"A complete tool for a developer"**

The interface should feel self-sufficient and whole, like a workshop bench, not a lightweight editor. Every pixel signals purpose-built seriousness.

---

## Aesthetic Direction

| Attribute | Direction |
|-----------|-----------|
| Style     | Industrial / Utilitarian |
| Tone      | Warm, serious, purposeful |
| Metaphor  | A machinist's bench — organized, warm, where real work happens |
| Density   | Medium — data-dense but with room to breathe |
| Decoration | Intentional minimalism: typography + spacing do the work; subtle panel texture |

### Why not "clean IDE" like every other dev tool?

Most developer tools aim for surgical cleanliness (VS Code, Cursor, Zed). Forge's multi-agent orchestration is fundamentally different from a single-user editor — it's a control room, not a text editor. The workshop metaphor signals "orchestration happens here" before the user runs a single command.

---

## Color Palette

### Dark theme (primary)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#09090b` (zinc-950) | Page background |
| `--panel-bg` | `rgba(24, 24, 27, 0.95)` | Floating panels, cards |
| `--surface` | `#18181b` (zinc-900) | Sidebar, cards, inputs |
| `--surface-hover` | `#27272a` (zinc-800) | Hover state |
| `--surface-active` | `#3f3f46` (zinc-700) | Active state |
| `--border` | `#27272a` (zinc-800) | Default border |
| `--border-light` | `#3f3f46` (zinc-700) | Subtle border |

### Light theme

| Token | Value |
|-------|-------|
| `--bg` | `#fafafa` (zinc-50) |
| `--panel-bg` | `rgba(255, 255, 255, 0.95)` |
| `--surface` | `#ffffff` |
| `--border` | `#e4e4e7` (zinc-200) |

### Accent colors

| Role | Value | Usage |
|------|-------|-------|
| **Primary accent** | `#f59e0b` (amber) | Primary identity color — buttons, active states, focus rings, key indicators |
| Hover | `#d97706` (amber-600) | Button hover, link hover |
| Glow | `rgba(245, 158, 11, 0.08)` | Panel glow, focus shadow |
| Subtle | `rgba(245, 158, 11, 0.06)` | Background tint for active items |
| Secondary | `#38bdf8` (sky) | Links, secondary status, info badges |
| Success | `#22c55e` (green) | Build passing, tasks complete, online status |
| Error | `#ef4444` (red) | Errors, failures, destructive actions |
| Warning | (amber, same as primary) | Warning states use amber at reduced opacity |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#f4f4f5` (zinc-100) | Headings, body, labels |
| `--text-secondary` | `#a1a1aa` (zinc-400) | Secondary info, metadata |
| `--text-muted` | `#71717a` (zinc-500) | Placeholders, disabled |

### Gradients

None. The design does not use gradients. Flat color only — amber glow effects use `radial-gradient` for subtle panel illumination, never linear gradients on UI elements.

---

## Typography

### Typefaces

| Role | Font | Fallback | Source |
|------|------|----------|--------|
| Display / UI | **General Sans** | -apple-system, sans-serif | [Fontshare](https://fontshare.com) (weights 300–700) |
| Data / Tables | **Geist** | -apple-system, sans-serif | [Google Fonts](https://fonts.google.com) (weights 400–700) |
| Code | **JetBrains Mono** | monospace | [Google Fonts](https://fonts.google.com) (weights 400–600) |

**Why General Sans over Inter?** Inter is the safe default used by every modern dev tool (VS Code, Cursor, Linear, Vercel). General Sans has a subtly warmer geometry that reinforces the workshop aesthetic. The difference is perceptible at every label.

**Why Geist for data?** Purpose-built tabular numerals. File listings, agent status tables, trace logs, and metrics all benefit from consistent numeral widths.

### Module scale

Body base: **13px** (0.8125rem). Minor-third scale (1.125).

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| caption | 11px / 0.6875rem | 600 | Labels, badges, status |
| body-sm | 12px / 0.75rem | 400–500 | Dense content, code |
| **body** | **13px / 0.8125rem** | **400–500** | **Default text (base)** |
| body-lg | 14px / 0.875rem | 400–500 | Extended reading |
| subheading | 16px / 1rem | 600 | Section headers |
| h3 | 20px / 1.25rem | 600 | Card titles |
| h2 | 24px / 1.5rem | 700 | Panel headers |
| h1 | 32px / 2rem | 700 | Page titles |

### Line heights

- Body text: **1.5** (20px at 13px base)
- Code: **1.6**
- Tight (headers, data): **1.2**
- Headings: tighten to **1.1**

---

## Spacing

**Base unit:** 4px

| Token | Pixels | Usage |
|-------|--------|-------|
| --space-1 | 4px | Micro spacing (badge padding, icon gaps) |
| --space-2 | 8px | Dense inline gaps (file rows, button groups) |
| --space-3 | 12px | Default padding (cards, panels, inputs) |
| --space-4 | 16px | Section padding (between UI blocks) |
| --space-6 | 24px | Panel padding (sidebar, content area) |
| --space-8 | 32px | Between major sections |
| --space-12 | 48px | Page margins, hero spacing |

---

## Layout

### Page structure

The workspace uses a hybrid layout:

- **Sidebar:** Fixed-width (240px), containing filesystem tree and agent list
- **Content:** Flexible, containing code editors, chat panels, and plan views
- **Terminal:** Bottom panel, full-width, collapsible
- **Header:** 40px above content, contains tab navigation + agent status

### Grid discipline

- Panels are grid-aligned with consistent interior padding (--space-3 or --space-4)
- Data tables and agent lists respect the 4px spacing base
- Creative asymmetry is reserved for the orchestrator dashboard (plan in center, logs right, status left)

### Breakpoints

| Width | Layout |
|-------|--------|
| ≥900px | Full 3-panel (sidebar + content + optional) |
| 600–900px | Sidebar collapses, stacked panels |
| <600px | Single column, all panels full-width |

---

## UI Components

### Buttons

- **Height:** 32px (compact) / 40px (large, primary actions only)
- **Padding:** 12px horizontal (compact) / 16px (large)
- **Border-radius:** 4px
- **Transition:** 100ms linear
- **Variants:** Primary (amber fill), Secondary (zinc border/bg), Ghost (borderless, hover-fill)

### Badges

- **Height:** 18px
- **Border-radius:** 3px
- **Font:** 11px, 600 weight
- **Variants:** Amber (active), Green (success), Sky (info), Muted (idle/disabled)

### Inputs

- **Height:** 32px
- **Border-radius:** 4px
- **Border:** 1px solid --border
- **Focus:** Amber border + 2px amber glow (`box-shadow`)
- **Font:** Geist (tabular data readability)

### Alerts

- **Padding:** 12px 16px
- **Border-radius:** 4px
- **Border:** 1px solid at low opacity
- **Background:** Role color at 6% opacity
- **Variants:** Success (green), Warning (amber), Error (red), Info (sky)

### Panels

- **Background:** rgba(24, 24, 27, 0.95) (dark) / rgba(255, 255, 255, 0.95) (light)
- **Border:** 1px solid --border
- **Border-radius:** 8px (standalone), 6px (nested)
- **Shadow:** None — depth comes from glass-blur and border, not drop shadows

---

## Motion

- **Duration:** 100ms (micro-interactions) / 150ms (standard) / 300ms (panel open/close)
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — "overshoot pop" for all standard transitions
- **Entrance animations:** None — elements appear immediately. No fade-in, no slide-up
- **Hover:** Instant color change only
- **Spinners:** Only for operations >500ms; inline dots (not full-screen spinners)

---

## Design Decisions Log

| # | Element | Choice | Rationale |
|---|---------|--------|-----------|
| 1 | Primary accent | Amber (#f59e0b) | No major dev tool uses amber. Warm, industrial, memorable. |
| 2 | UI font | General Sans | Warmer texture than Inter (the category default). |
| 3 | Data font | Geist | Tabular numerals for data-dense surfaces. |
| 4 | Code font | JetBrains Mono (keep) | Already in use, excellent for code. |
| 5 | Body size | 13px | Denser than 14px standard; more information on screen. |
| 6 | No gradients | Flat color | Gradients compete with content. Amber glow uses radial-gradient as material effect, never UI decoration. |
| 7 | No entrance animations | Immediate display | Dev tools should answer, not perform. |
| 8 | Glass-blur panels | rgba + backdrop-filter | Distinguishes floating panels from workspace background without hard shadows. |
| 9 | Light theme support | Yes | Toggle via `data-theme="dark"|"light"` attribute. Palettes across both themes. |
| 10 | Spacing base | 4px | Fine-grained control for dense data surfaces. |

---

## Risks

1. **Amber accent risk:** Warm tones can feel less "technical" than blue. Mitigation: pair with zinc neutrals and sky secondary for balance.

2. **General Sans loading risk:** Fontshare CDN may be slower than Google Fonts. Fallback: -apple-system immediately available. We can self-host General Sans if latency is an issue.

3. **Workshop aesthetic risk:** Intentionally less polished than Cursor/VS Code. A developer's first impression might be "less refined." Mitigation: execution quality — typography spacing, and consistent radii matter more than having a glossy chrome.

---

## Future Considerations

- **Self-hosted fonts:** Bundle General Sans + Geist with the Electron app to eliminate CDN dependency
- **High-contrast mode:** A dedicated theme for accessibility (WCAG AAA)
- **Custom accent colors:** Allow user-chosen accent hue while keeping the structural palette fixed
- **Print/media stylesheets:** For exporting plan documents and run logs
