import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Check, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function ChatWidgetDemo() {
  const [copied, setCopied] = useState(false);
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Ace widget served from this app's own /embed path (updated on every deploy).
  // Install this snippet on weprintwraps.com (footer, before </body>).
  const widgetScriptUrl = "/embed/chat-widget.js";

  const embedCode = `<script
  defer
  src="${widgetScriptUrl}"
  data-org="wpw"
  data-agent="wpw_ai_team"
  data-mode="live"></script>`;

  // Load the external chat widget script
  useEffect(() => {
    // Remove any existing widget elements first
    const existingWidget = document.getElementById('wpw-chat-widget-root');
    if (existingWidget) {
      existingWidget.remove();
    }
    const existingScript = document.querySelector(`script[src="${widgetScriptUrl}"]`);
    if (existingScript) {
      existingScript.remove();
    }

    // Create and inject the script tag
    const script = document.createElement('script');
    script.src = widgetScriptUrl;
    script.defer = true;
    script.setAttribute('data-org', 'wpw');
    script.setAttribute('data-agent', 'wpw_ai_team');
    script.setAttribute('data-mode', 'live');

    script.onload = () => {
      console.log('[ChatWidgetDemo] External widget script loaded successfully');
      setWidgetLoaded(true);
      setLoadError(null);
    };

    script.onerror = (e) => {
      console.error('[ChatWidgetDemo] Failed to load widget script:', e);
      setLoadError('Failed to load chat widget script. Check console for details.');
      setWidgetLoaded(false);
    };

    document.body.appendChild(script);

    // Cleanup on unmount
    return () => {
      const widgetRoot = document.getElementById('wpw-chat-widget-root');
      if (widgetRoot) {
        widgetRoot.remove();
      }
      const scriptEl = document.querySelector(`script[src="${widgetScriptUrl}"]`);
      if (scriptEl) {
        scriptEl.remove();
      }
    };
  }, []);

  const reloadWidget = () => {
    setWidgetLoaded(false);
    setLoadError(null);

    // Remove existing
    const existingWidget = document.getElementById('wpw-chat-widget-root');
    if (existingWidget) existingWidget.remove();
    const existingScript = document.querySelector(`script[src="${widgetScriptUrl}"]`);
    if (existingScript) existingScript.remove();

    // Re-inject
    const script = document.createElement('script');
    script.src = widgetScriptUrl + '?t=' + Date.now(); // Cache bust
    script.defer = true;
    script.setAttribute('data-org', 'wpw');
    script.setAttribute('data-agent', 'wpw_ai_team');
    script.setAttribute('data-mode', 'live');
    script.onload = () => {
      setWidgetLoaded(true);
      toast.success('Widget reloaded');
    };
    script.onerror = () => setLoadError('Failed to reload widget');
    document.body.appendChild(script);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast.success("Embed code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/website-agent">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Chat Widget Demo - LIVE TEST</h1>
              <p className="text-sm text-muted-foreground">Testing the actual external widget before deploying to WordPress</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={reloadWidget}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload Widget
            </Button>
            {widgetLoaded ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">WIDGET LOADED</Badge>
            ) : loadError ? (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">LOAD ERROR</Badge>
            ) : (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">LOADING...</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Status card */}
        <Card className={`p-4 mb-6 ${loadError ? 'border-red-500/50 bg-red-500/10' : 'border-green-500/50 bg-green-500/10'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {widgetLoaded
                  ? "Chat widget is loaded! Look for the floating button in the bottom-right corner."
                  : loadError
                    ? loadError
                    : "Loading external chat widget script..."}
              </p>
              {widgetLoaded && (
                <p className="text-sm text-muted-foreground mt-1">
                  Click the chat bubble to test the full conversation flow.
                </p>
              )}
            </div>
            {widgetLoaded && (
              <span className="text-4xl">👉</span>
            )}
          </div>
        </Card>

        {/* Fake website background to simulate customer experience */}
        <Card className="p-8 bg-card/30 border-dashed mb-6">
          <div className="text-center text-muted-foreground space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Simulated Website Content</h2>
            <p className="text-lg">This represents your website. The chat widget floats independently.</p>
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-muted/30 rounded-lg p-4 h-32 flex items-center justify-center">
                <span className="text-muted-foreground">Product 1</span>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 h-32 flex items-center justify-center">
                <span className="text-muted-foreground">Product 2</span>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 h-32 flex items-center justify-center">
                <span className="text-muted-foreground">Product 3</span>
              </div>
            </div>
            <p className="text-sm pt-4">
              Test the chat by clicking the widget button in the bottom-right corner.
            </p>
          </div>
        </Card>

        {/* Embed code card */}
        <Card className="p-6 mb-8">
          <h2 className="font-semibold mb-3">Embed Code for WordPress (copy into footer.php before &lt;/body&gt;)</h2>
          <div className="relative">
            <pre className="bg-muted/50 p-4 rounded-lg text-sm border border-border overflow-x-auto">
              <code>{embedCode}</code>
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 right-2"
              onClick={copyCode}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </Card>

        {/* Test checklist */}
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Testing Checklist</h2>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Chat bubble appears in bottom-right corner</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Name/email collection form shows on first open</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Can send messages and receive responses</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Vehicle quote pricing is accurate</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Quote email sends successfully</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Chat sounds human, not robotic</span>
            </label>
          </div>
        </Card>
      </div>

      {/* The external widget script is loaded via useEffect - it will render its own floating button */}
    </div>
  );
}
