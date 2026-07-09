// email-guard — global kill-switch for AUTOMATED email senders.
//
// Trish paused automated email while ApproveFlow's auto-sends are being fixed
// (they went haywire / storm-sent). Guarded functions call `emailsPaused()` at
// the top of their handler and return early WITHOUT sending when paused.
//
// SAFETY DEFAULT: paused. Automated senders stay off until someone explicitly
// sets the `EMAILS_PAUSED=false` project secret to resume. This guarantees no
// surprise auto-fires after a redeploy.
//   EMAILS_PAUSED = "false"  -> automated email ON (resume)
//   EMAILS_PAUSED = "true"   -> paused
//   (unset)                  -> paused (safe default)
//
// This does NOT touch manual/transactional sends — only functions that import it.
export function emailsPaused(): boolean {
  return Deno.env.get("EMAILS_PAUSED") !== "false";
}

export function pausedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ paused: true, sent: 0, reason: "EMAILS_PAUSED — automated email paused by admin" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
