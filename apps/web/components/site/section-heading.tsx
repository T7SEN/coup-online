// Centred kicker + display title + a short gold rule. Shared by the landing
// page sections (How it plays, The court). Pure presentational — no client
// directive needed; it renders inside whichever section imports it.
export function SectionHeading({
  kicker,
  title,
}: {
  kicker: string
  title: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
        {kicker}
      </p>
      <h2 className="font-display text-2xl tracking-wide sm:text-3xl">
        {title}
      </h2>
      <div className="mt-1 h-px w-16 bg-gold/50" />
    </div>
  )
}
