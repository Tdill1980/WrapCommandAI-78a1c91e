# WePrintWraps.com — Phase 1 SEO Audit & Backup Reference

**Audit Date:** 2026-02-12
**Site:** https://weprintwraps.com
**Platform:** WordPress + WooCommerce + Elementor
**CDN/Security:** Cloudflare (WAF blocks automated crawlers — robots.txt and raw HTML inaccessible via fetch)
**Business Model:** B2B Wholesale Vehicle Wrap Printing
**Revenue:** ~$200K/month | 20% margins | ~$500 AOV | ~300 visits/day

---

## 1. BACKUP REFERENCE

### 1.1 Current Meta Titles and Descriptions (Top Pages from Google Index)

| Page | Title Tag | Notes |
|------|-----------|-------|
| **Homepage** | "Custom Vinyl Car Wrap Design and Printing \| WePrintWraps" | Missing "wholesale" — reads consumer-facing |
| **About** | "Vinyl Vehicle Wrap Company \| Wholesale Vinyl Wrap — We Print Wraps" | Good — includes "wholesale" |
| **Products** | "Best Van Wrap Designs \| Vinyl Wrap Shop near me" | BAD — "near me" is consumer/local, not B2B. "Van" is too narrow |
| **Contact** | "Contact Us \| Car Wrap Printing Company \| We Print Wraps" | OK but generic |
| **Avery 1105** | "Avery 1105 Printed Wrap Film \| Wholesale Vehicle Wraps" | Good — keyword-rich |
| **3M IJ180** | "3M IJ180 Printed Wrap Film \| Wholesale Vehicle Wraps" | Good — keyword-rich |
| **Fade Wraps** | "Custom Fade Wrap Printing \| Wholesale 3M & Avery Vehicle Wraps" | Good |
| **FAQs** | "FAQs \| We Print Wraps" | Weak — no keywords |
| **How to Order** | "How to Order \| How to get a Vehicle Wrap Designed & Printed" | OK |
| **Custom Design** | "Custom Graphics Design Services for Car Wraps \| We Print Wraps" | Missing "wholesale" |
| **Wraps Category** | "Wraps – We Print Wraps" | Very weak — no keywords |
| **Fleet Services** | "Fleet Wrap Services - We Print Wraps" | Good but could be stronger |
| **Blog** | "Blogs – We Print Wraps" | Weak |
| **Hourly Design** | "Rates and Pricing \| Custom Graphics Design Services \| We Print Wraps" | OK |
| **Window Perf** | "Perforated Window Vinyl 50/50 Unlaminated \| Vinyl Window Graphics" | Missing brand/wholesale keywords |
| **WBTY** | "Wrap By the Yard Wicked & Wild Wrap Prints 60\" \| We Print Wraps" | OK |
| **Design Services Cat** | "Design Services – We Print Wraps" | Weak |
| **Gallery** | "Wholesale Wrap Gallery \| We Print Wraps" | Good |
| **Terms** | "Terms and Conditions \| Our Wrap Company Policy" | N/A |
| **Wrap Institute** | "The Wrap Institute \| We Print Wraps" | N/A |

### 1.2 Detected Meta Descriptions (from SERP Snippets)

| Page | Snippet |
|------|---------|
| **Homepage** | "Printed in 1-2 Business Days. Free Shipping Over $750. Designed for Installers. Ships Nationwide in 3 Days or Less. Works on 3M & Avery Film." |
| **About** | "With a combined twenty years in the car wrap printing industry, we started offering wholesale car wrap printing to local vehicle wrap installers." |
| **FAQs** | "Print production turnaround is 1-2 business days once files are received. All orders over $500 get free shipping." |

### 1.3 Technology Stack

| Component | Technology |
|-----------|-----------|
| CMS | WordPress.org |
| eCommerce | WooCommerce |
| Page Builder | Elementor |
| Language | PHP |
| CDN/WAF | Cloudflare |
| Analytics | Google Analytics (assumed, standard for WooCommerce) |
| SEO Plugin | Unknown — needs manual check (likely Yoast or Rank Math based on meta tag format) |
| Loyalty | WPLoyalty (wlr-* coupons detected in codebase) |

### 1.4 Indexed Pages (from Google `site:` search)

Approximately 40-60 pages indexed based on search results, including:
- Homepage, About, Contact, FAQs, How to Order, Terms
- ~8-10 product pages (Avery 1105, 3M IJ180, Fade Wraps, Window Perf, WBTY, Custom Design, Hourly Design, etc.)
- 2 product category pages (Wraps, Design Services)
- ~10-15 blog posts
- Fleet Services, Gallery, Wrap Institute
- Several blog/business articles

### 1.5 robots.txt and sitemap.xml

**Status: UNABLE TO VERIFY DIRECTLY** — Cloudflare WAF returns 403 on automated fetches. Manual verification required.

**What needs checking manually:**
- [ ] Does robots.txt exist and is it configured correctly?
- [ ] Is `sitemap_index.xml` or `sitemap.xml` present?
- [ ] Are sitemaps submitted to Google Search Console?
- [ ] Are cart, checkout, my-account pages blocked in robots.txt?

### 1.6 Free Shipping Threshold Discrepancy

| Location | Stated Threshold |
|----------|-----------------|
| Homepage | $750 |
| Navigation bar | $750 |
| Terms & Conditions | $750 |
| About page | $750 |
| **FAQ page** | **$500** |
| **DesignShop (code)** | **$500** |
| **Chat agents (code)** | **$750** |

**CONFLICT:** FAQ says $500, everywhere else says $750. This is confusing customers and needs to be unified.

---

## 2. FULL TECHNICAL SEO AUDIT

### 2.1 CRAWLABILITY & INDEXING

| Check | Status | Finding |
|-------|--------|---------|
| robots.txt | NEEDS MANUAL CHECK | Cloudflare blocks automated access. Must verify manually. |
| XML sitemap | NEEDS MANUAL CHECK | No sitemap URL discoverable via search. Check wp-admin → Yoast/Rank Math settings. |
| WooCommerce products indexed? | PARTIAL | Only ~8-10 product pages found in Google index out of 39+ products in WooCommerce. Many products NOT indexed. |
| Orphan pages? | LIKELY YES | Several product pages have no internal links from homepage or navigation (e.g., InkFusion, individual WBTY patterns, DesignPanelPro packs). |
| Canonical URL strategy? | UNKNOWN | Needs manual source code inspection. WooCommerce often has duplicate product URLs (product/ vs our-products/). |
| Noindex on wrong pages? | NEEDS CHECK | Cart, checkout, my-account should be noindexed. Product pages must NOT be noindexed. |
| URL structure | MIXED | Products use `/our-products/slug` (good, clean). Category uses `/product-category/wraps/` (WooCommerce default — not ideal). Blog posts use root-level slugs (no `/blog/` prefix — messy). |

### 2.2 ON-PAGE SEO

| Check | Status | Finding |
|-------|--------|---------|
| Homepage title | NEEDS WORK | "Custom Vinyl Car Wrap Design and Printing \| WePrintWraps" — Missing **wholesale**, **B2B**, **installer**. Reads consumer-facing. |
| Homepage meta description | DECENT | Mentions installers, free shipping, 1-2 day printing. But doesn't say "wholesale" explicitly. |
| Product page titles | MIXED | Avery/3M pages are good ("Wholesale Vehicle Wraps"). Window Perf, WBTY miss wholesale keywords. |
| Product meta descriptions | UNKNOWN | Need manual check. WooCommerce auto-generates if not set — likely weak. |
| H1 tags | NEEDS CHECK | Elementor sites often have multiple H1s or missing H1s. Manual check required. |
| Image alt tags | LIKELY POOR | WooCommerce + Elementor sites are notorious for missing alt tags. Manual audit needed. |
| Internal linking | POOR | Products page (`/our-products/`) title says "Best Van Wrap Designs \| Vinyl Wrap Shop near me" — not linked strategically from homepage for SEO. Category pages are thin. |
| Blog optimization | POOR | Blog posts are mostly 2021-2023 era, no recent keyword-targeted content. Titles are generic, not targeting long-tail keywords. No apparent blog content calendar. |
| URL structure | NEEDS WORK | Blog posts use root-level slugs without `/blog/` prefix, mixing with page URLs. |

### 2.3 TECHNICAL PERFORMANCE

| Check | Status | Finding |
|-------|--------|---------|
| Page load speed | NEEDS LIVE TEST | Cloudflare blocks PageSpeed Insights fetch. Run manually at pagespeed.web.dev. Elementor sites typically score 30-50 on mobile. |
| Image optimization | LIKELY POOR | Elementor sites are notorious for uncompressed images. Hero images, product photos likely bloated. |
| Lazy loading | LIKELY YES | WordPress 5.5+ includes native lazy loading. Elementor may override. |
| Render-blocking CSS/JS | LIKELY YES | Elementor loads 200-500KB of CSS and multiple JS files. Common performance issue. |
| Mobile responsive | LIKELY YES | Elementor themes are responsive by default. Viewport meta tag should be present. |
| HTTPS | YES | Site loads on HTTPS. Mixed content status unknown (needs manual check). |
| 404 errors | UNKNOWN | Need Google Search Console or Screaming Frog crawl to identify. |
| Redirect chains | UNKNOWN | Need crawl tool to identify. |
| Core Web Vitals | UNKNOWN | CrUX data may exist — check PageSpeed Insights field data. |

### 2.4 SCHEMA & STRUCTURED DATA

| Check | Status | Finding |
|-------|--------|---------|
| Product schema | LIKELY MINIMAL | WooCommerce adds basic Product schema by default (name, price, availability). Reviews schema depends on review plugin. |
| LocalBusiness schema | LIKELY MISSING | No evidence of LocalBusiness schema. Phoenix location (15802 N Cave Creek Rd, Suite 3, Phoenix, AZ 85032) not marked up. |
| FAQ schema | LIKELY MISSING | FAQ page exists but likely no FAQPage schema markup. Huge missed opportunity for SERP real estate. |
| Organization schema | LIKELY MISSING | No evidence detected. Should include logo, contact info, social profiles. |
| Breadcrumb schema | LIKELY MISSING | Depends on SEO plugin configuration. Yoast/Rank Math can add this. |
| Review/Rating schema | UNKNOWN | WooCommerce includes basic review schema. Verified reviews (Judge.me, etc.) would be stronger. |

### 2.5 CONVERSION & AOV SIGNALS

| Check | Status | Finding |
|-------|--------|---------|
| Clear CTA above fold? | PARTIAL | Homepage has value props but unclear from SERP data if there's a strong "Get Quote" or "Shop Now" above fold. |
| Fleet/commercial products featured? | POOR | Fleet Services page exists but isn't prominently linked. No dedicated "Fleet Pricing" or "Volume Discounts" page visible in main navigation. |
| Free shipping threshold visible? | YES BUT CONFLICTING | $750 on homepage, $500 on FAQ. Confusion hurts conversion. |
| Upsell/cross-sell on products? | LIKELY MINIMAL | WooCommerce has basic related products. No evidence of strategic upselling (contour-cut upgrade, window perf add-on). |
| B2B messaging clear? | MIXED | Homepage reads somewhat consumer-facing ("Custom Vinyl Car Wrap Design and Printing"). Products page title says "Best Van Wrap Designs \| Vinyl Wrap Shop near me" — very consumer/local. About page is better ("wholesale car wrap printing to local vehicle wrap installers"). |

---

## 3. TOP 20 PRIORITIZED ISSUES

| # | Issue | Impact | Effort | Risk | Fix Description |
|---|-------|--------|--------|------|-----------------|
| 1 | **Homepage title tag is consumer-facing, not B2B wholesale** | HIGH | LOW | LOW | Change to: "Wholesale Vehicle Wrap Printing \| 3M & Avery \| Ships in 1-2 Days \| WePrintWraps" |
| 2 | **Products page title is terrible** ("Best Van Wrap Designs \| Vinyl Wrap Shop near me") | HIGH | LOW | LOW | Change to: "Wholesale Printed Wrap Products \| Avery, 3M, Window Perf \| WePrintWraps" |
| 3 | **Free shipping threshold inconsistency** ($500 on FAQ vs $750 everywhere else) | HIGH | LOW | LOW | Pick one threshold and update ALL pages. Recommend $500 for AOV boost, or $750 for margin protection. |
| 4 | **Most WooCommerce products NOT indexed** (~8 of 39+ indexed) | HIGH | MEDIUM | LOW | Verify sitemap includes all products. Add internal links from category/homepage. Check for noindex tags. Submit sitemap to GSC. |
| 5 | **No LocalBusiness schema for Phoenix location** | HIGH | LOW | LOW | Add JSON-LD LocalBusiness schema with name, address, phone (602-595-3200), hours, geo coordinates. |
| 6 | **No FAQ schema on FAQ page** | HIGH | LOW | LOW | Add FAQPage JSON-LD schema. Can double SERP real estate with rich results. |
| 7 | **No dedicated "Wholesale" or "Volume Pricing" landing page** | HIGH | MEDIUM | LOW | Create SEO-optimized page targeting "wholesale vehicle wrap printing", "bulk wrap printing", "fleet wrap printing". Link from homepage nav. |
| 8 | **Blog is stale** (mostly 2021-2023, no keyword strategy) | HIGH | MEDIUM | LOW | Create content calendar targeting: "wholesale wrap printing", "fleet wrap cost", "3M vs Avery wrap film", "how to outsource wrap printing". Publish 2-4 posts/month. |
| 9 | **Wraps category page title is empty** ("Wraps – We Print Wraps") | MEDIUM | LOW | LOW | Change to: "Wholesale Printed Vehicle Wraps \| 3M IJ180 & Avery MPI 1105 \| WePrintWraps" |
| 10 | **No Organization schema** | MEDIUM | LOW | LOW | Add JSON-LD Organization schema with logo, URL, contact info, social profiles (88K Instagram, TikTok). |
| 11 | **No Product schema enhancements** (reviews, offers, availability) | MEDIUM | MEDIUM | LOW | Ensure WooCommerce Product schema includes price, availability, review aggregate. Add review collection (Judge.me or similar). |
| 12 | **Blog URLs use root-level slugs** (no /blog/ prefix) | MEDIUM | HIGH | MEDIUM | Blog posts like `/car-vinyl-wrap/` mix with page URLs. Ideally use `/blog/car-vinyl-wrap/` but redirects needed. May not be worth the effort now. |
| 13 | **Image alt tags likely missing on product images** | MEDIUM | MEDIUM | LOW | Audit all product images. Add descriptive alt tags: "Avery MPI 1105 printed vehicle wrap on Ford F-150" not "product-image-1". |
| 14 | **Elementor page speed likely poor on mobile** (typical 30-50 Lighthouse score) | MEDIUM | HIGH | MEDIUM | Run PageSpeed Insights manually. Common fixes: compress images, defer JS, reduce Elementor CSS, enable caching plugin (WP Rocket recommended). |
| 15 | **No breadcrumb schema** | MEDIUM | LOW | LOW | Enable breadcrumbs in Yoast/Rank Math. Helps Google understand site structure and shows breadcrumbs in SERPs. |
| 16 | **Fleet Services page not in main navigation** | MEDIUM | LOW | LOW | Add "Fleet Pricing" to main nav. Fleet orders are highest AOV ($2,500-$15,000+). Should be front and center. |
| 17 | **Window Perf product title missing wholesale keywords** | LOW | LOW | LOW | Change from "Perforated Window Vinyl 50/50 Unlaminated \| Vinyl Window Graphics" to "Wholesale Perforated Window Vinyl 50/50 \| Vehicle Window Graphics \| WePrintWraps" |
| 18 | **No canonical URL strategy verification** | LOW | MEDIUM | LOW | Check for duplicate product URLs (WooCommerce creates /product/ and /our-products/ paths). Ensure canonical tags point to preferred URL. |
| 19 | **Cart/checkout/my-account pages may be indexed** | LOW | LOW | LOW | Add noindex meta tag to cart, checkout, my-account, order-received pages. These waste crawl budget. |
| 20 | **No Breadcrumb navigation on product pages** | LOW | LOW | LOW | Add breadcrumbs: Home > Products > Wraps > Avery 1105 Printed Wrap Film. Improves UX and internal linking. |

---

## 4. ITEMS REQUIRING MANUAL VERIFICATION

The following items could not be verified remotely due to Cloudflare WAF blocking automated access. **These must be checked manually in wp-admin or browser DevTools:**

1. **robots.txt content** — Open https://weprintwraps.com/robots.txt in a browser
2. **sitemap.xml** — Check Yoast/Rank Math settings for sitemap URL
3. **Google Search Console** — Log in to check indexing status, crawl errors, Core Web Vitals
4. **SEO plugin installed** — Check Plugins page for Yoast, Rank Math, or All in One SEO
5. **PageSpeed Insights** — Run https://pagespeed.web.dev for homepage, a product page, and category page
6. **H1 tag structure** — View source on homepage, inspect for multiple H1s
7. **Image alt tags** — View source on product pages, count missing alt attributes
8. **Schema markup** — Run https://search.google.com/test/rich-results on homepage and a product page
9. **Mixed content** — Check browser console for HTTP resource warnings on HTTPS pages
10. **noindex tags** — View source on cart/checkout to confirm noindex; view source on products to confirm NO noindex
11. **.htaccess rules** — Check via FTP or wp-admin file manager
12. **Installed plugins list** — Screenshot from wp-admin > Plugins
13. **Redirect chains** — Use a tool like Screaming Frog or Redirect Checker
14. **Broken links (404s)** — Check GSC Coverage report or run Screaming Frog crawl

---

## 5. QUICK WINS (Do Today)

These can be done in < 30 minutes each with zero risk:

1. Fix homepage title tag (SEO plugin settings)
2. Fix Products page title tag
3. Fix Wraps category title tag
4. Fix free shipping threshold inconsistency on FAQ page
5. Add LocalBusiness JSON-LD schema (via SEO plugin or custom code snippet)
6. Add FAQPage JSON-LD schema to FAQ page
7. Add Fleet Services / Volume Pricing to main navigation
8. Run PageSpeed Insights and document baseline scores

---

*Audit conducted by WrapCommand AI. Data sourced from Google search index, SERP snippets, and codebase analysis. Direct site crawling blocked by Cloudflare WAF.*
