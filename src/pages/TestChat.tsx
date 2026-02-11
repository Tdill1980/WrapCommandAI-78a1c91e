import { useState, useEffect } from "react";

export default function TestChat() {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    // Clean up any previous widget instance
    document.getElementById("wpw-chat-widget-root")?.remove();
    document.querySelector('script[data-testchat]')?.remove();

    const script = document.createElement("script");
    script.src = "/embed/chat-widget.js?t=" + Date.now();
    script.defer = true;
    script.setAttribute("data-org", "wpw");
    script.setAttribute("data-agent", "jordan");
    script.setAttribute("data-mode", "live");
    script.setAttribute("data-testchat", "1");

    script.onload = () => setStatus("loaded");
    script.onerror = () => setStatus("error");

    document.body.appendChild(script);

    return () => {
      document.getElementById("wpw-chat-widget-root")?.remove();
      document.querySelector('script[data-testchat]')?.remove();
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#ccc", fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Jordan Lee Chat Widget — Test Page</h1>
      <p style={{ fontSize: "0.875rem", marginBottom: "1rem", color: "#888" }}>
        agent=jordan &middot; org=wpw &middot; mode=live
      </p>
      <div style={{
        display: "inline-block",
        padding: "0.5rem 1rem",
        borderRadius: "6px",
        fontSize: "0.875rem",
        background: status === "loaded" ? "#052e16" : status === "error" ? "#450a0a" : "#422006",
        color: status === "loaded" ? "#4ade80" : status === "error" ? "#f87171" : "#fbbf24",
        border: `1px solid ${status === "loaded" ? "#16a34a" : status === "error" ? "#dc2626" : "#ca8a04"}`,
      }}>
        {status === "loaded" ? "Widget loaded — click the chat bubble in the bottom-right corner" :
         status === "error" ? "Failed to load chat-widget.js" :
         "Loading widget..."}
      </div>
      <div style={{ marginTop: "2rem", color: "#555", fontSize: "0.8rem" }}>
        <p>Test checklist:</p>
        <ul style={{ paddingLeft: "1.25rem", lineHeight: "1.8" }}>
          <li>Chat bubble appears</li>
          <li>Onboarding collects name/email/phone</li>
          <li>Jordan responds (not duplicated messages)</li>
          <li>Never says "we install wraps" (WPW_IDENTITY guardrail)</li>
          <li>Ask "Do you guys install?" to verify guardrail</li>
        </ul>
      </div>
    </div>
  );
}
