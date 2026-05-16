# Design System — Renaissance court

The web client's visual layer. Companion to SKILL.md § 2 (locked stack) and
§ 3.7 (client UX). Lives in `apps/web`.

---

## Direction

A light **Renaissance-court** theme — aged parchment surfaces, oxblood and
antique gold, inscriptional-capital display type. Faithful to the tabletop
game's court-intrigue mood.

**Light mode only.** A dark ("candlelit") variant is a future pass; `.dark` is
intentionally left undefined in `globals.css`, so the `dark` variant is inert.

## Stack

| Piece | Choice | Notes |
|---|---|---|
| Component layer | **shadcn/ui** — `radix-nova` style | Radix UI primitives + Tailwind, vendored into `components/ui/`. |
| CSS | **Tailwind v4** | CSS-first config; theme lives in `app/globals.css`. No `tailwind.config.js`. |
| Display font | **Cinzel** | Roman inscriptional capitals — headings, the wordmark. |
| Body font | **EB Garamond** | A Renaissance serif — body + UI text. |
| Icons | **lucide-react** | |
| Toasts | **sonner** | `<Toaster />` mounted in the root layout. |
| Class helper | `cn()` — `lib/utils.ts` | `clsx` + `tailwind-merge`. |

**`shadcn` is NOT a project dependency.** Run the CLI via `pnpm dlx shadcn@latest`.
Keeping `shadcn` in `package.json` drags in `msw`, whose postinstall build
script pnpm 11 blocks (`ERR_PNPM_IGNORED_BUILDS`), which breaks installs.

## Color tokens

CSS variables (oklch) in `app/globals.css` `:root`, exposed as Tailwind color
utilities through `@theme inline` (so `bg-primary`, `text-muted-foreground`, etc. work).

**shadcn semantic tokens** (standard): `background`, `foreground`, `card`,
`popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`,
`input`, `ring`.

- `background` — warm parchment; `foreground` — sepia ink.
- `primary` — **oxblood** `oklch(0.43 0.14 25)`; the brand / main action.
- `destructive` — a brighter alarm red, deliberately distinct from oxblood.
- `accent` — pale gold (subtle hover surface).

**Project tokens** (additions, same file):

| Token | Use |
|---|---|
| `gold` / `gold-foreground` | antique gold — rules, crests, the winner highlight |
| `success` / `success-foreground` | muted forest green — the "join / keep" affirmative |
| `table` / `table-foreground` | the dark felt surface of the game-room board |

## Typography

Wired via `next/font/google` in `app/layout.tsx`, which self-hosts both fonts
and sets CSS variables that `@theme inline` maps:

- `--font-display` (Cinzel) → the `font-display` utility — headings, wordmark.
- `--font-sans` (EB Garamond) → `font-sans`, the document default.

## Radius

`--radius: 0.4rem` — slightly sharp, suiting the carved / heraldic feel.
shadcn's `rounded-sm/md/lg/xl` derive from it.

## Conventions

- **`components/ui/`** — vendored shadcn components. Owned code, but kept in
  shadcn's own style (double quotes, semicolons); re-running `shadcn add`
  overwrites them. Project edits here are marked with a comment — currently:
  - a `success` **Button** variant (the affirmative "join / keep" action);
  - `cursor-pointer` on the **Button** base — every button shows the pointer cursor.
- **`components/`** (non-`ui`) — hand-authored game components, in the project's
  authored style (single quotes, no semicolons):
  - `Logo` — the "COUP Online" wordmark (`size`: `sm` / `md` / `lg`).
  - `InfluenceCard` — renders the player-supplied card art from `public/cards/`
    (`duke.svg`, `assassin.svg`, `captain.svg`, `ambassador.svg`, `contessa.svg`,
    and `back.svg`), authored 400×600 (a 2:3 ratio). States: `face-down` (the
    character's art), `revealed` (lost — the art faded, greyed and struck
    through), `hidden` (the `back.svg` card back). `size`: `sm` (seat grid) / `md`.
    Clicking a card opens an enlarged lightbox (a Radix `Dialog`) — click the
    big card, the backdrop, or press Escape to close.
    To restyle the cards, replace the SVGs in `public/cards/` — no code change.
  - `SeatCard` — an opponent's seat tile (compact: name, coins, two `sm` cards).
  - `PlayerHand` — the viewer's own seat, shown large along the bottom of the
    table: two `md` cards, name, coins, turn state.
- **The game room is a felt "table"** (`bg-table`) — opponents up top, a court
  centre (phase / timer / deck / action in play), your hand along the bottom;
  the action bars sit below the table as the control strip.
- **Disabled buttons explain themselves** via a Radix `Tooltip`. A disabled
  `<button>` emits no pointer events, so the `TooltipTrigger` wraps a `<span>`.
  See `AffordedButton` in `app/room/[matchId]/client.tsx`.
- **Transient server errors** → `sonner` toasts (auto-dismiss, no layout shift).
  **Fatal / structural states** → `Alert`.
- `TooltipProvider` and `<Toaster />` are mounted once, in the root layout.

## Adding more components

From `apps/web`: `pnpm dlx shadcn@latest add <name>`. The component lands in
`components/ui/`. Radix deps resolve against the already-installed `radix-ui`
unified package; `lucide-react` covers icons.

## Not done / future

- **Dark mode** — a candlelit dark palette; would add a `.dark` block + a toggle.
- **Chart + sidebar tokens** — omitted from `globals.css` until a page needs
  them (e.g. the leaderboard); add the standard shadcn tokens at that point.
- **Provider brand icons** on the sign-in buttons — lucide has no brand marks,
  so Google / Discord buttons are text-only `outline` buttons.

## See also

- **Stack lock + client UX:** [`SKILL.md`](../SKILL.md) § 2, § 3.7
- **Tokens + theme:** `apps/web/app/globals.css`
- **shadcn config:** `apps/web/components.json`
- **Fonts + providers:** `apps/web/app/layout.tsx`
