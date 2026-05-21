import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GildedName } from '@/components/gilded-name'
import { PatronBadge } from '@/components/patron-badge'
import { VanitySlugChip } from '@/components/vanity-slug-chip'
import { bannerLatticeImage, resolveProfileColor } from '@/lib/profile-colors'

// Read-only profile crest — the banner card on a player's public profile
// ([userId]/page.tsx). Visually identical to the editable crest
// (./profile-crest.tsx) but a plain Server Component: no inline-edit
// affordances, no client JavaScript.
//
// Patron treatment:
//   • If `gildedNickname` is set, the displayName renders in gold leaf via
//     <GildedName>.
//   • If `isPatron` or `founderRank` is set, <PatronBadge> shows the crest
//     beside the name (founder crown + Roman numeral, or the supporter
//     badge for non-founders).
//   • If `motto` is non-empty, it renders as a short italic line under the
//     "Ranked #N" chip.

interface ProfileCrestViewProps {
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

export function ProfileCrestView({
  displayName,
  image,
  rank,
  rating,
  profileColor,
  profileImage,
  isPatron,
  founderRank,
  gildedNickname,
  motto,
  slug,
  shimmerBanner,
}: ProfileCrestViewProps) {
  const preset = resolveProfileColor(profileColor)

  return (
    <div className="overflow-hidden rounded-xl border border-gold/40 shadow-md">
      {/* Banner — the profile background. */}
      <div
        className="relative h-28 sm:h-32"
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
        {/* Damask diamond weave + lit sheen. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: bannerLatticeImage(preset) }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_25%_-20%,rgba(255,255,255,0.28),transparent_70%)]" />

        {/* Living banner — a gentle gold shimmer that travels across the
            banner forever when the patron has the perk enabled. Pure CSS
            keyframe (`banner-shimmer` in globals.css). `linear` travel +
            opacity fade-in/out at the keyframe boundaries hide the loop
            wrap-around. */}
        {shimmerBanner && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full opacity-0 bg-gradient-to-r from-transparent via-[oklch(0.86_0.14_84_/_0.35)] to-transparent motion-safe:animate-[banner-shimmer_6.5s_linear_infinite]"
          />
        )}

        {/* Avatar — straddles the banner's lower-left edge. */}
        <div className="absolute bottom-0 left-6 translate-y-1/2 sm:left-8">
          <Avatar className="size-24 border-2 border-gold/60 ring-4 ring-card">
            <AvatarImage src={image ?? undefined} alt="" />
            <AvatarFallback className="text-2xl">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Card body — identity on the left, rating on the right. */}
      <div className="flex items-center justify-between gap-4 bg-card px-6 pt-16 pb-6 sm:px-8">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl tracking-wide sm:text-3xl">
            <GildedName name={displayName} gilded={gildedNickname} dir="auto" />
            <PatronBadge
              isPatron={isPatron}
              founderRank={founderRank}
              size="sm"
            />
          </h1>
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

        <div className="flex shrink-0 flex-col items-center border-l border-gold/25 pl-4 sm:pl-8">
          <span className="font-display text-4xl tabular-nums text-primary sm:text-5xl">
            {rating}
          </span>
          <span className="text-xs tracking-widest text-muted-foreground uppercase">
            Rating
          </span>
        </div>
      </div>
    </div>
  )
}
