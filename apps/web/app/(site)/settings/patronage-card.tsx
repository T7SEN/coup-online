'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Crown,
  ImagePlus,
  Loader2,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  CardBackPreview,
  CARD_BACK_LABEL,
  CARD_BACK_SKINS,
  type CardBackSkin,
} from '@/components/card-back-preview'
import { Card, CardContent } from '@/components/ui/card'
import { GildedName } from '@/components/gilded-name'
import { Input } from '@/components/ui/input'
import { PatronBadge } from '@/components/patron-badge'
import {
  TABLE_THEME_LABEL,
  TABLE_THEMES,
  TableThemePreview,
  type TableTheme,
} from '@/components/table-theme-preview'
import { cn } from '@/lib/utils'

// Patronage section of /settings — read-only status strip for everyone, plus
// the editable storefront form for patrons. The form is sparse-PATCH against
// `/api/me/patron`: only fields that the visitor actually changed are sent
// in the body, so concurrent edits from another tab don't get clobbered.
//
// Non-asset fields only here in Phase 2 — motto, vanity slug, gilded name,
// shimmer banner, victory flourish. Card-back skin / table theme / banner
// image upload come in Phase 3 (they need asset design).
//
// The card shows three states:
//   • not a patron → a friendly summary + CTA to /support
//   • patron, no founder rank → "Patron since YYYY" + editable form
//   • patron, founder rank set → above + "Founding patron · <Roman>"

const MOTTO_MAX = 60
const VANITY_CODE_MAX = 10
// Mirrors SLUG_RE in apps/game-server/src/index.ts. Reject anything the
// Worker would reject anyway so we surface the error inline before the round
// trip.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])?$/
// Mirrors VANITY_CODE_RE in the Worker — 4–10 uppercase letters or digits.
const VANITY_CODE_RE = /^[A-Z0-9]{4,10}$/

// Banner target dimensions. The profile crest banner area is roughly 5:1
// (h-28 / h-32 against a max-w-2xl card), so we resize to 1200×240 — wide
// enough for a 2× retina banner without producing a heavy WebP. The Worker
// caps at BANNER_MAX_BYTES = 2 MB.
const BANNER_W = 1200
const BANNER_H = 240

export interface PatronStorefront {
  isPatron: boolean
  founderRank: number | null
  patronSince: number | null
  slug: string | null
  motto: string | null
  gildedNickname: boolean
  cardBack: string | null
  tableTheme: string | null
  vanityRoomCode: string | null
  shimmerBanner: boolean
  victoryFlourish: boolean
  // The custom banner image URL — set by POST /api/me/banner. Null when the
  // patron is using the default profileColor backdrop. The banner has its
  // own endpoint (uploads are async file work, not in-band PATCH).
  profileImage: string | null
}

// Wire shape sent to PATCH /api/me/patron — only the fields the visitor
// actually edits make it into the body.
interface PatronPatch {
  motto?: string | null
  slug?: string | null
  gildedNickname?: boolean
  shimmerBanner?: boolean
  victoryFlourish?: boolean
  cardBack?: string | null
  tableTheme?: string | null
  vanityRoomCode?: string | null
}

// `null` value here means "no override — use the default card back / felt"
// (the Worker treats null the same way at validate time). We render the
// default as its own selectable swatch so the patron can revert.
type CardBackChoice = CardBackSkin | null
type TableThemeChoice = TableTheme | null
function isCardBack(v: string | null): v is CardBackSkin {
  return (
    v != null &&
    (CARD_BACK_SKINS as readonly string[]).includes(v)
  )
}
function isTableTheme(v: string | null): v is TableTheme {
  return v != null && (TABLE_THEMES as readonly string[]).includes(v)
}

function patronSinceLabel(ms: number | null): string {
  if (ms == null) return ''
  return String(new Date(ms).getUTCFullYear())
}

const ROMAN = [
  '',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
] as const

// One labelled toggle row — a clickable surface that flips a boolean.
function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4 rounded-md border border-border bg-card/50 p-3 transition-colors hover:border-gold/40',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      {/* Native checkbox styled as a pill. Keeps keyboard + a11y for free. */}
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          value
            ? 'border-gold/60 bg-gold/30'
            : 'border-border bg-muted',
        )}
      >
        <span
          className={cn(
            'inline-block size-3.5 transform rounded-full bg-card shadow transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </label>
  )
}

export function PatronageCard({
  initialPatron,
}: {
  initialPatron: PatronStorefront
}) {
  const [patron, setPatron] = useState<PatronStorefront>(initialPatron)
  // Editable draft state, seeded from `patron` and re-seeded after a save.
  const [motto, setMotto] = useState(patron.motto ?? '')
  const [slug, setSlug] = useState(patron.slug ?? '')
  const [gildedNickname, setGildedNickname] = useState(patron.gildedNickname)
  const [shimmerBanner, setShimmerBanner] = useState(patron.shimmerBanner)
  const [victoryFlourish, setVictoryFlourish] = useState(patron.victoryFlourish)
  const [cardBack, setCardBack] = useState<CardBackChoice>(
    isCardBack(patron.cardBack) ? patron.cardBack : null,
  )
  const [tableTheme, setTableTheme] = useState<TableThemeChoice>(
    isTableTheme(patron.tableTheme) ? patron.tableTheme : null,
  )
  const [vanityRoomCode, setVanityRoomCode] = useState(
    patron.vanityRoomCode ?? '',
  )
  const [saving, setSaving] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [vanityCodeError, setVanityCodeError] = useState<string | null>(null)

  // Banner — independent of the sparse PATCH; its own endpoints. `bannerUrl`
  // is what the preview displays: the freshly-uploaded blob URL while a
  // round-trip is in flight, then the server URL after it resolves.
  // Clearing returns it to null. `bannerBusy` covers both upload and delete.
  const [bannerUrl, setBannerUrl] = useState<string | null>(patron.profileImage)
  const [bannerBusy, setBannerBusy] = useState(false)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const bannerObjectUrlRef = useRef<string | null>(null)
  // Revoke any in-flight blob URL when the component unmounts or replaces it,
  // so the browser can reclaim memory.
  useEffect(() => {
    return () => {
      if (bannerObjectUrlRef.current) {
        URL.revokeObjectURL(bannerObjectUrlRef.current)
      }
    }
  }, [])

  // The "dirty" flag drives whether the Save button is enabled. Comparisons
  // are against the last committed `patron` snapshot.
  const dirty =
    (motto.trim() || null) !== (patron.motto ?? null) ||
    (slug.trim() || null) !== (patron.slug ?? null) ||
    gildedNickname !== patron.gildedNickname ||
    shimmerBanner !== patron.shimmerBanner ||
    victoryFlourish !== patron.victoryFlourish ||
    cardBack !== (isCardBack(patron.cardBack) ? patron.cardBack : null) ||
    tableTheme !== (isTableTheme(patron.tableTheme) ? patron.tableTheme : null) ||
    (vanityRoomCode.trim().toUpperCase() || null) !==
      (patron.vanityRoomCode ?? null)

  // Not a patron: a friendly placeholder + a CTA back to /support.
  if (!patron.isPatron && patron.founderRank == null) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg tracking-wide">Patronage</h2>
            <p className="text-sm text-muted-foreground">
              Coup Online is free and ad-free. If you&rsquo;d like to help
              carry the cost, the patronage programme is on its way.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/support">Learn more</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Founder rank without active isPatron (revoked-but-honoured): show the
  // mark but hide the editable form — the cosmetics belong to active patrons.
  if (!patron.isPatron && patron.founderRank != null) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg tracking-wide">Patronage</h2>
            <PatronBadge
              isPatron={false}
              founderRank={patron.founderRank}
              size="sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            You are remembered as Founding patron{' '}
            <span className="font-display text-gold">
              {ROMAN[patron.founderRank]}
            </span>{' '}
            — the slot is yours forever. Active patron cosmetics are paused
            on this account.
          </p>
        </CardContent>
      </Card>
    )
  }

  async function save() {
    setSaving(true)
    setSlugError(null)
    setVanityCodeError(null)

    // Build a sparse patch — only changed fields make it to the wire.
    const body: PatronPatch = {}
    const nextMotto = motto.trim() || null
    const nextSlug = slug.trim().toLowerCase() || null
    const nextVanityCode = vanityRoomCode.trim().toUpperCase() || null
    if (nextMotto !== (patron.motto ?? null)) body.motto = nextMotto
    if (nextSlug !== (patron.slug ?? null)) body.slug = nextSlug
    if (gildedNickname !== patron.gildedNickname)
      body.gildedNickname = gildedNickname
    if (shimmerBanner !== patron.shimmerBanner)
      body.shimmerBanner = shimmerBanner
    if (victoryFlourish !== patron.victoryFlourish)
      body.victoryFlourish = victoryFlourish
    const savedCardBack = isCardBack(patron.cardBack) ? patron.cardBack : null
    if (cardBack !== savedCardBack) body.cardBack = cardBack
    const savedTableTheme = isTableTheme(patron.tableTheme)
      ? patron.tableTheme
      : null
    if (tableTheme !== savedTableTheme) body.tableTheme = tableTheme
    if (nextVanityCode !== (patron.vanityRoomCode ?? null))
      body.vanityRoomCode = nextVanityCode

    // Client-side slug shape check — the Worker enforces this too, but
    // catching it locally avoids a round trip on a malformed value.
    if (typeof body.slug === 'string' && !SLUG_RE.test(body.slug)) {
      setSlugError(
        'Slug must be 3–24 characters: lowercase letters, digits, and hyphens; not at the ends.',
      )
      setSaving(false)
      return
    }
    // Same shape check for the vanity room code.
    if (
      typeof body.vanityRoomCode === 'string' &&
      !VANITY_CODE_RE.test(body.vanityRoomCode)
    ) {
      setVanityCodeError(
        'Code must be 4–10 characters: uppercase letters or digits.',
      )
      setSaving(false)
      return
    }
    if (typeof body.motto === 'string' && body.motto.length > MOTTO_MAX) {
      // The textarea is capped, but a paste could exceed — still defensive.
      toast.error(`Motto is too long (max ${MOTTO_MAX} chars).`)
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/me/patron', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      if (res.status === 409) {
        setSlugError('That slug is already taken — pick another.')
        setSaving(false)
        return
      }
      if (res.status === 400) {
        // The Worker tells us which field failed (`invalid_slug`,
        // `slug_reserved`, `invalid_motto`, etc.). Surface slug-specific
        // errors inline; everything else falls through to the generic toast.
        try {
          const j = (await res.json()) as { error?: string }
          if (j.error === 'slug_reserved') {
            setSlugError('That slug is reserved — pick another.')
            setSaving(false)
            return
          }
          if (j.error === 'invalid_slug') {
            setSlugError(
              'Slug must be 3–24 characters: lowercase letters, digits, and hyphens; not at the ends.',
            )
            setSaving(false)
            return
          }
        } catch {
          // ignore JSON parse failure — fall through to generic error
        }
      }
      if (!res.ok) throw new Error(`save_failed_${res.status}`)
      const json = (await res.json()) as { patron: PatronStorefront }
      // Re-seed the local snapshot from the server's response so subsequent
      // comparisons against `dirty` are accurate.
      setPatron(json.patron)
      setMotto(json.patron.motto ?? '')
      setSlug(json.patron.slug ?? '')
      setGildedNickname(json.patron.gildedNickname)
      setShimmerBanner(json.patron.shimmerBanner)
      setVictoryFlourish(json.patron.victoryFlourish)
      setCardBack(isCardBack(json.patron.cardBack) ? json.patron.cardBack : null)
      setTableTheme(
        isTableTheme(json.patron.tableTheme) ? json.patron.tableTheme : null,
      )
      setVanityRoomCode(json.patron.vanityRoomCode ?? '')
      // Banner is uploaded via its own endpoint, but the PATCH response
      // still carries the current URL — keep our preview honest.
      setBannerUrl(json.patron.profileImage ?? null)
      toast.success('Patron settings saved.')
    } catch {
      toast.error('Couldn’t save patron settings.')
    } finally {
      setSaving(false)
    }
  }

  // Banner upload — file picker → centre-cropped 1200×240 WebP → POST raw
  // bytes to /api/me/banner. The preview swaps to the freshly-encoded blob
  // URL immediately so the visitor sees the new banner without waiting on
  // the round trip; the server URL takes over after the response.
  async function onPickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked again
    if (!file) return
    setBannerBusy(true)
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file)
      // Centre-crop to 5:1 (BANNER_W : BANNER_H = 1200 : 240). Source either
      // limited by height (wider image) or by width (taller image).
      const sourceAspect = bitmap.width / bitmap.height
      const targetAspect = BANNER_W / BANNER_H
      let sw: number
      let sh: number
      if (sourceAspect > targetAspect) {
        // Source is wider than 5:1 — keep full height, narrow the width.
        sh = bitmap.height
        sw = sh * targetAspect
      } else {
        // Source is taller than 5:1 — keep full width, narrow the height.
        sw = bitmap.width
        sh = sw / targetAspect
      }
      const sx = (bitmap.width - sw) / 2
      const sy = (bitmap.height - sh) / 2
      const canvas = document.createElement('canvas')
      canvas.width = BANNER_W
      canvas.height = BANNER_H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, BANNER_W, BANNER_H)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.85),
      )
      if (!blob) throw new Error('encode')
      const res = await fetch('/api/me/banner', {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      })
      if (res.status === 403) {
        toast.error('Only patrons can upload a custom banner.')
        return
      }
      if (res.status === 413) {
        toast.error('That image is too large after resizing.')
        return
      }
      if (!res.ok) throw new Error(`upload_${res.status}`)
      const json = (await res.json()) as { profileImage: string }
      // Swap to a fresh blob URL for immediate preview; revoke any prior one
      // so we don't leak.
      if (bannerObjectUrlRef.current) {
        URL.revokeObjectURL(bannerObjectUrlRef.current)
      }
      const localUrl = URL.createObjectURL(blob)
      bannerObjectUrlRef.current = localUrl
      // Use the local URL right now; the next /api/me/account fetch (or a
      // page refresh) will replace it with the server-served version.
      setBannerUrl(localUrl)
      // Update the cached patron snapshot so dirty checks behave.
      setPatron((p) => ({ ...p, profileImage: json.profileImage }))
      toast.success('Banner uploaded.')
    } catch {
      toast.error('That image could not be uploaded.')
    } finally {
      bitmap?.close()
      setBannerBusy(false)
    }
  }

  async function onClearBanner() {
    setBannerBusy(true)
    try {
      const res = await fetch('/api/me/banner', { method: 'DELETE' })
      if (!res.ok) throw new Error(`clear_${res.status}`)
      if (bannerObjectUrlRef.current) {
        URL.revokeObjectURL(bannerObjectUrlRef.current)
        bannerObjectUrlRef.current = null
      }
      setBannerUrl(null)
      setPatron((p) => ({ ...p, profileImage: null }))
      toast.success('Banner cleared.')
    } catch {
      toast.error('Could not clear the banner.')
    } finally {
      setBannerBusy(false)
    }
  }

  // Preview displayName under the gilded toggle — uses whatever the user is
  // currently editing, not necessarily what's saved.
  const previewName = 'Your name'

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        {/* Header — title + status. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg tracking-wide">Patronage</h2>
            <PatronBadge
              isPatron={patron.isPatron}
              founderRank={patron.founderRank}
              size="sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {patron.founderRank != null ? (
              <>
                You are{' '}
                <span className="text-gold">
                  Founding patron <Crown className="inline size-3.5" /> {ROMAN[patron.founderRank]}
                </span>
                {patron.patronSince != null &&
                  ` · patron since ${patronSinceLabel(patron.patronSince)}`}
                .
              </>
            ) : (
              <>
                You are a{' '}
                <span className="text-gold">
                  patron <Sparkles className="inline size-3.5" />
                </span>
                {patron.patronSince != null &&
                  ` · patron since ${patronSinceLabel(patron.patronSince)}`}
                . Thank you.
              </>
            )}
          </p>
        </div>

        <div className="h-px w-full bg-border" />

        {/* Profile banner — uploads to /api/me/banner, served from R2.
            The picker accepts any image; the client resizes + center-crops
            to 1200×240 WebP before sending. Clearing removes the R2 object
            and reverts to the preset profileColor backdrop. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Profile banner</span>
            <span className="text-xs text-muted-foreground">
              {bannerUrl ? 'Custom banner set' : 'Using preset colour'}
            </span>
          </div>
          {/* Preview. */}
          <div
            className={cn(
              'relative aspect-[5/1] w-full overflow-hidden rounded-md border',
              bannerUrl
                ? 'border-gold/55'
                : 'border-dashed border-gold/30 bg-gold/[0.03]',
            )}
          >
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-xs tracking-[0.18em] text-muted-foreground uppercase">
                No banner set
              </div>
            )}
            {bannerBusy && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/65 backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-gold" aria-hidden />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={bannerFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickBanner(e)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bannerBusy}
              onClick={() => bannerFileRef.current?.click()}
            >
              <ImagePlus className="mr-1.5 size-3.5" aria-hidden />
              {bannerUrl ? 'Replace banner' : 'Upload banner'}
            </Button>
            {bannerUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={bannerBusy}
                onClick={() => void onClearBanner()}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="mr-1.5 size-3.5" aria-hidden />
                Clear
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Centre-cropped to 5:1, encoded as WebP at 1200×240.
            </p>
          </div>
        </div>

        <div className="h-px w-full bg-border" />

        {/* Motto. */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="patron-motto">
            Motto
            <span className="ml-2 text-xs tracking-wider text-muted-foreground uppercase">
              {motto.length}/{MOTTO_MAX}
            </span>
          </label>
          <Input
            id="patron-motto"
            value={motto}
            onChange={(e) => setMotto(e.target.value.slice(0, MOTTO_MAX))}
            placeholder="A short line displayed under your nickname on your profile."
            maxLength={MOTTO_MAX}
          />
        </div>

        {/* Vanity slug. */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="patron-slug">
            Vanity URL
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              coups.app/u/
            </span>
            <Input
              id="patron-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugError(null)
              }}
              placeholder="your-name"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            3–24 characters; lowercase letters, digits and hyphens. Cleared
            slugs are released back to the pool.
          </p>
          {slugError && (
            <p className="text-xs text-destructive">{slugError}</p>
          )}
        </div>

        {/* Vanity room code. */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="patron-vanity-code">
            Vanity room code
          </label>
          <Input
            id="patron-vanity-code"
            value={vanityRoomCode}
            onChange={(e) => {
              // Force uppercase as the visitor types; the Worker normalises
              // again on save, but doing it here keeps the visible value
              // honest about what gets stored.
              setVanityRoomCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, VANITY_CODE_MAX),
              )
              setVanityCodeError(null)
            }}
            placeholder="e.g. KING5"
            maxLength={VANITY_CODE_MAX}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono tracking-widest uppercase"
          />
          <p className="text-xs text-muted-foreground">
            4–10 uppercase letters or digits. Used as the default code on
            the play hub when you create a private match. Clear to fall back
            to a random code.
          </p>
          {vanityCodeError && (
            <p className="text-xs text-destructive">{vanityCodeError}</p>
          )}
        </div>

        {/* Toggles. */}
        <div className="flex flex-col gap-2">
          <ToggleRow
            label="Gilded nickname"
            description="Render your nickname in gold leaf wherever it appears."
            value={gildedNickname}
            onChange={setGildedNickname}
          />
          <ToggleRow
            label="Living banner"
            description="A gentle shimmer animates across your profile banner."
            value={shimmerBanner}
            onChange={setShimmerBanner}
          />
          <ToggleRow
            label="Victory flourish"
            description="A flourish plays across the table the moment you win."
            value={victoryFlourish}
            onChange={setVictoryFlourish}
          />
        </div>

        {/* Card-back skin picker. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Card back</span>
            <span className="text-xs text-muted-foreground">
              {cardBack ? CARD_BACK_LABEL[cardBack] : 'Default'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Decorates the face-down side of the cards in your hand. The
            in-room view follows in a future release.
          </p>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {/* The "default" tile — equivalent to clearing the override. */}
            <button
              type="button"
              onClick={() => setCardBack(null)}
              aria-pressed={cardBack === null}
              aria-label="Default card back"
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
                cardBack === null
                  ? 'border-gold/70 bg-gold/10'
                  : 'border-border hover:border-gold/40',
              )}
            >
              {/* A bare dashed swatch to denote "default / no override". */}
              <span
                aria-hidden
                className="flex aspect-3/4 w-full items-center justify-center rounded-sm border border-dashed border-gold/35 text-[10px] tracking-widest text-muted-foreground uppercase"
              >
                Default
              </span>
            </button>
            {CARD_BACK_SKINS.map((skin) => (
              <button
                key={skin}
                type="button"
                onClick={() => setCardBack(skin)}
                aria-pressed={cardBack === skin}
                aria-label={`Card back: ${CARD_BACK_LABEL[skin]}`}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
                  cardBack === skin
                    ? 'border-gold/70 bg-gold/10'
                    : 'border-border hover:border-gold/40',
                )}
              >
                <CardBackPreview skin={skin} selected={cardBack === skin} />
                <span className="text-[10px] tracking-wide text-muted-foreground">
                  {CARD_BACK_LABEL[skin]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table theme picker. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Table theme</span>
            <span className="text-xs text-muted-foreground">
              {tableTheme ? TABLE_THEME_LABEL[tableTheme] : 'Default'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Sets the felt and ornament colors when you host a private room.
            The in-room view follows in a future release.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setTableTheme(null)}
              aria-pressed={tableTheme === null}
              aria-label="Default table theme"
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
                tableTheme === null
                  ? 'border-gold/70 bg-gold/10'
                  : 'border-border hover:border-gold/40',
              )}
            >
              <span
                aria-hidden
                className="flex aspect-4/3 w-full items-center justify-center rounded-sm border border-dashed border-gold/35 text-[10px] tracking-widest text-muted-foreground uppercase"
              >
                Default
              </span>
            </button>
            {TABLE_THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => setTableTheme(theme)}
                aria-pressed={tableTheme === theme}
                aria-label={`Table theme: ${TABLE_THEME_LABEL[theme]}`}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
                  tableTheme === theme
                    ? 'border-gold/70 bg-gold/10'
                    : 'border-border hover:border-gold/40',
                )}
              >
                <TableThemePreview
                  theme={theme}
                  selected={tableTheme === theme}
                />
                <span className="text-[10px] tracking-wide text-muted-foreground">
                  {TABLE_THEME_LABEL[theme]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Live preview — your gilded name with the patron badge. */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-gold/30 bg-card/40 px-3 py-2.5 text-sm">
          <span className="text-xs tracking-wider text-muted-foreground uppercase">
            Preview
          </span>
          <span className="flex items-center gap-1.5 font-display">
            <GildedName name={previewName} gilded={gildedNickname} />
            <PatronBadge
              isPatron={patron.isPatron}
              founderRank={patron.founderRank}
              size="sm"
            />
          </span>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="mr-1.5 size-3.5" aria-hidden />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
