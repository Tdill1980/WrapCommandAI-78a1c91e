import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingDown, Check } from "lucide-react";

/**
 * PricingUpdateExplainer
 *
 * Inline expandable panel explaining the $5.90 → $5.27 price reduction.
 * Can be triggered via a text link or shown expanded by default.
 *
 * Standalone, modular component for WePrintWraps CommercialPro.
 */

interface PricingUpdateExplainerProps {
  /** Start expanded */
  defaultExpanded?: boolean;
  /** Render as standalone section vs inline */
  variant?: "inline" | "section";
}

export const PricingUpdateExplainer = ({
  defaultExpanded = false,
  variant = "section",
}: PricingUpdateExplainerProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const content = (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-success/10">
          <TrendingDown className="w-5 h-5 text-success" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground">
            Pricing Update — Premium 3M IJ180 Printable Wrap Film
          </h4>
        </div>
      </div>

      <p className="text-muted-foreground leading-relaxed">
        Our premium 3M IJ180 printable wrap film decreased by{" "}
        <span className="font-semibold text-foreground">$0.63 per square foot</span>,
        moving from $5.90 to $5.27.
      </p>

      <p className="text-muted-foreground leading-relaxed">
        This aligns 3M IJ180 pricing with Avery pricing, giving you premium 3M film
        at the same cost level.
      </p>

      <p className="text-muted-foreground leading-relaxed">
        This improvement came from faster approvals, fewer revisions, and a cleaner
        production flow — not from lowering material or print standards.
      </p>

      <div className="flex items-start gap-3 bg-secondary/50 rounded-lg p-4 mt-6">
        <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
        <p className="text-sm text-foreground">
          <span className="font-medium">Premium Wrap Guarantee:</span>{" "}
          <span className="text-muted-foreground">
            If there's a print flaw, we reprint at no cost.
          </span>
        </p>
      </div>
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="inline">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-primary hover:underline text-sm font-medium inline-flex items-center gap-1"
        >
          Pricing Update
          {isExpanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
        {isExpanded && (
          <div className="mt-4 p-6 bg-card border border-border rounded-lg animate-fade-in">
            {content}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="w-full bg-card py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-8">
          <span className="inline-block text-xs font-medium tracking-widest uppercase text-success mb-3">
            Price Reduction
          </span>
          <h2 className="text-3xl font-semibold text-foreground mb-2">
            $5.90 → $5.27 per sq ft
          </h2>
          <p className="text-muted-foreground">
            Same premium quality. Better value.
          </p>
        </div>
        <div className="bg-background border border-border rounded-xl p-8">
          {content}
        </div>
      </div>
    </section>
  );
};

export default PricingUpdateExplainer;
