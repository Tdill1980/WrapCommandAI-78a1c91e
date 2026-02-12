# Cross-Site Linking Report — WePrintWraps Property Network

**Report Date:** 2026-02-12
**Sites Audited:**
1. **weprintwraps.com** — Primary B2B wholesale vehicle wrap printing site (WordPress/WooCommerce)
2. **inkandedge.com** — Ink & Edge Magazine (wrap industry content/media brand)
3. **restyleproai.com** — RestylePro AI (AI-powered vehicle restyle visualization tool)

**Method:** Google index analysis (`site:` operator), web search for cross-references, codebase grep of WrapCommand repository. Direct crawling blocked by Cloudflare WAF on all three domains.

---

## 1. EXECUTIVE SUMMARY

**Zero public-facing cross-links exist between any of the three owned properties.**

Despite extensive internal codebase references connecting all three brands, none of these connections are visible on the public websites. This represents a significant missed opportunity for:
- SEO authority transfer (link equity / "link juice")
- Brand ecosystem visibility
- Cross-selling and audience sharing
- Domain authority building for newer properties

Additionally, two critical issues were discovered:
- **inkandedge.com appears to be parked or expired** — redirecting to a domain marketplace
- **restyleproai.com has zero Google index** — the site is either not indexed, not crawlable, or has no content

---

## 2. DETAILED FINDINGS BY SITE

### 2.1 weprintwraps.com → inkandedge.com

| Check | Result |
|-------|--------|
| Public links from WPW to Ink & Edge | **NONE FOUND** |
| Google: `site:weprintwraps.com "inkandedge"` | 0 results |
| Google: `site:weprintwraps.com "ink and edge"` | 0 results |
| Codebase references | **20+ references** |

**Codebase references found (not public-facing):**
- `src/lib/brands.ts` — inkandedge defined as a brand in the multi-brand system
- `src/lib/content-calendar.ts` — Ink & Edge Magazine content calendar entries
- `src/lib/email-templates.ts` — Email templates referencing Ink & Edge
- `src/lib/affiliate-system.ts` — Affiliate/referral URLs pointing to inkandedge.com
- `supabase/functions/website-chat/` — Chat agent references Ink & Edge
- Multiple component references across the WrapCommand dashboard

### 2.2 weprintwraps.com → restyleproai.com

| Check | Result |
|-------|--------|
| Public links from WPW to RestylePro | **NONE FOUND** |
| Google: `site:weprintwraps.com "restyleproai"` | 0 results |
| Google: `site:weprintwraps.com "restylepro"` | 0 results |
| Codebase references | **10+ references** |

**Codebase references found (not public-facing):**
- `supabase/functions/website-chat/` — Chat agent mentions RestylePro AI as an upsell
- `supabase/functions/luigi-ordering-concierge/` — Ordering concierge references RestylePro
- `src/components/commercial/ProUpgradeStrip.tsx` — RestylePro featured as upgrade option
- `src/components/ClubWPWVault.tsx` — RestylePro listed in member vault
- `src/components/DesignShop.tsx` — RestylePro integrated as design tool option
- `src/assets/commercial/logo-restylepro.png` — Logo asset present

### 2.3 inkandedge.com → weprintwraps.com

| Check | Result |
|-------|--------|
| Public links from Ink & Edge to WPW | **UNABLE TO VERIFY** |
| Google: `site:inkandedge.com "weprintwraps"` | 0 results |
| Google: `site:inkandedge.com` | Results redirect to domain marketplace |
| Site status | **APPEARS PARKED/EXPIRED** |

**CRITICAL:** inkandedge.com appears to be redirecting to a domain marketplace (GoDaddy or similar). The domain may have expired or not been renewed. This needs immediate investigation:
- Check domain registrar for renewal status
- If expired, renew immediately to prevent domain squatting
- If intentionally parked, consider the SEO impact of lost backlinks

### 2.4 inkandedge.com → restyleproai.com

| Check | Result |
|-------|--------|
| Public links from Ink & Edge to RestylePro | **UNABLE TO VERIFY** (site appears parked) |

### 2.5 restyleproai.com → weprintwraps.com

| Check | Result |
|-------|--------|
| Public links from RestylePro to WPW | **UNABLE TO VERIFY** |
| Google: `site:restyleproai.com` | **0 results** |
| Site status | **NOT INDEXED BY GOOGLE** |

**CRITICAL:** restyleproai.com has zero pages in Google's index. Possible causes:
- Site has no public content deployed
- robots.txt is blocking all crawlers
- Site is behind authentication
- Domain is configured but site not yet launched
- Cloudflare settings are too restrictive for Googlebot

### 2.6 restyleproai.com → inkandedge.com

| Check | Result |
|-------|--------|
| Public links from RestylePro to Ink & Edge | **UNABLE TO VERIFY** (site not indexed) |

---

## 3. WP REST API CHECKS (BLOCKED)

The following REST API endpoints were attempted to enumerate all pages and posts for link analysis:

| Endpoint | Result |
|----------|--------|
| `weprintwraps.com/wp-json/wp/v2/pages` | **Blocked by Cloudflare** |
| `weprintwraps.com/wp-json/wp/v2/posts` | **Blocked by Cloudflare** |
| `weprintwraps.com/robots.txt` | **Blocked by Cloudflare** |
| `weprintwraps.com/sitemap.xml` | **Blocked by Cloudflare** |
| `weprintwraps.com/sitemap_index.xml` | **Blocked by Cloudflare** |

**Action Required:** These checks must be run from a whitelisted IP, the WordPress admin, or a browser logged into Cloudflare.

---

## 4. CROSS-LINKING MATRIX

| From ↓ / To → | weprintwraps.com | inkandedge.com | restyleproai.com |
|----------------|:----------------:|:--------------:|:----------------:|
| **weprintwraps.com** | — | NO LINKS | NO LINKS |
| **inkandedge.com** | SITE PARKED | — | SITE PARKED |
| **restyleproai.com** | NOT INDEXED | NOT INDEXED | — |

---

## 5. RECOMMENDATIONS

### 5.1 URGENT (Do This Week)

| # | Action | Priority |
|---|--------|----------|
| 1 | **Investigate inkandedge.com domain status** — Check registrar, renew if expired, restore content if parked | CRITICAL |
| 2 | **Investigate restyleproai.com indexing** — Check if site has content, verify robots.txt allows Googlebot, submit to Google Search Console | CRITICAL |
| 3 | **Run WP REST API checks from whitelisted IP** — Enumerate all WPW pages/posts to find any cross-links missed by Google index | HIGH |

### 5.2 CROSS-LINKING IMPLEMENTATION PLAN

Once all three sites are live and accessible, implement the following cross-links:

#### From weprintwraps.com:

| Location | Link To | Anchor Text / Format |
|----------|---------|---------------------|
| Footer | inkandedge.com | "Ink & Edge Magazine — Wrap Industry News" |
| Footer | restyleproai.com | "RestylePro AI — Vehicle Restyle Visualization" |
| Blog sidebar | inkandedge.com | "Read Ink & Edge Magazine" widget |
| Product pages | restyleproai.com | "Preview this wrap on your vehicle with RestylePro AI" CTA |
| About page | Both | "Part of the WePrintWraps family of brands" section |
| Design Services page | restyleproai.com | "AI-powered design previews available" |
| Fleet Services page | restyleproai.com | "See fleet wraps before you commit" |

#### From inkandedge.com (once restored):

| Location | Link To | Anchor Text / Format |
|----------|---------|---------------------|
| Navigation | weprintwraps.com | "Order Wraps" or "Print Partner" |
| Articles about wrap printing | weprintwraps.com | Contextual links to relevant product pages |
| Articles about AI/design | restyleproai.com | Contextual links to RestylePro features |
| Footer | weprintwraps.com | "Wholesale Wrap Printing by WePrintWraps" |
| Footer | restyleproai.com | "AI Vehicle Visualization by RestylePro" |
| Sponsored content/ads | weprintwraps.com | Banner or featured partner placement |

#### From restyleproai.com (once indexed):

| Location | Link To | Anchor Text / Format |
|----------|---------|---------------------|
| Navigation | weprintwraps.com | "Order Prints" or "Get This Wrap Printed" |
| After AI preview generation | weprintwraps.com | "Ready to print? Order wholesale at WePrintWraps" CTA |
| Footer | weprintwraps.com | "Printing powered by WePrintWraps.com" |
| Footer | inkandedge.com | "Industry news at Ink & Edge Magazine" |
| Pricing/signup page | weprintwraps.com | "WePrintWraps customers get RestylePro free" |

### 5.3 SEO BENEFITS OF CROSS-LINKING

| Benefit | Description |
|---------|-------------|
| **Link equity transfer** | WePrintWraps (strongest domain) passes authority to newer properties |
| **Topical relevance** | Cross-links between related sites strengthen topical authority for all three |
| **Referral traffic** | Each site sends qualified visitors to the others |
| **Brand ecosystem** | Visitors see a professional network of tools, increasing trust |
| **Reduced bounce rate** | More internal destinations keep users in the ecosystem |
| **Rich SERP presence** | Three domains ranking for related terms dominates search results |

### 5.4 IMPLEMENTATION NOTES

- Use `rel="noopener"` on external links (standard security practice)
- Do NOT use `rel="nofollow"` between your own properties — you WANT to pass link equity
- Consider using UTM parameters for tracking cross-site traffic: `?utm_source=weprintwraps&utm_medium=crosslink&utm_campaign=ecosystem`
- Implement gradually (5-10 links per week) to avoid triggering Google's link spam filters
- Monitor Google Search Console for all three properties after implementation

---

## 6. CODEBASE vs. PUBLIC SITE DISCONNECT

The WrapCommand codebase has extensive brand integration across all three properties, but these connections are only visible within the dashboard application (React SPA), not on the public WordPress sites. Key disconnects:

| Codebase Feature | Public Site Status |
|-----------------|-------------------|
| Multi-brand system (`brands.ts`) | Not reflected on any public site |
| Ink & Edge content calendar | inkandedge.com appears parked |
| RestylePro AI integration in ProUpgradeStrip | restyleproai.com not indexed |
| Chat agents reference all 3 brands | No public cross-links exist |
| Affiliate/referral URL system | No affiliate links deployed publicly |
| RestylePro logo in commercial assets | Logo used in dashboard only, not on WPW site |

**Recommendation:** The codebase is ready for cross-linking — the brand definitions, assets, and integration points already exist. The gap is purely on the public-facing WordPress sites, which need manual updates in wp-admin or via Elementor.

---

*Report generated by WrapCommand AI. Data sourced from Google search index, web search analysis, and codebase inspection. Direct site crawling blocked by Cloudflare WAF on all three domains.*
