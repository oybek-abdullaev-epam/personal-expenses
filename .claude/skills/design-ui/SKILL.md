---
name: design-ui
description: Design or redesign UI for the expense tracker dashboard (the `website/` directory). Wraps the frontend-design plugin skill with owner and app context, hard constraints, and a dark-first screenshot verification loop. Use for new views or tabs, restyles, charts and analytics, and layout or responsive fixes.
---

# Design UI for the expense dashboard

First invoke `frontend-design:frontend-design` with the Skill tool and follow its design guidance. This skill adds context, constraints and verification around it. It never limits the creative direction.

## Context (informs the design, does not limit it)

- **Owner:** one person in Tashkent. Prefers **dark mode** and uses it on their devices.
- **Real use:** mostly on a phone, right after a Telegram ping. They give a transaction a category and description, then glance at how money is balancing. Desktop is secondary.
- **App:** a personal ledger of UZCARD card transactions. UZS plus some other currencies, always kept separate. English UI. The dashboard is public (no login), on Vercel.
- **Vocabulary** (CONTEXT.md), use exactly: Transaction, Spending, Income, Reimbursement, Net cash flow, Review item, "Needs details".
- **Current identity** (a starting point, not a mandate): Samarkand tilework. Cool porcelain page, lapis blue for actions, turquoise for income, pomegranate for spending, saffron for "Needs details". System fonts, `ui-rounded` for figures, tabular numerals. Light and dark both follow the OS. A restyle may evolve or replace this; a new view should feel like the same app unless asked otherwise.
- **Taste:** not noisy. Calm surfaces, one memorable thing, amounts are the content.
- **Latitude:** be creative. Only the hard constraints below are fixed.

## Hard constraints

- Do not commit, push or deploy, and do not touch Vercel, Cloudflare, Telegram or Gmail. Deploying is the `deploy-*` skills, on request only.
- Keep the public handler safe. No inline third-party scripts. Do not relax the CSP (`default-src 'none'`: **no web fonts, no external assets**), same-origin writes, body limits or caching rules. A new endpoint is allowed only if the brief needs it: read-only GET, tested, allowlisted in `website/worker/index.js`, and named in the report.
- Money is exact (integer minor units, BigInt strings). Floating point may size bars but never produces a displayed amount. Times display in `Asia/Tashkent`, conversions explicit. See PLAN.md.
- Synthetic data only. No secrets, real emails or balances in code, fixtures, screenshots or logs. New preview data goes in `scripts/preview.ts` only.
- Never weaken `tests/website.test.ts`. If intentionally changed markup breaks an assertion, say exactly what changed and why.
- Update README.md only if user-visible behaviour or run instructions changed.

## Process

Run from the repo root.

### 0. Size the change and pick a checkpoint

Judge the brief, then say in one line which size you chose and why.

| Size | Examples | Checkpoint |
|---|---|---|
| Small | Spacing, colour or copy tweak, one component, a layout bug | None. Write a two-line plan and build. |
| Medium | Restyling a whole page or several components | Plan mode with one design plan (colour, type, layout, principles). |
| Large | New view, tab, chart or analytics; anything needing a new endpoint | 2-3 short options with ASCII wireframes and the main trade-off each. Ask which to build. Then plan mode with the detailed plan for the chosen option. |

Overrides in the brief win over your judgement, and the hard constraints apply either way:
- "plan first" (or similar) forces plan mode, even for a small change.
- "just do it" or "no plan mode" skips the plan-mode gate. Large changes still get options first unless the brief names the design.

The plan-mode gate: load `EnterPlanMode` with ToolSearch if needed and call it, so nothing is edited or run until the user approves via `ExitPlanMode`. If plan mode is unavailable (for example an unattended session), ask in text and wait for an answer instead. Do not call `ExitPlanMode` or continue on your own.

### 1. Prepare (no code changes)

For medium and large changes, do this before entering plan mode so the plan is grounded in how the app looks now. If the session is already in plan mode, skip to step 2 and do this right after approval.

1. **Baseline.** `npm ci` only if `node_modules` is missing, then `npm test` and `npm run build`. Report pre-existing failures; don't fix unrelated ones.
2. **Preview.** `npm run preview` in the background (http://127.0.0.1:8788, synthetic, in-memory, no external calls).
3. **Before shots** (only when changing something that exists): run the screenshot script with `--prefix before` and look at the images.

For small changes, do the same, then build straight away.

### 2. Checkpoint

Run the checkpoint from step 0 and wait for approval. Present the plan in the shape the plugin skill asks for, and review it against the brief before showing it.

### 3. Build and verify

1. Build the approved design.
2. **After shots** with `--prefix after`. Open every image with Read and fix what you see (overflow, clipping, low contrast, cramped tap targets, broken wrapping), then re-shoot. Extend the shot list for whatever is new.
3. **Final checks.** `npm test` and `npm run build` both pass. Stop the preview server. Leave no background processes, temp files or logs.

## Screenshots

```
node .claude/skills/design-ui/screenshot.mjs --out docs/screenshots/<YYYY-MM-DD>-<slug> --prefix after
```

- **Location:** `docs/screenshots/<YYYY-MM-DD>-<slug>/`. Never `/tmp`, never `website/` (it is deployed to Vercel).
- **Dark by default** for every viewport and state. Shots marked `"light": true` are also taken in light at 390x844 and 1280x900 as a regression check. The scheme is emulated through DevTools, not Chrome flags.
- **Viewports:** 320x800, 390x844, 768x1024, 1280x900, rendered at true width. Do not use `chrome --screenshot`: it hangs and crops narrow windows.
- **Names:** `<before|after>-<state>[-light]-<w>x<h>.png`.
- **States:** `shots.default.json` covers ledger, more filters, Needs details, edit dialog, review item, empty state and the Month view. For a new view, pass `--spec` with your own shots (`hash`, `actions` with `click`, `fill`, `submit`, `waitFor`, `wait`, plus `fullPage`, `light`, `motion`, `sizes`), or `--only name,name` for a subset. Motion is reduced by default; set `"motion": true` on a shot that is about animation.
- **Output:** each shot prints ok/FAIL with horizontal overflow in px and console errors. Exit code is non-zero on any failure. The script always kills Chrome and removes its temp profile.
- **Not committed.** The project root is a single git repo that includes `website/`. Leave screenshots uncommitted unless asked.

## Report back (concise)

- The size you chose (small, medium or large) and whether the plan-mode gate ran.
- What changed and why.
- The screenshot folder, and which images to look at first.
- Test and build results.
- What could NOT be verified. The script can click and measure, but not real touch or Safari-only rendering (for example `ui-rounded` figures), so list the behaviours to check by hand on the phone.
