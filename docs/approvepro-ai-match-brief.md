# Session Mission: Can AI match WePrintWraps' designers? (ApprovePro deep-dive)

> Handoff brief for a session that has the **RestylePro repo + Supabase access**.
> Fill in credentials by location — do **not** commit secrets.

## Why this matters (read first)
WePrintWraps sales are down. The design team is slow and is the bottleneck. The
goal is to use AI to **reproduce what the designers output on $199 "File Output"
jobs**, so the slow, repetitive design work can be automated. Do **not** build
team tooling — the point is to replace/accelerate the manual step.

## The business / system map
- **WePrintWraps.com** — the print shop, a WooCommerce/WordPress store. "Anchor
  tenant." Real orders + products live here.
- **WrapCommandAI** — the platform/OS. Repo: `Tdill1980/WrapCommandAI-78a1c91e`.
  Supabase project: `qxllysilzonrlyoaomce`. Customer agent = **WrapGuru** = edge
  function `command-chat` (OpenAI `gpt-4o`). WPW org UUID:
  `031ac427-f078-4086-a9bc-7bdb78cc1c73`.
- **RestylePro** — an app ON the platform. Repo: `Tdill1980/restylepro-os`.
  Supabase project: `kfapjdyythzyvnpdeghu`. Owns:
  - **ShopFlow bridge** (PUBLIC, no auth):
    `POST https://kfapjdyythzyvnpdeghu.supabase.co/functions/v1/shopflow-bridge`
    services/prices: `upscale $199` (auto Real-ESRGAN 4×), `cutpath $199`,
    `recreate $199`, `production_pack $299`. Payment = WPW Stripe (bridge owns
    it; WrapCommand holds **no** Stripe key).
  - **ApprovePro** — the design-proof / output system. **← THE TARGET.**
- Ownership rule: WrapGuru is the only agent customers see; RestylePro stays
  behind the scenes.

## Key products (WooCommerce)
- `289` = **Design Setup/File Output** ($199) ← the job type we're studying
- `71964` = **Production Pack** ($299)
- Access WooCommerce via the WP application password for
  `Trish@weprintwraps.com` (get it from the store owner; do **not** hardcode).
  Endpoint: `https://weprintwraps.com/wp-json/wc/v3/orders` — send a browser
  `User-Agent` header (Cloudflare blocks default agents with error 1010).

## What the designer output actually is (confirmed from a real file)
A **full-vehicle wrap proof**: the correct vehicle template (make/model/year/
wheelbase/roof, e.g. "2017 Ford Transit, Long WB, Med Roof") with the customer's
**logo + brand colors + phone + services + a background pattern** laid out across
**all panels** (driver/passenger/front/rear/roof), wrapped in the WPW proof frame
("DON'T PAY TWICE", approval disclaimer, order #, WPW logo). Real example: Order
**#33835**, "Fix It Today Plumbing," Ford Transit — output was **16,500 × 11,883
px, CMYK**, print-ready. So the output is **templated layout** (placing the
customer's exact assets on a vehicle template), **not** from-scratch generative
art.

## Critical data warning
The tables `approveflow_versions` / `approveflow_projects` in the **WrapCommand**
Supabase (`qxllysilzonrlyoaomce`) are **FAKE/OLD test data — ignore them.** The
real $199 orders + finished proofs live in **RestylePro's ApprovePro** (Supabase
`kfapjdyythzyvnpdeghu`). Query there.

## Findings from real WooCommerce $199 orders
- Most $199 File Output buyers are **trade shops** (installers/resellers), not
  retail. Examples: NXT Wraps, Arizona Auto Wraps, Elevation Wrap Co, PAC Tint,
  Unique Auto Finishing.
- **5 of 7** recent $199 orders uploaded **no file** at order time — they send
  art later via Dropbox/email (input often not in the store).
- Two with inputs in the store: **#72487** (NXT Wraps, 2017 F450 Dually, 2
  files), **#72582** (Unique Auto Finishing, 2026 F550, 5 files). Best
  end-to-end trace candidate: **#72487** (input already in store; needs its
  ApprovePro output).

## Your task
1. Connect to RestylePro's **ApprovePro** (Supabase `kfapjdyythzyvnpdeghu`).
   Identify the tables holding File Output orders, customer **input** files, and
   the designer's finished **output/proof** files (and revision versions).
2. Pull several **real completed $199 File Output orders end-to-end**: customer
   input(s) → designer's finished output. Note formats, pixel dims, color mode
   (CMYK), and exactly what transformation the designer performed.
3. Characterize the split: what % is **templated placement** (logo/colors/info
   on a vehicle template = automatable) vs. **genuinely creative** (needs a
   human).
4. Assess feasibility and design a **proof-composition engine**: input = vehicle
   + customer's actual logo (vector) / colors / phone / services; output =
   WPW-framed, full-panel, CMYK, print-ready proof. Use **template composition**
   for exact assets; AI only for background/style. Do **not** use pure
   generative AI that would **redraw** the customer's logo.
5. Score any AI output against the real designer corpus you pulled.

## Constraints
- Vehicle templates already exist in the workflow (the Transit template was
  embedded in the real output). Find/catalog them.
- Keep customer PII handling minimal; you're analyzing your own company's data.
- Report honestly what's automatable vs. not — don't overpromise instant AI
  print-ready output; the flat print-ready file is the hard part.

## What's already built this session (WrapCommand side, live)
- WrapGuru brain (`command-chat`, OpenAI): reliable quotes, always-email, real
  cart links.
- `check-artwork-file`: **real** file analysis (parses PNG/JPEG/TIFF/PDF for true
  dims/DPI/color space/vector), a `checks[]` breakdown, and a `recommended_fix`
  that pre-creates a ShopFlow checkout (check → fix → pay → process → deliver).
- `wrapguru-shopflow`: delivery callback + status proxy for the bridge.
- Homepage sales module: `public/embed/homepage-card.html` (Create a Design,
  Production Pack, Check My File, Quote — upload + Stripe checkout).
- Prices synced: design $975, file output $199, hourly $90/hr.
