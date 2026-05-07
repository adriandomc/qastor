# ADC Handoff Kit

Self-contained design system package for **adriandomc (ADC)**. Drop this folder into a Claude Code
project and you're ready to build.

## What's inside

```
handoff/
├── CLAUDE.md          ← Read this first. Principles + don'ts.
├── tokens.css         ← CSS variables (palette, type, spacing, motion)
├── components.css     ← Class-based component styles
├── components.tsx     ← React/TypeScript reference implementations
└── examples.html      ← Open in a browser to see everything
```

## Quick start

```ts
// root layout
import "./handoff/tokens.css";
import "./handoff/components.css";
```

```tsx
import { Button, Alert, Pill, Tabs, Modal } from "./handoff/components";

<Button variant="primary">Ship it</Button>
<Alert tone="warn" title="Heads up">Watch your fields.</Alert>
```

## To share with Claude Code

Either copy the `handoff/` folder verbatim into the target repo, or zip it. The `CLAUDE.md` inside
is auto-loaded by Claude Code at the project root or at any subfolder it lives in.

## What's not here

- The portfolio React UI kit (that lives in `ui_kits/portfolio/`).
- JetBrains Mono font file — link Google Fonts or self-host via `@font-face`. Tokens already declare
  the family name.
- Image assets (logos, favicons) — copy from `../assets/` if you need them.
