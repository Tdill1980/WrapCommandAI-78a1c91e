import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Film,
  Scissors,
  Images,
  Sparkles,
  ChevronRight,
  Link2,
  Zap,
  TrendingUp,
  Play,
  Atom,
  Youtube,
  Loader2,
  Mic,
  Home,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentToolsNav } from "@/components/content/ContentToolsNav";

export default function OrganicHub() {
  const navigate = useNavigate();

  const tools = [
    {
      id: "reel_builder",
      label: "Multi-Clip Reel Builder",
      description: "Combine multiple clips, trim, sequence, pace — AI assisted timeline.",
      icon: <Film className="w-6 h-6" />,
      path: "/organic/reel-builder",
      gradient: "from-[#405DE6] to-[#833AB4]",
      badge: "Popular",
    },
    {
      id: "inspo_scrubber",
      label: "Inspo Scrubber",
      description: "Paste any IG/TikTok link — AI extracts pacing, overlays, hooks.",
      icon: <Link2 className="w-6 h-6" />,
      path: "/organic/inspo",
      gradient: "from-[#833AB4] to-[#E1306C]",
      badge: "New",
    },
    {
      id: "auto_split",
      label: "Auto-Split Engine",
      description: "Upload long videos — AI cuts into 5 viral short-form reels.",
      icon: <Scissors className="w-6 h-6" />,
      path: "/organic/auto-split",
      gradient: "from-[#E1306C] to-[#F77737]",
      badge: null,
    },
    {
      id: "static_creator",
      label: "Static / Carousel Creator",
      description: "Create organic static posts & carousels with AI copy.",
      icon: <Images className="w-6 h-6" />,
      path: "/organic/static",
      gradient: "from-[#F77737] to-[#FCAF45]",
      badge: null,
    },
    {
      id: "atomizer",
      label: "Content Atomizer",
      description: "Upload transcripts, FAQs, pricing — AI breaks into micro-content.",
      icon: <Atom className="w-6 h-6" />,
      path: "/organic/atomizer",
      gradient: "from-[#00AFFF] to-[#4EEAFF]",
      badge: "AI",
    },
    {
      id: "youtube_editor",
      label: "YouTube AI Editor",
      description: "Turn long-form videos into shorts, reels, ads, and micro-content.",
      icon: <Youtube className="w-6 h-6" />,
      path: "/organic/youtube-editor",
      gradient: "from-[#CC0000] to-[#FF4444]",
      badge: "Pro",
    },
    {
      id: "video_transcriber",
      label: "Video Transcriber",
      description: "Transcribe YouTube videos and short-form reels into text with timestamps.",
      icon: <Mic className="w-6 h-6" />,
      path: "/organic/transcriber",
      gradient: "from-[#9333EA] to-[#EC4899]",
      badge: "New",
    },
  ];

  // Fetch real stats from content_queue (actual content pipeline)
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["organic-hub-stats"],
    queryFn: async () => {
      // Creatives = items in pipeline (draft, pending, processing)
      const { count: creativesCount } = await contentDB
        .from("content_queue")
        .select("*", { count: "exact", head: true })
        .in("status", ["draft", "pending", "processing"]);

      // Completed count
      const { count: completedCount } = await contentDB
        .from("content_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");

      // This week's completed
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: weekCount } = await contentDB
        .from("content_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("updated_at", weekAgo.toISOString());

      return {
        reelsCreated: creativesCount || 0,
        completedCount: completedCount || 0,
        thisWeek: weekCount || 0,
      };
    },
  });

  // Fetch recent content from content_queue
  const { data: recentReels = [] } = useQuery({
    queryKey: ["recent-creatives"],
    queryFn: async () => {
      const { data } = await contentDB
        .from("content_queue")
        .select("id, title, output_url, created_at, status")
        .order("created_at", { ascending: false })
        .limit(6);
      return (data || []).map((item: any) => ({
        ...item,
        thumbnail_url: null,
      }));
    },
  });

  const quickStats = [
    { label: "Creatives", value: statsLoading ? "..." : String(stats?.reelsCreated || 0), icon: <Film className="w-4 h-4" /> },
    { label: "Completed", value: statsLoading ? "..." : String(stats?.completedCount || 0), icon: <TrendingUp className="w-4 h-4" /> },
    { label: "This Week", value: statsLoading ? "..." : String(stats?.thisWeek || 0), icon: <Zap className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background p-6 space-y-8">
      {/* Breadcrumb Navigation */}
      <div className="max-w-6xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button 
            onClick={() => navigate("/")} 
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium">Organic Hub</span>
        </nav>
      </div>

      {/* Unified Content Tools Navigation */}
      <div className="max-w-6xl mx-auto -mt-4">
        <ContentToolsNav />
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-[#405DE6] to-[#E1306C]">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="bg-gradient-to-r from-[#405DE6] via-[#833AB4] to-[#E1306C] bg-clip-text text-transparent">
                Organic Creation Hub
              </span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Reels, stories, static posts — everything optimized for viral growth.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4">
            {quickStats.map((stat) => (
              <div
                key={stat.label}
                className="text-center px-4 py-2 rounded-xl bg-card/50 border border-border/50"
              >
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
                  {stat.icon}
                  {stat.label}
                </div>
                <div className="text-xl font-bold mt-1">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tool Grid */}
      <div className="max-w-6xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">Creation Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <Card
              key={tool.id}
              className="group cursor-pointer hover:border-primary/50 transition-all overflow-hidden"
              onClick={() => navigate(tool.path)}
            >
              <CardContent className="p-0">
                <div className="flex items-start gap-4 p-5">
                  <div
                    className={cn(
                      "p-3 rounded-xl bg-gradient-to-br text-white shrink-0",
                      tool.gradient
                    )}
                  >
                    {tool.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{tool.label}</h3>
                      {tool.badge && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {tool.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                </div>
                <div
                  className={cn(
                    "h-1 w-0 group-hover:w-full transition-all duration-300 bg-gradient-to-r",
                    tool.gradient
                  )}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="max-w-6xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => navigate("/organic/reel-builder")}
            className="bg-gradient-to-r from-[#405DE6] to-[#E1306C] hover:opacity-90"
          >
            <Film className="w-4 h-4 mr-2" />
            Create Reel
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate("/organic/inspo")}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Scrub Inspo
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate("/organic/auto-split")}
          >
            <Scissors className="w-4 h-4 mr-2" />
            Auto-Split Video
          </Button>

          <Button
            variant="ghost"
            onClick={() => navigate("/content-schedule")}
          >
            <Play className="w-4 h-4 mr-2" />
            View Scheduler
          </Button>
        </div>
      </div>

      {/* Reel Vault Preview */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Reels</h2>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/content-calendar")}>
            View Reel Vault →
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {recentReels.length > 0 ? (
            recentReels.map((reel) => (
              <div
                key={reel.id}
                className="aspect-[9/16] rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center relative overflow-hidden group cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => reel.output_url && window.open(reel.output_url, "_blank")}
              >
                {reel.output_url ? (
                  <video src={reel.output_url} className="w-full h-full object-cover" muted />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Film className="w-6 h-6 mx-auto mb-1 opacity-30" />
                    <span className="text-xs">{reel.status || "Pending"}</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white truncate">{reel.title || "Untitled"}</p>
                </div>
              </div>
            ))
          ) : (
            [1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="aspect-[9/16] rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center"
              >
                <div className="text-center text-muted-foreground">
                  <Film className="w-6 h-6 mx-auto mb-1 opacity-30" />
                  <span className="text-xs">No reel</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
