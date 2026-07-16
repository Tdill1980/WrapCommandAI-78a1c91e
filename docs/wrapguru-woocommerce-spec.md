# WrapGuru ↔ WooCommerce Spec (weprintwraps.com)

How WrapGuru talks to the WePrintWraps store: product catalog, cart links, and
order lookup. All IDs verified against the live store.

## Store + API
- Store: `https://weprintwraps.com` (WooCommerce/WordPress).
- REST base: `https://weprintwraps.com/wp-json/wc/v3`
- Auth: **WP application password** for `Trish@weprintwraps.com` (Basic auth).
  Get the value from the store owner — do NOT hardcode it.
- **Gotcha:** send a real browser `User-Agent` header or Cloudflare returns
  error 1010. Example: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) …Chrome/120…`.
- Payments: Stripe (via WooCommerce). This is WPW's Stripe — the anchor tenant.

## Product catalog (verified IDs + prices)
| Key | Woo ID | Name | Price | Type |
|-----|--------|------|-------|------|
| avery_wrap | **79** | Avery MPI 1105 + DOL 1460Z | $5.27 | per sqft |
| 3m_wrap | **72** | 3M IJ180Cv3 + 8518 | $5.27 | per sqft |
| window_perf | **80** | Perforated Window Vinyl 50/50 | $5.95 | per sqft |
| cut_avery | **108** | Avery Contour-Cut | $6.32 | per sqft |
| cut_3m | **19420** | 3M Contour-Cut | $6.92 | per sqft |
| wall_wrap | **70093** | Wall Wrap Printed Vinyl | $3.25 | per sqft |
| camo_carbon / metal_marble / wicked_wild / bape_camo / modern_trippy | 1726 / 39698 / 4181 / 42809 / 52489 | Wrap-by-the-yard patterns | $95.50 | per yard |
| custom_design | **234** | Custom Vehicle Wrap Design | $975 | flat |
| **design_output** | **289** | Design Setup/File Output | **$199** | flat |
| **production_pack** | **71964** | Production Pack | **$299** | flat |

### ⚠️ Fix in the current WrapGuru catalog
`command-chat`'s `WPW_PRODUCTS` currently maps `design_output` to **58160** —
that's the **wrong** product: `58160` is a DRAFT "Custom Vehicle Wrap Design
(Copy)". The correct File Output product is **289**. Also add
`production_pack` → **71964** ($299). Cart links for those two are wrong until
this is corrected.

## Cart / checkout links
WrapGuru builds standard WooCommerce add-to-cart URLs (no API call needed):
```
https://weprintwraps.com/cart/?add-to-cart=<PRODUCT_ID>&quantity=<QTY>
```
- `QTY` = **sqft** for per-sqft products (e.g. 265 for a Blazer full wrap),
  **yards** for by-the-yard, **units** for flat items.
- Example (F150, 280 sqft, Avery): `…/cart/?add-to-cart=79&quantity=280`

## Vehicle pricing
- Sqft comes from the `vehicle-sqft` function (or a class-based estimate).
- Price = `sqft × rate`. Bulk discounts: 500+ sqft 5%, 1000+ 10%, 1500+ 15%,
  2500+ 20%. Free shipping $750+. Ships 1–2 business days.

## Order lookup (`cmd_order`)
- WrapGuru looks up an order by number via the store when a customer references
  `#12345`, payment, status, or tracking.
- **Custom order statuses in use** (design/print pipeline): `processing` →
  `work-order-printed` → `in-design` → `lance` → `design-complete` →
  `print-production` → `shipped` → `completed`. Also `add-on`.

## File Output order structure (product 289)
- Uses the **TM Extra Product Options** plugin. The order form captures:
  - Vehicle (year/make/model), e.g. "2017 F450 Dually"
  - How the customer provides art: "I have a WePrintWraps Order #", "I'll submit
    files later", "Dropbox", "Other – note below"
  - Optional **file upload** → stored at
    `weprintwraps.com/wp-content/uploads/extra_product_options/<hash>/<file>`
- Reality check: most $199 buyers are trade shops who send art later via
  Dropbox/email — so the input is often NOT in the order.

## What WrapGuru needs from Woo (summary for rattler)
1. Product catalog + prices (table above) — for quoting.
2. Cart-link generation (format above) — for checkout.
3. Order lookup by number + status — for support.
4. (Optional) read File Output orders + uploaded inputs for design fulfillment.
