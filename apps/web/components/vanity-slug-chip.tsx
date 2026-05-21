'use client'

import { useCallback, useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// VanitySlugChip — a small gold-bordered pill rendered beside the patron's
// motto on their profile crest. Shows the canonical vanity URL and copies
// the full link to clipboard on click. The icon swaps to a check for a
// beat after a successful copy.
//
// The displayed text always uses the canonical brand domain (coups.app); the
// clipboard receives the same canonical https://… URL even in dev. That
// keeps the chip visually stable across environments — the patron is
// sharing a link meant for production.

const CANONICAL_DOMAIN = 'coups.app'
const COPIED_RESET_MS = 1400

export function VanitySlugChip({
  slug,
  className,
}: {
  slug: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    const url = `https://${CANONICAL_DOMAIN}/u/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      // Clipboard permission denied or unsupported — silent fall-through.
    }
  }, [slug])

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label={copied ? 'Vanity URL copied' : `Copy ${CANONICAL_DOMAIN}/u/${slug}`}
      title="Copy your vanity URL"
      className={cn(
        'group inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-gold/40 bg-gold/[0.06] px-2.5 py-1 font-mono text-xs transition-colors hover:border-gold/70 hover:bg-gold/[0.12] focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:outline-none',
        className,
      )}
    >
      {copied ? (
        <Check className="size-3 text-gold" aria-hidden />
      ) : (
        <Link2
          className="size-3 text-gold/70 transition-colors group-hover:text-gold"
          aria-hidden
        />
      )}
      <span className="text-muted-foreground">{CANONICAL_DOMAIN}/u/</span>
      <span className="text-gold">{slug}</span>
      {copied && (
        <span className="tracking-wide text-gold/85 italic">copied</span>
      )}
    </button>
  )
}
