"use client";
import { cn } from "@/lib/utils";
import { motionAllowed } from "@/components/motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

interface NavbarProps {
  children: React.ReactNode;
  className?: string;
}

interface NavBodyProps {
  children: React.ReactNode;
  className?: string;
  visible?: boolean;
}

interface NavItemsProps {
  items: {
    name: string;
    link: string;
  }[];
  className?: string;
  activeLink?: string;
  onItemClick?: () => void;
}

interface MobileNavProps {
  children: React.ReactNode;
  className?: string;
  visible?: boolean;
}

interface MobileNavHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface MobileNavMenuProps {
  children: React.ReactNode;
  className?: string;
  isOpen: boolean;
}

// Frosted "scrolled" surface shared by NavBody + MobileNav — a faint gold court
// rule over translucent parchment (references/design-system.md). backdrop-blur
// is a discrete class toggle, never a tween — SKILL.md § 5 bans animating blur
// (mobile WebView repaint cost). GSAP animates geometry only; the background
// eases via transition-colors.
const SCROLLED_SURFACE =
  "border border-gold/30 bg-background/80 shadow-lg backdrop-blur-[10px]";

// How far the page must scroll before the bar compacts (px). Kept low so the
// bar shrinks almost immediately on any scroll — the Navbar is `fixed`, so at
// the wide state it overlays page content; leaving it wide for too long lets
// it sit on top of section headers as the visitor scrolls in.
const SCROLL_THRESHOLD_PX = 15;

export const Navbar = ({ children, className }: NavbarProps) => {
  const [visible, setVisible] = useState<boolean>(false);

  // Replaces motion's useScroll + useMotionValueEvent: switch to the compact
  // "scrolled" state once the window passes SCROLL_THRESHOLD_PX (defined above).
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SCROLL_THRESHOLD_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // `fixed`, not `sticky`: the bar overlays page content instead of
    // occupying flow space, so the landing hero starts flush at the top of
    // the viewport with no dead scroll band above it. Non-home (site) pages
    // pad their top to clear the overlapping bar.
    <div className={cn("fixed inset-x-0 top-0 z-40 w-full", className)}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ visible?: boolean }>,
              { visible },
            )
          : child,
      )}
    </div>
  );
};

export const NavBody = ({ children, className, visible }: NavBodyProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const target = { width: visible ? "40%" : "100%", y: visible ? 20 : 0 };
      if (!motionAllowed()) {
        gsap.set(el, target);
        return;
      }
      gsap.to(el, { ...target, duration: 0.4, ease: "power2.out" });
    },
    { dependencies: [visible], scope: ref },
  );

  return (
    <div
      ref={ref}
      style={{
        minWidth: "800px",
      }}
      className={cn(
        "relative z-60 mx-auto hidden w-full max-w-7xl flex-row items-center justify-between self-start rounded-full bg-transparent px-4 py-2 transition-colors duration-200 lg:flex",
        visible && SCROLLED_SURFACE,
        className,
      )}
    >
      {children}
    </div>
  );
};

export const NavItems = ({
  items,
  className,
  activeLink,
  onItemClick,
}: NavItemsProps) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Replaces motion's `layoutId` shared-layout animation: one persistent pill
  // is measured against the hovered link and GSAP-tweened to track it.
  useGSAP(
    () => {
      const pill = pillRef.current;
      const container = containerRef.current;
      if (!pill || !container) return;

      if (hovered === null) {
        if (!motionAllowed()) {
          gsap.set(pill, { autoAlpha: 0 });
          return;
        }
        gsap.to(pill, { autoAlpha: 0, duration: 0.15, ease: "power2.out" });
        return;
      }

      const item = itemRefs.current[hovered];
      if (!item) return;
      const c = container.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      const box = {
        x: r.left - c.left,
        y: r.top - c.top,
        width: r.width,
        height: r.height,
      };

      if (!motionAllowed()) {
        gsap.set(pill, { ...box, autoAlpha: 1 });
        return;
      }
      // Already on screen → slide/morph to the new link. Hidden → place it
      // first, then fade in (matches motion's first-mount layout behavior).
      if ((gsap.getProperty(pill, "opacity") as number) > 0) {
        gsap.to(pill, {
          ...box,
          autoAlpha: 1,
          duration: 0.3,
          ease: "power2.out",
        });
      } else {
        gsap.set(pill, box);
        gsap.to(pill, { autoAlpha: 1, duration: 0.2, ease: "power2.out" });
      }
    },
    { dependencies: [hovered], scope: containerRef },
  );

  return (
    <div
      ref={containerRef}
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "absolute inset-0 hidden flex-1 flex-row items-center justify-center space-x-2 text-sm font-medium lg:flex lg:space-x-2",
        className,
      )}
    >
      <div
        ref={pillRef}
        aria-hidden
        className="invisible absolute left-0 top-0 rounded-full bg-accent opacity-0"
      />
      {items.map((item, idx) => (
        <Link
          ref={(el) => {
            itemRefs.current[idx] = el;
          }}
          onMouseEnter={() => setHovered(idx)}
          onClick={onItemClick}
          aria-current={item.link === activeLink ? "page" : undefined}
          className={cn(
            "relative px-4 py-2 transition-colors",
            item.link === activeLink
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          key={item.link}
          href={item.link}
        >
          <span className="relative z-20">{item.name}</span>
        </Link>
      ))}
    </div>
  );
};

export const MobileNav = ({ children, className, visible }: MobileNavProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const target = {
        width: visible ? "90%" : "100%",
        paddingLeft: visible ? "12px" : "0px",
        paddingRight: visible ? "12px" : "0px",
        borderRadius: visible ? "4px" : "2rem",
        y: visible ? 20 : 0,
      };
      if (!motionAllowed()) {
        gsap.set(el, target);
        return;
      }
      gsap.to(el, { ...target, duration: 0.4, ease: "power2.out" });
    },
    { dependencies: [visible], scope: ref },
  );

  return (
    <div
      ref={ref}
      className={cn(
        "relative z-50 mx-auto flex w-full max-w-[calc(100vw-2rem)] flex-col items-center justify-between rounded-4xl bg-transparent px-0 py-2 transition-colors duration-200 lg:hidden",
        visible && SCROLLED_SURFACE,
        className,
      )}
    >
      {children}
    </div>
  );
};

export const MobileNavHeader = ({
  children,
  className,
}: MobileNavHeaderProps) => {
  return (
    <div
      className={cn(
        "flex w-full flex-row items-center justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const MobileNavMenu = ({
  children,
  className,
  isOpen,
}: MobileNavMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);

  // Replaces motion's AnimatePresence: the panel stays mounted and toggles via
  // GSAP autoAlpha (opacity + visibility) so it is non-interactive and out of
  // the a11y tree while closed.
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const target = { autoAlpha: isOpen ? 1 : 0 };
      if (!motionAllowed()) {
        gsap.set(el, target);
        return;
      }
      gsap.to(el, { ...target, duration: 0.2, ease: "power2.out" });
    },
    { dependencies: [isOpen], scope: ref },
  );

  return (
    <div
      ref={ref}
      className={cn(
        "invisible absolute inset-x-0 top-16 z-50 flex w-full flex-col items-start justify-start gap-4 rounded-lg border border-gold/30 bg-background px-4 py-8 opacity-0 shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const MobileNavToggle = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close menu" : "Open menu"}
      aria-expanded={isOpen}
      className="text-foreground"
    >
      {isOpen ? <X /> : <Menu />}
    </button>
  );
};
