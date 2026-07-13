import type { Scene } from "@/hooks/useYouTubeEditor";

interface SceneTimelineProps {
  scenes: Scene[];
  onSceneClick?: (scene: Scene) => void;
  selectedSceneId?: number | null;
}

export function SceneTimeline({ scenes, onSceneClick, selectedSceneId }: SceneTimelineProps) {
  const DEFAULT_GRADIENT = "from-slate-500 to-slate-600";
  const colors: Record<string, string> = {
    hook: "from-pink-500 to-orange-500",
    value: "from-blue-500 to-purple-500",
    reveal: "from-green-400 to-emerald-600",
    cta: "from-yellow-500 to-red-500",
    testimonial: "from-cyan-500 to-blue-600",
    filler: "from-slate-500 to-slate-600",
  };

  const glowColors: Record<string, string> = {
    hook: "shadow-pink-500/30",
    value: "shadow-blue-500/30",
    reveal: "shadow-green-500/30",
    cta: "shadow-yellow-500/30",
    testimonial: "shadow-cyan-500/30",
    filler: "shadow-slate-500/30",
  };
  const gradientFor = (type: string) => colors[type] || DEFAULT_GRADIENT;
  const glowFor = (type: string) => glowColors[type] || "shadow-slate-500/30";

  return (
    <div className="mt-6 bg-card p-5 rounded-xl border border-border">
      <h2 className="text-foreground text-lg font-semibold mb-4">Scene Timeline</h2>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {scenes.map((scene) => (
          <div
            key={scene.id}
            onClick={() => onSceneClick?.(scene)}
            className={`
              min-w-[140px] bg-gradient-to-r ${gradientFor(scene.type)}
              rounded-xl p-3 text-white text-sm cursor-pointer
              transition-all duration-200 hover:scale-105
              shadow-lg ${glowFor(scene.type)}
              ${selectedSceneId === scene.id ? "ring-2 ring-white ring-offset-2 ring-offset-background" : ""}
            `}
          >
            <p className="font-bold">{scene.type.toUpperCase()}</p>
            <p className="text-white/80 text-xs mt-1">{scene.start} → {scene.end}</p>
            <p className="text-xs mt-1 font-medium">Score {scene.score}</p>
          </div>
        ))}
      </div>

      {/* Timeline bar */}
      <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
        <div className="flex h-full">
          {scenes.map((scene, i) => (
            <div 
              key={scene.id}
              className={`h-full bg-gradient-to-r ${gradientFor(scene.type)} flex-1`}
              style={{ 
                marginRight: i < scenes.length - 1 ? "2px" : "0",
                opacity: selectedSceneId === scene.id ? 1 : 0.6
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
