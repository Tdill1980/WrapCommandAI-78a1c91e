import { useEffect, useState } from "react";
import { CheckCircle2, X, UserPlus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuoteWelcomeBannerProps {
  className?: string;
}

export const QuoteWelcomeBanner = ({ className = "" }: QuoteWelcomeBannerProps) => {
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Read URL parameters
    const params = new URLSearchParams(window.location.search);
    const qid = params.get("quote_id");
    const src = params.get("source");

    if (qid) {
      setQuoteId(qid);
      setSource(src);
    }
  }, []);

  if (!quoteId || isDismissed) return null;

  const sourceLabel = source === "wpw" ? "WePrintWraps.com" : "your quote";

  return (
    <div
      className={`bg-gradient-to-r from-success/10 via-success/5 to-transparent border-b border-success/20 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                Your quote from {sourceLabel} is ready!
              </h3>
              <p className="text-sm text-muted-foreground">
                Create a CommercialPro account to save it, track orders, and unlock 3D proofs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" className="hidden sm:flex">
              <Eye className="h-4 w-4 mr-2" />
              View Quote Details
            </Button>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Create Account
            </Button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 hover:bg-muted rounded-md transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
