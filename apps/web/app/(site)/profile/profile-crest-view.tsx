import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { bannerLatticeImage, resolveProfileColor } from '@/lib/profile-colors'

// Read-only profile crest — the banner card on a player's public profile
// ([userId]/page.tsx). Visually identical to the editable crest
// (./profile-crest.tsx) but a plain Server Component: no inline-edit
// affordances, no client JavaScript.

interface ProfileCrestViewProps {
  displayName: string
  image: string | null
  rank: number
  rating: number
  profileColor: string
  profileImage: string | null
}

export function ProfileCrestView({
  displayName,
  image,
  rank,
  rating,
  profileColor,
  profileImage,
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
          <h1
            dir="auto"
            className="font-display text-2xl tracking-wide sm:text-3xl"
          >
            {displayName}
          </h1>
          <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 text-xs font-medium tracking-wide text-gold">
            Ranked #{rank}
          </span>
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
