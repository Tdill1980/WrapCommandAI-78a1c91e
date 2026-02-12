import { useState, useEffect } from "react";
import { ChevronRight, Calculator, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type QuoteState = "idle" | "started" | "submitted";

interface StickyQuoteBarProps {
  className?: string;
}

export const StickyQuoteBar = ({ className = "" }: StickyQuoteBarProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [quoteState, setQuoteState] = useState<QuoteState>("idle");
  const [quoteSummary, setQuoteSummary] = useState("");

  // Show bar after scrolling past hero (~120px)
  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 120);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Listen for postMessage events from quote tool
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, ...data } = event.data || {};

      switch (type) {
        case "WPW_QUOTE_STARTED":
          setQuoteState("started");
          break;
        case "WPW_QUOTE_UPDATED":
          setQuoteState("started");
          if (data.summary) {
            setQuoteSummary(data.summary);
          }
          break;
        case "WPW_QUOTE_SUBMITTED":
          setQuoteState("submitted");
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const scrollToQuote = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-lg shadow-foreground/5 transform transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "translate-y-full"
      } ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* State A: No quote started */}
        {quoteState === "idle" && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Calculator className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm sm:text-base">
                  Get instant price in 60 seconds
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  No account required • Wholesale pricing included
                </p>
              </div>
            </div>
            <Button onClick={scrollToQuote} size="sm" className="font-medium">
              Start Quote
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* State B: Quote in progress */}
        {quoteState === "started" && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                <Calculator className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm sm:text-base">
                  {quoteSummary || "Quote in progress..."}
                </p>
                <p className="text-xs text-primary hidden sm:block">
                  Unlock 15% at 1,000 sq ft
                </p>
              </div>
            </div>
            <Button onClick={scrollToQuote} size="sm" className="font-medium">
              Continue Quote
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* State C: Quote submitted */}
        {quoteState === "submitted" && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm sm:text-base">
                  Quote saved successfully!
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Unlock tracking + 3D proof with a CommercialPro account
                </p>
              </div>
            </div>
            <Button size="sm" className="font-medium" variant="default">
              Go to Dashboard
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
