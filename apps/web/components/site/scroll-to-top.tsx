'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { motionAllowed } from '@/components/motion'
import { cn } from '@/lib/utils'

// Floating "scroll to top" control, shared by every (site) page — it is
// mounted once in the route-group layout. Fixed bottom-right; fades in once
// the viewport has scrolled past 200px and fades back out near the top.
// Smooth scroll unless the visitor asked for reduced motion — a JS-specified
// `behavior` overrides the CSS `scroll-behavior`, so we gate it on
// motionAllowed() ourselves. While hidden it is non-interactive and out of
// the focus + a11y trees. references/design-system.md.
export function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 200)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: motionAllowed() ? 'smooth' : 'auto',
        })
      }
      className={cn(
        'fixed right-6 bottom-6 z-40 flex size-11 cursor-pointer items-center justify-center',
        'rounded-full border border-gold/30 bg-background/80 text-foreground',
        'shadow-lg backdrop-blur-[10px] transition duration-200',
        'hover:-translate-y-0.5 hover:border-gold/60 hover:text-gold',
        'focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:outline-none',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  )
}
