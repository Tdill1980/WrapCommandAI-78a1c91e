import { Mail } from "lucide-react";

/**
 * CommercialFooter
 *
 * Minimal footer section for wholesale/commercial contact.
 * Designed to be embedded in site footer.
 *
 * Standalone, modular component for WePrintWraps CommercialPro.
 */

export const CommercialFooter = () => {
  return (
    <div className="py-8 border-t border-border">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              Wholesale & Commercial
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Bulk wrap orders</li>
              <li>• Fleet pricing</li>
              <li>• Repeat accounts</li>
            </ul>
          </div>
          <a
            href="mailto:hello@weprintwraps.com"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Mail className="w-4 h-4" />
            hello@weprintwraps.com
          </a>
        </div>
      </div>
    </div>
  );
};

export default CommercialFooter;
