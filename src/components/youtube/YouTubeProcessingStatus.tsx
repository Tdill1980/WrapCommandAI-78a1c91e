import { Loader2 } from "lucide-react";
import type { ProcessingStatus } from "@/hooks/useYouTubeEditor";

interface YouTubeProcessingStatusProps {
  isAnalyzing: boolean;
  processingStatus?: ProcessingStatus;
}

// Ordered pipeline steps mapped to the job's real processing_status
const STEPS: Array<{ key: ProcessingStatus; label: string }> = [
  { key: "uploading", label: "Uploading video…" },
  { key: "transcribing", label: "Transcribing audio…" },
  { key: "analyzing", label: "Analyzing scenes…" },
  { key: "generating_shorts", label: "Generating shorts…" },
];

export function YouTubeProcessingStatus({ isAnalyzing, processingStatus = "idle" }: YouTubeProcessingStatusProps) {
  if (!isAnalyzing) return null;

  const currentIdx = STEPS.findIndex((s) => s.key === processingStatus);
  const activeIdx = currentIdx === -1 ? 0 : currentIdx;
  const pct = Math.round(((activeIdx + 0.5) / STEPS.length) * 100);

  return (
    <div className="mt-6 bg-card border border-border rounded-xl p-6 animate-fade-in">
      <p className="text-foreground text-lg font-semibold mb-3 flex items-center gap-2">
        <span className="animate-pulse text-pink-500">●</span> Processing Video
        <Loader2 className="w-4 h-4 animate-spin ml-2 text-pink-500" />
      </p>

      <div className="text-muted-foreground space-y-2 text-sm">
        {STEPS.map((step, i) => (
          <p
            key={step.key}
            className={`flex items-center gap-2 ${i > activeIdx ? "text-muted-foreground/50" : ""}`}
          >
            {i < activeIdx ? (
              <span className="text-green-500">✓</span>
            ) : i === activeIdx ? (
              <Loader2 className="w-3 h-3 animate-spin text-pink-500" />
            ) : (
              <span className="text-muted-foreground/30">○</span>
            )}{" "}
            {step.label}
          </p>
        ))}
      </div>

      <div className="mt-5 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-pink-500 to-orange-500 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-right">{pct}% complete</p>
    </div>
  );
}
