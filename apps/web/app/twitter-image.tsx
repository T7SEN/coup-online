// Twitter card image — Twitter's `summary_large_image` card uses the same
// 1200×630 aspect we generate for Open Graph. Re-export the OG image so
// there's a single source of truth: change the design in
// opengraph-image.tsx and Twitter shares update too.

export { default, alt, size, contentType } from './opengraph-image'
