# CLAUDE.md — ADC design system handoff

You are working on a project that follows the **adriandomc (ADC)** design system. Keep every UI
choice consistent with what's in this folder.

## What you have

- `tokens.css` — CSS variables (palette, typography scale, spacing, radii, motion). Import once at
  the root.
- `components.css` — class-based styles for every component below. Import once.
- `components.tsx` — React/TypeScript reference implementations. Use them or copy the patterns.
- `examples.html` — visual reference of every component on one page.

## Setup

```ts
// in your root layout / _app.tsx / equivalent
import "./adc/tokens.css";
import "./adc/components.css";
```

Then use components like:

```tsx
import { Button, Alert, Pill, Tabs, Modal } from "./adc/components";

<Button variant="primary">Ship it</Button>
<Alert tone="warn" title="Heads up">Two of your fields look unusual.</Alert>
<Pill tone="ok">Live</Pill>
```

## Design principles — the non-negotiables

1. **Borders, not shadows.** Every elevated surface gets a single `1px solid var(--adc-accent-1)`
   outline. **Never** add `box-shadow`. The look is flat-with-an-outline; gradients and blurs are
   forbidden.
2. **Small radii.** `5px` for buttons / menu bars, `6px` for cards. **Never** use `8px+`.
3. **JetBrains Mono everywhere.** All UI text — body, headings, buttons, labels — is mono. The only
   place Inter shows up is tiny meta labels under color swatches. If you need a "softer" feel, use
   lighter weight, never a sans-serif swap.
4. **Bold or regular only.** Use `var(--adc-fw-bold)` (700) or 400. **No** 500/600 weights.
5. **Color discipline.** Two action colors only:
   - `--adc-accent-1` (deep moss) → primary buttons, menu bar, table headers.
   - `--adc-accent-2` (sea foam) → secondary buttons, accents, hover bars. `--adc-primary` (sage) is
     a **surface**, not an action color. Don't use it for buttons.
6. **Hover/active language.** When a tile shows a selected state, two short bars appear at top +
   bottom (or left + right on vertical lists). On hover those bars **grow inward** to fill the tile;
   the text flips from white to `--adc-text`. Reuse this pattern for menus, tabs, and any
   tile-shaped picker.
7. **No emoji** in product UI. Use Lucide-style stroke icons via `currentColor`. The handful of
   glyph characters (`✓ ! × ∅`) inside Alert and EmptyState are deliberate exceptions because
   they're part of the system's "handmade" voice.
8. **No drop caps, no gradients, no blur, no glassmorphism.** If you reach for any of these, you're
   fighting the system.
9. **Control sizing is shared.** Buttons, inputs, selects, and search rows all use the same height
   tokens — `--adc-h-md` (34px) by default, `--adc-h-sm` (28px) compact, `--adc-h-lg` (42px) hero.
   Never set ad-hoc heights on form controls; if buttons sit next to inputs in a row, they line up
   automatically. Square icon-only buttons use `--adc-h-icon` (32px). Border-box on all of them.

## Component reference

| Component            | Class / API                                                                          | Notes                                        |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Button               | `<Button variant>` / `.adc-btn .adc-btn--secondary .adc-btn--ghost .adc-btn--danger` | 30px tall, mono bold 14, radius 5            |
| Pill / Badge         | `<Pill tone>` / `.adc-pill .adc-pill--ok/warn/err/muted/count`                       | Tabular numerals on counts                   |
| Card                 | `<Card>` / `.adc-card`                                                               | sage bg, 1px outline, radius 6               |
| Menu (desktop)       | `<Menu items active>` / `.adc-menu`                                                  | Capsule, 660px wide reference                |
| Menu (mobile)        | `<MobileMenu items active>` / `.adc-menu-m`                                          | ADC mark left, "Menu" capsule, vertical list |
| Tabs                 | `<Tabs tabs active>` / `.adc-tabs .adc-tab`                                          | Same hover/active language as menu           |
| Pagination           | `<Pagination page total>` / `.adc-pg`                                                | Compact with ellipses                        |
| Breadcrumbs          | `.adc-crumbs`                                                                        | "/" separator in `--adc-accent-2`            |
| Alert                | `<Alert tone title>` / `.adc-alert--info/success/warn/error`                         | Colored icon + body                          |
| Table                | `<Table>` / `.adc-table`                                                             | Header in `--adc-accent-1`, hover on rows    |
| Modal                | `<Modal open>` / `.adc-modal + .adc-scrim`                                           | White card, 1px outline, no shadow           |
| Tooltip              | `.adc-tooltip`                                                                       | Dark moss bubble with arrow                  |
| Code block           | `.adc-code` (+ optional `.adc-code__toolbar`)                                        | Dark moss bg, tertiary text                  |
| Empty state          | `<EmptyState>` / `.adc-empty`                                                        | Dashed outline, sage glyph circle            |
| Status dot           | `.adc-status .adc-status--published/draft/building/failed/live`                      | 8px dot + mono label                         |
| Divider              | `.adc-divider` (h) / `.adc-divider--vert` (v)                                        | 30% opacity moss line                        |
| Toggle               | `.adc-toggle` + `.adc-toggle--off`                                                   | 36×20 switch, moss-on / grey-off             |
| Chip / tag input     | `.adc-chips .adc-chip .adc-chip__x`                                                  | Sea-foam pill chips inside white box         |
| Kbd                  | `.adc-kbd`                                                                           | Mono key cap with 1px shadow                 |
| Editor toolbar       | `.adc-toolbar .adc-tb .adc-tb.is-active`                                             | Tertiary bar w/ mono buttons                 |
| MDX block (selected) | `.adc-mdx .adc-mdx__tag .adc-mdx__tools`                                             | Decorated card w/ tag pill + tools           |
| Toast                | `.adc-toast .adc-toast--success/warn/error`                                          | Compact moss toast                           |
| Command palette      | `.adc-cmd .adc-cmd__search .adc-cmd__group .adc-cmd__row`                            | Search + grouped rows w/ kbd hints           |
| Sidebar nav          | `.adc-nav .adc-nav__item .adc-nav__count`                                            | Active = moss bg + white text                |
| Dropzone             | `.adc-drop`                                                                          | Dashed border, white-50 fill                 |
| Progress bar         | `.adc-bar > i`                                                                       | Sea-foam fill on muted track                 |

## Voice & content

- First-person, casual. "I built…", "drop me a line", "the world is waiting".
- ALL CAPS for page H1s and small uppercase labels (with `letter-spacing: 0.04em`).
- Short blocky copy. Never marketing jargon ("synergy", "best-in-class", "transform your workflow").
- Numbers: tabular numerals (`font-variant-numeric: tabular-nums`) in tables and metrics.
- Dates: `MMM D, YYYY` (e.g. `Mar 6, 2026`) in mono.

## Don'ts (common Claude/AI traps)

- ❌ Don't add gradient backgrounds, soft shadows, blur, or glassmorphism.
- ❌ Don't reach for Tailwind's defaults (slate, zinc, indigo) — stay in the ADC palette.
- ❌ Don't use Inter or system-ui for body text. Mono everywhere.
- ❌ Don't use emoji, sparkle icons, or AI-style "✨" decoration.
- ❌ Don't use `border-radius` larger than 6px in components.
- ❌ Don't add subtle hover lifts (`translateY(-2px)` + shadow) — the hover language is the bar-grow
  effect.
- ❌ Don't use 500/600 font weights.

## When in doubt

Open `examples.html` and copy what's there. If something isn't there, build it from the
**principles** above — mono, borders not shadows, two action colors, bar-grow hover.
