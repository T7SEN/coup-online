// Ornamental gold rule — a tapered line with a centre lozenge and end dots.
// Renders in `currentColor`; set the colour with a `text-*` class. The baked-in
// `data-ornament` hook lets a section's entrance animation target it — each
// section's GSAP selector is scoped to its own section, so the name is safely
// shared. Used by the landing-page sections (hero, how-it-plays).
export function OrnamentDivider({ className }: { className?: string }) {
  return (
    <svg
      data-ornament
      viewBox="0 0 220 14"
      fill="none"
      role="presentation"
      aria-hidden
      className={className}
    >
      <path d="M2 7H92" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M128 7H218" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M110 1L116 7L110 13L104 7Z" fill="currentColor" />
      <circle cx="98" cy="7" r="2" fill="currentColor" />
      <circle cx="122" cy="7" r="2" fill="currentColor" />
      <circle cx="2" cy="7" r="1.5" fill="currentColor" />
      <circle cx="218" cy="7" r="1.5" fill="currentColor" />
    </svg>
  )
}
