import { Mail } from "lucide-react";

/**
 * CommercialInfoStrip
 *
 * A clean, minimal info strip for bulk/commercial ordering.
 * Designed to be embedded below value props on any page.
 *
 * Standalone, modular component for WePrintWraps CommercialPro.
 */
export const CommercialInfoStrip = () => {
  return (
    <section className="w-full bg-muted/50 border-y border-border">
      <div className="max-w-5xl mx-auto px-6 py-10 text-center">
        <h3 className="text-lg font-semibold text-foreground mb-3">
          Ordering multiple vehicles or ongoing work?
        </h3>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-4 leading-relaxed">
          For bulk, fleet, or repeat wrap orders, email{" "}
          <a
            href="mailto:hello@weprintwraps.com"
            className="text-primary hover:underline font-medium"
          >
            hello@weprintwraps.com
          </a>{" "}
          for volume pricing, timelines, and account support.
        </p>
        <p className="text-sm text-muted-foreground/80 flex items-center justify-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
          Includes our Premium Wrap Guarantee — print flaws reprinted at no cost.
        </p>
      </div>
    </section>
  );
};

export default CommercialInfoStrip;
