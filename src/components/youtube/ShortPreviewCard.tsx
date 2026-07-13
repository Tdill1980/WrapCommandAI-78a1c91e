import { PlayCircle, Video, Megaphone, Calendar, CheckCircle, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeneratedShort } from "@/hooks/useYouTubeEditor";

interface ShortPreviewCardProps {
  short: GeneratedShort;
  renderedUrl?: string;
  isRendering?: boolean;
  onPreview?: () => void;
  onRender?: () => void;
  onSendToReel?: () => void;
  onSendToAd?: () => void;
  onSchedule?: () => void;
}

export function ShortPreviewCard({
  short,
  renderedUrl,
  isRendering,
  onPreview,
  onRender,
  onSendToReel,
  onSendToAd,
  onSchedule
}: ShortPreviewCardProps) {
  const hookColors: Record<string, string> = {
    Strong: "text-green-500",
    Medium: "text-yellow-500",
    Weak: "text-red-500",
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-pink-500/50 transition-all duration-200 hover:shadow-lg hover:shadow-pink-500/10 group">
      {/* Video Thumbnail / rendered clip */}
      <div className="aspect-[9/16] bg-muted rounded-lg mb-3 flex items-center justify-center relative overflow-hidden">
        {renderedUrl ? (
          <video src={renderedUrl} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-orange-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <PlayCircle className="w-12 h-12 text-muted-foreground group-hover:text-pink-500 transition-colors" />
          </>
        )}
        {renderedUrl && (
          <CheckCircle className="w-5 h-5 text-green-500 absolute top-2 right-2" />
        )}
      </div>

      <p className="text-foreground font-semibold truncate">{short.title}</p>
      <p className="text-muted-foreground text-sm">
        {short.duration} • Hook: <span className={hookColors[short.hookStrength]}>{short.hookStrength}</span>
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {onRender && !renderedUrl ? (
          <Button
            size="sm"
            onClick={onRender}
            disabled={isRendering}
            className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white border-0"
          >
            {isRendering ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Zap className="w-3 h-3 mr-1" />
            )}
            Render
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onPreview}
            className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white border-0"
          >
            <PlayCircle className="w-3 h-3 mr-1" />
            Preview
          </Button>
        )}
        <Button 
          size="sm" 
          variant="outline"
          onClick={onSendToReel}
          className="border-border hover:border-pink-500/50 hover:bg-pink-500/10"
        >
          <Video className="w-3 h-3 mr-1" />
          Reel
        </Button>
        <Button 
          size="sm" 
          variant="outline"
          onClick={onSendToAd}
          className="border-border hover:border-pink-500/50 hover:bg-pink-500/10"
        >
          <Megaphone className="w-3 h-3 mr-1" />
          Ad
        </Button>
        <Button 
          size="sm" 
          variant="outline"
          onClick={onSchedule}
          className="border-border hover:border-pink-500/50 hover:bg-pink-500/10"
        >
          <Calendar className="w-3 h-3 mr-1" />
          Schedule
        </Button>
      </div>
    </div>
  );
}
