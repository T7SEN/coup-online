'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DISPLAY_NAME_MAX,
  displayNameErrorMessage,
  validateDisplayName,
} from '@coup-online/protocol'
import { GildedName } from '@/components/gilded-name'
import { PatronBadge } from '@/components/patron-badge'
import { VanitySlugChip } from '@/components/vanity-slug-chip'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  bannerLatticeImage,
  PROFILE_COLORS,
  resolveProfileColor,
} from '@/lib/profile-colors'

// The profile crest — a banner card. A solid-color banner strip (the user's
// chosen `profileColor`) sits up top with the avatar straddling its lower
// edge; nickname, rank and rating sit on the card body below. Editing is
// inline, no dialog: hover the avatar for a pin → click opens the file
// picker; hover the name for an underline + pin → click swaps it for an
// input; hover the banner for a pin → click opens the color palette.
//
// The avatar is resized and centre-cropped to a 256×256 WebP in the browser
// (canvas) before upload, so the payload is a few KB and the Worker needs no
// image processing. All writes hit /api/me/* — proxied to the Worker by
// next.config.ts's rewrites, so the Better Auth session cookie travels along.
//
// `profileImage` is groundwork for a future supporter perk (a custom banner
// image); it's null for everyone today, but when set it renders over the
// preset color.

const AVATAR_PX = 256

interface ProfileCrestProps {
  displayName: string
  image: string | null
  rank: number
  rating: number
  profileColor: string
  profileImage: string | null
  isPatron: boolean
  founderRank: number | null
  gildedNickname: boolean
  motto: string | null
  slug: string | null
  shimmerBanner: boolean
}

export function ProfileCrest({
  displayName,
  image: initialImage,
  rank,
  rating,
  profileColor: initialColor,
  profileImage,
  isPatron,
  founderRank,
  gildedNickname,
  motto,
  slug,
  shimmerBanner,
}: ProfileCrestProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  // Local, optimistic state — seeded from the server props, updated on a
  // successful save. router.refresh() then re-syncs the rest of the page.
  const [name, setName] = useState(displayName)
  const [image, setImage] = useState(initialImage)
  const [color, setColor] = useState(initialColor)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)
  const [colorOpen, setColorOpen] = useState(false)

  const [avatarBusy, setAvatarBusy] = useState(false)
  const [nameBusy, setNameBusy] = useState(false)
  const [colorBusy, setColorBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preset = resolveProfileColor(color)

  // Avatar preview object URL — revoked when replaced / on unmount.
  const previewRef = useRef<string | null>(null)
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked again
    if (!file) return
    setError(null)
    setAvatarBusy(true)
    try {
      // Centre-crop the largest square, then scale to AVATAR_PX, encode WebP.
      const bitmap = await createImageBitmap(file)
      const side = Math.min(bitmap.width, bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = AVATAR_PX
      canvas.height = AVATAR_PX
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        bitmap.close()
        throw new Error('canvas')
      }
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_PX,
        AVATAR_PX,
      )
      bitmap.close()
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.85),
      )
      if (!blob) throw new Error('encode')

      const res = await fetch('/api/me/avatar', {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      })
      if (!res.ok) throw new Error('upload')

      // Show the freshly cropped blob immediately; the stored R2 URL takes
      // over on the next render after router.refresh().
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
      previewRef.current = URL.createObjectURL(blob)
      setImage(previewRef.current)
      router.refresh()
    } catch {
      setError('That image could not be uploaded.')
    } finally {
      setAvatarBusy(false)
    }
  }

  function startNameEdit() {
    setNameDraft(name)
    setError(null)
    setEditingName(true)
  }

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (trimmed === name) {
      setEditingName(false)
      return
    }
    // Length / allowed-characters / profanity check — the Worker re-runs the
    // same `validateDisplayName` server-side as the authority.
    const check = validateDisplayName(trimmed)
    if (!check.ok && check.error) {
      setError(displayNameErrorMessage(check.error))
      return
    }
    setNameBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      })
      if (!res.ok) throw new Error('name')
      setName(trimmed)
      setEditingName(false)
      router.refresh()
    } catch {
      setError('Could not save your nickname.')
    } finally {
      setNameBusy(false)
    }
  }

  async function pickColor(key: string) {
    if (key === color) {
      setColorOpen(false)
      return
    }
    setColorBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileColor: key }),
      })
      if (!res.ok) throw new Error('color')
      setColor(key)
      setColorOpen(false)
      router.refresh()
    } catch {
      setError('Could not change your banner color.')
    } finally {
      setColorBusy(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gold/40 shadow-md">
      {/* Banner — the profile background. */}
      <div
        className="group/banner relative h-28 sm:h-32"
        style={profileImage ? undefined : { background: preset.banner }}
      >
        {/* Supporter-perk custom banner image — null for everyone today. */}
        {profileImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profileImage}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        )}
        {/* Damask diamond weave — gives the banner an even woven texture
            instead of a flat fill, so it never reads as empty. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: bannerLatticeImage(preset) }}
        />

        {/* Soft sheen so the banner reads as a lit surface. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_25%_-20%,rgba(255,255,255,0.28),transparent_70%)]" />

        {/* Living banner — the gold-shimmer perk. CSS keyframe in
            globals.css; honours `prefers-reduced-motion` via `motion-safe`. */}
        {shimmerBanner && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full opacity-0 bg-gradient-to-r from-transparent via-[oklch(0.86_0.14_84_/_0.35)] to-transparent motion-safe:animate-[banner-shimmer_6.5s_linear_infinite]"
          />
        )}

        {/* Banner edit pin — opens the color palette. */}
        <button
          type="button"
          onClick={() => setColorOpen((o) => !o)}
          aria-label="Change banner color"
          aria-expanded={colorOpen}
          className={cn(
            'absolute right-3 top-3 z-20 flex size-8 items-center justify-center rounded-full border border-border bg-background/85 text-foreground shadow-sm backdrop-blur transition',
            'cursor-pointer hover:bg-background',
            'opacity-0 focus-visible:opacity-100 group-hover/banner:opacity-100',
            colorOpen && 'opacity-100',
          )}
        >
          {colorBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Pencil className="size-4" />
          )}
        </button>

        {/* Color palette popover. */}
        {colorOpen && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setColorOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <div
              role="dialog"
              aria-label="Banner color"
              className="absolute right-3 top-12 z-40 flex flex-col gap-2.5 rounded-lg border border-border bg-popover p-3 shadow-lg"
            >
              <span className="text-xs font-medium tracking-wide text-muted-foreground">
                Banner color
              </span>
              <div className="grid grid-cols-3 gap-2">
                {PROFILE_COLORS.map((c) => {
                  const selected = c.key === color
                  return (
                    <button
                      key={c.key}
                      type="button"
                      title={c.label}
                      aria-label={c.label}
                      aria-pressed={selected}
                      disabled={colorBusy}
                      onClick={() => void pickColor(c.key)}
                      style={{ background: c.banner }}
                      className={cn(
                        'size-9 rounded-full border border-black/10 transition',
                        'cursor-pointer hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60',
                        selected &&
                          'ring-2 ring-gold ring-offset-2 ring-offset-popover',
                      )}
                    >
                      {selected && (
                        <Check className="mx-auto size-4 text-white drop-shadow" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Avatar — straddles the banner's lower-left edge. */}
        <div className="absolute bottom-0 left-6 z-10 translate-y-1/2 sm:left-8">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            aria-label="Change avatar"
            className="group/avatar relative block rounded-full disabled:cursor-not-allowed"
          >
            <Avatar className="size-24 border-2 border-gold/60 ring-4 ring-card">
              <AvatarImage src={image ?? undefined} alt="" />
              <AvatarFallback className="text-2xl">
                {name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white transition',
                avatarBusy
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100',
              )}
            >
              {avatarBusy ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <Pencil className="size-6" />
              )}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e)}
          />
        </div>
      </div>

      {/* Card body — identity on the left, rating on the right, so the wide
          card reads as a banner rather than a centred square. */}
      <div className="bg-card">
        <div className="flex items-center justify-between gap-4 px-6 pt-16 pb-6 sm:px-8">
          {/* Identity — nickname + rank. */}
          <div className="flex min-w-0 flex-col items-start gap-2">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  dir="auto"
                  maxLength={DISPLAY_NAME_MAX}
                  value={nameDraft}
                  disabled={nameBusy}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveName()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  placeholder="Your court name"
                  className="h-9 w-40 font-display text-lg sm:w-52"
                />
                <button
                  type="button"
                  onClick={() => void saveName()}
                  disabled={nameBusy}
                  aria-label="Save nickname"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-gold/40 bg-gold/10 text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {nameBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(false)}
                  disabled={nameBusy}
                  aria-label="Cancel"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={startNameEdit}
                  aria-label="Edit nickname"
                  className="group/name relative inline-flex cursor-pointer items-center"
                >
                  <h1
                    className={cn(
                      'border-b-2 border-transparent pb-0.5 font-display text-2xl tracking-wide transition-colors group-hover/name:border-gold/50 sm:text-3xl',
                    )}
                  >
                    <GildedName
                      name={name}
                      gilded={gildedNickname}
                      dir="auto"
                    />
                  </h1>
                  <Pencil className="pointer-events-none absolute left-full ml-2 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100" />
                </button>
                <PatronBadge
                  isPatron={isPatron}
                  founderRank={founderRank}
                  size="sm"
                />
              </div>
            )}

            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 text-xs font-medium tracking-wide text-gold">
              Ranked #{rank}
            </span>
            {motto && motto.trim().length > 0 && (
              <p
                dir="auto"
                className="text-sm text-muted-foreground italic"
              >
                &ldquo;{motto}&rdquo;
              </p>
            )}
            {slug && slug.length > 0 && <VanitySlugChip slug={slug} />}
          </div>

          {/* Rating. */}
          <div className="flex shrink-0 flex-col items-center border-l border-gold/25 pl-4 sm:pl-8">
            <span className="font-display text-4xl tabular-nums text-primary sm:text-5xl">
              {rating}
            </span>
            <span className="text-xs tracking-widest text-muted-foreground uppercase">
              Rating
            </span>
          </div>
        </div>

        {error && (
          <p className="px-6 pb-4 text-xs text-destructive sm:px-8">{error}</p>
        )}
      </div>
    </div>
  )
}
