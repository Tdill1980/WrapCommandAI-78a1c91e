import { useState, useEffect, useRef } from "react";
import { Loader2, Settings } from "lucide-react";

// NOTE: VITE_QUOTE_TOOL_URL must be set in your environment for the quote embed to function.
// Without this variable, the component will render a placeholder.
const QUOTE_TOOL_URL = import.meta.env.VITE_QUOTE_TOOL_URL || "";

interface QuoteEmbedProps {
  className?: string;
  onQuoteStarted?: () => void;
  onQuoteUpdated?: (summary: string, data?: Record<string, unknown>) => void;
  onQuoteSubmitted?: (quoteId: string, email: string) => void;
}

export const JacksonQuoteEmbed = ({
  className = "",
  onQuoteStarted,
  onQuoteUpdated,
  onQuoteSubmitted,
}: QuoteEmbedProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(500);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build embed URL with parameters
  const embedUrl = QUOTE_TOOL_URL
    ? `${QUOTE_TOOL_URL}?embed=1&source=commercialpro`
    : "";

  // Listen for postMessage events from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin if needed (for security)
      // if (event.origin !== expectedOrigin) return;

      const { type, ...data } = event.data || {};

      switch (type) {
        case "WPW_QUOTE_HEIGHT":
          if (typeof data.height === "number") {
            setIframeHeight(data.height);
          }
          break;
        case "WPW_QUOTE_STARTED":
          onQuoteStarted?.();
          break;
        case "WPW_QUOTE_UPDATED":
          onQuoteUpdated?.(data.summary || "", data);
          break;
        case "WPW_QUOTE_SUBMITTED":
          onQuoteSubmitted?.(data.quote_id || "", data.email || "");
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onQuoteStarted, onQuoteUpdated, onQuoteSubmitted]);

  // Placeholder when URL is not set
  if (!QUOTE_TOOL_URL) {
    return (
      <div
        className={`bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center min-h-[400px] ${className}`}
      >
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Settings className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Quote Tool Loading...
        </h3>
        <p className="text-muted-foreground text-center text-sm max-w-xs">
          The instant quote calculator will appear here once connected.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-4 font-mono">
          Set VITE_QUOTE_TOOL_URL to enable embed
        </p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-card rounded-xl flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading quote tool...</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        className="w-full rounded-xl border-0"
        style={{ height: `${iframeHeight}px` }}
        onLoad={() => setIsLoading(false)}
        title="WePrintWraps Quote Calculator"
        allow="clipboard-write"
      />
    </div>
  );
};
