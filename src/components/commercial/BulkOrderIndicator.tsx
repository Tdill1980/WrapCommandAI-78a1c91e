import { useState } from "react";
import { Check } from "lucide-react";

/**
 * BulkOrderIndicator
 *
 * Simple checkbox to identify bulk/commercial orders.
 * Designed to be embedded in upload or quote forms.
 * Does NOT block checkout — informational only.
 *
 * Standalone, modular component for WePrintWraps CommercialPro.
 */

interface BulkOrderIndicatorProps {
  /** Callback when bulk status changes */
  onChange?: (isBulk: boolean) => void;
  /** Initial state */
  defaultChecked?: boolean;
}

export const BulkOrderIndicator = ({
  onChange,
  defaultChecked = false,
}: BulkOrderIndicatorProps) => {
  const [isBulk, setIsBulk] = useState(defaultChecked);

  const handleChange = (checked: boolean) => {
    setIsBulk(checked);
    onChange?.(checked);
  };

  return (
    <div className="w-full max-w-md">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground mb-3">
          Is this a bulk or commercial order?
        </legend>

        {/* Yes Option */}
        <label
          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
            isBulk
              ? "border-primary bg-secondary/50"
              : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <input
            type="radio"
            name="bulk-order"
            checked={isBulk}
            onChange={() => handleChange(true)}
            className="sr-only"
          />
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all ${
              isBulk ? "border-primary bg-primary" : "border-muted-foreground"
            }`}
          >
            {isBulk && <Check className="w-3 h-3 text-primary-foreground" />}
          </span>
          <span className="text-sm text-foreground">
            Yes — multiple vehicles or ongoing work
          </span>
        </label>

        {/* No Option */}
        <label
          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
            !isBulk
              ? "border-primary bg-secondary/50"
              : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <input
            type="radio"
            name="bulk-order"
            checked={!isBulk}
            onChange={() => handleChange(false)}
            className="sr-only"
          />
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all ${
              !isBulk ? "border-primary bg-primary" : "border-muted-foreground"
            }`}
          >
            {!isBulk && <Check className="w-3 h-3 text-primary-foreground" />}
          </span>
          <span className="text-sm text-foreground">No — single vehicle</span>
        </label>
      </fieldset>

      {/* Bulk Order Note */}
      {isBulk && (
        <div className="mt-4 p-4 bg-secondary/50 rounded-lg border border-primary/20 animate-fade-in">
          <p className="text-sm text-muted-foreground">
            For bulk or repeat orders, our team may follow up from{" "}
            <a
              href="mailto:hello@weprintwraps.com"
              className="text-primary hover:underline font-medium"
            >
              hello@weprintwraps.com
            </a>{" "}
            to review pricing and timelines.
          </p>
        </div>
      )}
    </div>
  );
};

export default BulkOrderIndicator;
