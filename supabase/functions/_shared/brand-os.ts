/**
 * brand-os.ts — Brand + positioning source of truth for EDGE FUNCTIONS.
 *
 * Deno functions cannot import src/lib/brand-copy.ts, so this file is the
 * server-side mirror of it. If positioning changes, update BOTH files.
 *
 * Every content generator (content-studio-ai-copy, content-engine-claude,
 * future generators) must build its brand context from these blocks so the
 * chief aim and voice rules are never re-invented inline per function.
 */

/**
 * THE CHIEF AIM — DesignPro is a CATEGORY, not a feature.
 * This is the strategic spine of all RestyleProAI / DesignProAI content.
 */
export const CHIEF_AIM = `THE CHIEF AIM (every piece of content serves this):
DesignPro is a CATEGORY, not a feature — design to file output, automatically,
via an AI-hybrid deterministic system. The goal is that people say "throw it in
DesignPro" the way they say "throw it in Photoshop," and that it changes how
wide-format design + print works.
The one pipeline the category owns: prompt (or uploaded design/proof) →
approved design → print-ready production files. No manual Canva or Photoshop
step. One prompt in, a complete print-ready production pack out: true-size
panels, production pack, dimensioned production proof, customer 2D proof,
photorealistic 3D proof set, and a QC sign-off page — same design across every
view, automatically.
Content implications:
- Talk about the OUTPUT (print-ready production files), not just pretty renders.
- "Design to file output, automatically" is the category claim — use it.
- Position against the old way: hand-building panels in Canva/Photoshop,
  $500–$1,000 outsourced mockups, 3–5 business day turnarounds.
- DesignPro is the flagship that defines the category; the other tools
  (ColorPro, GraphicsPro, FadeWraps, ProductionFlow, PrintPro) feed the same
  design-to-production chain.`;

export const RESTYLEPRO_BRAND_BLOCK = `Brand: RestyleProAI (restyleproai.com)
TAGLINE: Design. Output. Profit.
WHAT THEY ARE: A Design-to-Production and Marketing Engine built for sign, wrap,
tint, and restyle shops. Create high-end custom designs, move them into
production, and generate profit — all from one streamlined system.

${CHIEF_AIM}

PRODUCT SUITE:
- DesignPro™ (DesignProAI) — the flagship. Prompt-to-production vehicle wrap
  design: type a description, get 7 photorealistic camera angles AND
  production-ready print panel files. "High-End Design, Delivered Faster."
- ColorPro™ — Visualize any vinyl wrap color on any vehicle. 1,000+ manufacturer
  colors (3M, Avery, XPEL, Inozetek) or custom swatches. "See It Before You Commit."
- GraphicsPro™ — Cut vinyl graphics design-to-production. Production-ready cut
  files for VersaWorks, Onyx, Flexi. "Design to Cutter, Streamlined."
- FadeWraps™ — Premium gradient fade effects with photorealistic renders and
  production panel kits. "Premium Fades, Production Ready."
- ProductionFlow™ — Design connected directly to output: panelizing, upscaling,
  quality check, production file packaging. "From Concept to Print, Aligned."
- ApprovePro™ — Professional proof sheets, digital approvals, client sign-off.
- RevisionStudioIQ™ — 4-layer revision engine. Refine without starting over.
- MightyMail™ — The list, parsed, segmented, and activated. Ongoing demand.
- PrintPro™ — Verified wholesale print partner included with every account.
KEY FEATURES: 7 photorealistic camera angles (Driver Side, Passenger Side,
Front, Rear, Hood Detail, Close-Up, Roof), prompt-to-production workflow,
production-ready panel files, manufacturer color libraries, real-time
visualization.
TONE: Premium, professional, confident. Speaks from real shop experience. Not
AI hype — real systems that solve real problems. Direct but not aggressive.
Empowering designers, never replacing them.
TARGET AUDIENCE: Sign shops, wrap shops, tint shops, restyle shops, freelance
wrap designers, fleet managers, commercial vehicle branders.
VALUE PROP: Replace $500–$1,000 outsourced mockups and 3–5 day turnarounds with
design AND production files from one prompt. Close more deals by showing
clients exactly what they'll get — then print it.
CTA STYLE: "Try it free", "Start designing in 60 seconds", "See it in action",
"Throw it in DesignPro", "RestyleProAI.com".
NEVER SAY: cheap, discount, basic, simple, easy, effortless, 10x, hack,
game-changer, "replace designers", "making designers obsolete".
HASHTAGS: #restyleproai #designpro #vehiclewrap #wrapdesign #wrapshop
#fleetwraps #prompttoprint #printready #wraplife`;

export const WEPRINTWRAPS_BRAND_BLOCK = `Brand: WePrintWraps (weprintwraps.com)
TAGLINE: Your Vehicle. Your Vision. Our Expertise.
WHAT THEY ARE: A professional vehicle wrap installation and print production shop. NOT a software company. NOT an AI company. A hands-on, in-the-shop wrap business.
SERVICES: Full vehicle wraps, partial wraps, color change wraps, fleet wraps & fleet graphics, commercial vehicle wraps, chrome deletes, roof wraps, hood wraps, race car wraps, boat wraps, trailer wraps, wall wraps & murals, window graphics, storefront graphics, vinyl lettering, cut vinyl decals, print & cut graphics, perforated window film, architectural wraps.
MATERIALS: 3M 2080 series, Avery Dennison Supreme Wrapping Film, XPEL, Inozetek, Hexis, Arlon, Oracal. Premium cast vinyl only — no cheap calendered film.
PROCESS: Consultation → Design mockup → Material selection → Surface prep → Professional installation → Quality inspection → Warranty.
TONE: Professional, trustworthy, expert craftsman. Local service provider who takes pride in quality work. Confident but not arrogant. "We do the work" energy — not "we sell software." Blue collar premium.
DIFFERENTIATORS: Certified installers, premium materials only, clean shop environment, warranty on all work, portfolio of real installs.
PRICING LANGUAGE: "Free consultation", "Free quote", "Competitive rates", "Investment in your vehicle" — never say cheap or discount.
NEVER SAY: AI, software, platform, SaaS, prompt, render, visualization, subscription, app, tool, technology. WePrintWraps is a PHYSICAL SHOP not a tech company.
CTA STYLE: "Book your free consultation", "Get a free quote", "Visit our shop", "DM us", "Call today".
HASHTAGS: #vehiclewrap #carwrap #colorchange #fleetwrap #wrapshop #vinylwrap #weprintwraps #wrapped #wraplife #carculture`;

/** Resolve the brand context block for a generator's prompt. */
export function getBrandBlock(brand: string): string {
  return brand === "WePrintWraps" ? WEPRINTWRAPS_BRAND_BLOCK : RESTYLEPRO_BRAND_BLOCK;
}
