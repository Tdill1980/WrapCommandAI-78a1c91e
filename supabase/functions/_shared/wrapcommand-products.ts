// ============================================================================
// WrapCommand AI — Product / Tool Suite Catalog
// ----------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for the WrapCommand AI "Pro" tools & suites that our
// agents create content, email, and outreach for.
//
// IMPORTANT FOR AGENTS:
//   - Products with status "documented" have APPROVED facts below. Use them.
//   - Products with status "needs_details" exist, but we have NOT yet captured
//     their official description / features / pricing. Agents MUST NOT invent
//     facts about these. Ask the operator to provide details instead.
//
// To complete a "needs_details" product, fill in `summary`, `keyFeatures`,
// `pricing`, and flip `status` to "documented".
// ============================================================================

export interface WrapCommandProduct {
  id: string;
  /** Canonical name the operator uses (matches how Trish refers to it). */
  name: string;
  /** Alternate names found in the codebase / marketing. */
  aka?: string[];
  status: "documented" | "needs_details";
  category: string;
  tagline?: string;
  summary?: string;
  url?: string;
  /** Approved talking points / features safe to use in content. */
  keyFeatures?: string[];
  /** Pricing copy — only fill when confirmed. */
  pricing?: string;
  /** Approved angles for content/email/outreach. */
  contentAngles?: string[];
}

export const WRAPCOMMAND_PRODUCTS: WrapCommandProduct[] = [
  {
    id: "ai_design_pro",
    name: "AI for Design Pro",
    aka: ["DesignProAI", "Design Pro", "designpro.ai"],
    status: "documented",
    category: "AI Design Suite",
    tagline: "Level-up your wrap designs.",
    summary:
      "AI-powered wrap design suite. Generate instant, AI-powered wrap designs in all major styles, then visualize and get them approved on the vehicle before printing.",
    url: "https://designpro.ai",
    keyFeatures: [
      "Instant AI-generated wrap designs across all major styles",
      "The Closer — visualize the design on the actual vehicle for client approval",
      "InkFusion color system integration",
      "DesignPanel editor for refining panels",
    ],
    contentAngles: [
      "Go from blank to a client-ready wrap concept in minutes",
      "Close more jobs by letting customers see it before they buy it",
      "Stop losing hours to design rounds — let AI do the first pass",
    ],
  },
  {
    id: "wall_pro",
    name: "Wall Pro",
    aka: ["Wall Wrap", "Wall Wrap Printed Vinyl"],
    status: "documented",
    category: "Printed Product",
    summary:
      "Custom printed wall graphics for offices, retail spaces, gyms, and branded interiors.",
    keyFeatures: [
      "Material: Avery HP MPI 2610",
      "Finishes: Matte or Luster",
      "Custom-sized to the wall (height x width)",
      "Great for offices, retail, gyms, and branded interiors",
    ],
    pricing: "$3.25 / sqft",
    contentAngles: [
      "Turn any blank wall into branded real estate",
      "Office, gym, and retail interior transformations",
      "Big visual impact, simple install",
    ],
  },

  // ──────────────────────────────────────────────────────────────────────
  // The products below were named by the operator but are NOT yet documented
  // in the codebase. Do NOT invent features, pricing, or claims for these.
  // Fill in the details and flip status to "documented" to activate them.
  // ──────────────────────────────────────────────────────────────────────
  {
    id: "freestyle_pro",
    name: "Freestyle Pro",
    status: "needs_details",
    category: "TBD",
    summary: "", // TODO: operator to provide official description
  },
  {
    id: "recreate_pro",
    name: "Re-create Pro",
    aka: ["Recreate Pro", "RestylePro", "RestyleProAI"],
    status: "needs_details",
    category: "TBD",
    summary:
      "", // TODO: likely related to RestylePro (AI visualize + approval). Confirm with operator.
  },
  {
    id: "graphics_pro",
    name: "Graphics Pro",
    status: "needs_details",
    category: "TBD",
    summary: "", // TODO: operator to provide official description
  },
];

export function getProduct(idOrName: string): WrapCommandProduct | undefined {
  const needle = idOrName.toLowerCase().trim();
  return WRAPCOMMAND_PRODUCTS.find(
    (p) =>
      p.id === needle ||
      p.name.toLowerCase() === needle ||
      (p.aka || []).some((a) => a.toLowerCase() === needle)
  );
}

/**
 * Builds the product-knowledge section injected into agent system prompts.
 * Documented products get full facts; undocumented ones are listed by name
 * with an explicit instruction to ask rather than fabricate.
 */
export function buildProductKnowledgeBlock(): string {
  const documented = WRAPCOMMAND_PRODUCTS.filter((p) => p.status === "documented");
  const pending = WRAPCOMMAND_PRODUCTS.filter((p) => p.status === "needs_details");

  const documentedBlock = documented
    .map((p) => {
      const lines: string[] = [];
      lines.push(`### ${p.name}${p.aka?.length ? ` (aka ${p.aka.join(", ")})` : ""}`);
      if (p.tagline) lines.push(`Tagline: "${p.tagline}"`);
      if (p.summary) lines.push(p.summary);
      if (p.url) lines.push(`URL: ${p.url}`);
      if (p.pricing) lines.push(`Pricing: ${p.pricing}`);
      if (p.keyFeatures?.length) {
        lines.push("Key features:");
        lines.push(...p.keyFeatures.map((f) => `  - ${f}`));
      }
      if (p.contentAngles?.length) {
        lines.push("Approved content angles:");
        lines.push(...p.contentAngles.map((a) => `  - ${a}`));
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const pendingBlock = pending.length
    ? `\n\n⚠️ NOT YET DOCUMENTED (do NOT invent facts, pricing, or features for these):\n${pending
        .map((p) => `  - ${p.name}`)
        .join(
          "\n"
        )}\nIf asked to create content/email/outreach for one of these, say you need the product details first and ask the operator to provide a short description, key features, and pricing.`
    : "";

  return `
=== WrapCommand AI PRODUCT & TOOL SUITES ===
These are the WrapCommand AI tools/suites you create content, email, and outreach for.
Use ONLY the approved facts below. Never invent pricing, features, or guarantees.

${documentedBlock}${pendingBlock}
=== END PRODUCT SUITES ===
`.trim();
}
