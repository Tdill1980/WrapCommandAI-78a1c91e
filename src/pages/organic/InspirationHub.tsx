import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Link2,
  Sparkles,
  Zap,
  Clock,
  Type,
  Palette,
  Play,
  Copy,
  Upload,
  TrendingUp,
  Flame,
  Target,
  Layers,
  Video,
  Instagram,
  Youtube,
  Music2,
  ArrowRight,
  Eye,
  Heart,
  Share2,
  Loader2,
  Check,
  ExternalLink,
  Bookmark,
  Wand2,
  Trash2,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { SINGLE_PATH_MODE } from "@/lib/featureFlags";
import { useInspoAnalysis, StyleAnalysis as HookStyleAnalysis } from "@/hooks/useInspoAnalysis";
import { useInspoLibrary, InspoFile } from "@/hooks/useInspoLibrary";
import { InspoUploadModal } from "@/components/inspo/InspoUploadModal";
import { InspoImageCard } from "@/components/inspo/InspoImageCard";
import { StaticAdUploader } from "@/components/inspo/StaticAdUploader";
import { useStaticAds, StaticAdFile } from "@/hooks/useStaticAds";

// Local interface for display in modal (matches what AI returns)
interface StyleAnalysis {
  styleName?: string;
  energy?: number;
  pacing?: string | { cutsPerSecond: number; averageClipLength: number; rhythm: string };
  font?: string;
  colorTheme?: string[];
  structure?: Array<{ time?: string; label?: string; duration?: number; style?: string }>;
  overlays?: string[] | { textStyle: string; fontSize: string; fontWeight: string; position: string; animation: string };
  hooks?: string[];
  cta?: string;
  music?: string | { genre: string; energy: string; bpm: number };
  transitions?: string[];
  color?: { palette: string[]; mood: string; saturation: string; contrast: string };
}

interface TrendPack {
  id: string;
  title: string;
  icon: React.ReactNode;
  count: number;
  color: string;
  description: string;
}

interface InspoItem {
  id: string;
  thumbnail: string;
  platform: "instagram" | "tiktok" | "youtube";
  views: string;
  hook: string;
  overlays: string[];
  duration: string;
}

const TREND_PACKS: TrendPack[] = [
  {
    id: "wrap-reels",
    title: "Trending Wrap Reels",
    icon: <Flame className="w-5 h-5" />,
    count: 24,
    color: "from-orange-500 to-red-500",
    description: "Viral transformation reels from top wrap shops",
  },
  {
    id: "high-converting",
    title: "High-Converting Ads",
    icon: <Target className="w-5 h-5" />,
    count: 18,
    color: "from-green-500 to-emerald-500",
    description: "Best performing paid social ads",
  },
  {
    id: "overlay-styles",
    title: "Overlay Style Ideas",
    icon: <Layers className="w-5 h-5" />,
    count: 32,
    color: "from-purple-500 to-pink-500",
    description: "Text overlays, captions, and graphics",
  },
  {
    id: "text-animations",
    title: "Text Animation Ideas",
    icon: <Type className="w-5 h-5" />,
    count: 15,
    color: "from-blue-500 to-cyan-500",
    description: "Motion text and kinetic typography",
  },
  {
    id: "before-after",
    title: "Before/After Reveals",
    icon: <Zap className="w-5 h-5" />,
    count: 28,
    color: "from-amber-500 to-yellow-500",
    description: "Transformation reveal techniques",
  },
  {
    id: "hooks",
    title: "Viral Hooks",
    icon: <TrendingUp className="w-5 h-5" />,
    count: 45,
    color: "from-rose-500 to-pink-500",
    description: "First 3-second hooks that stop scroll",
  },
];

const MOCK_INSPO_ITEMS: InspoItem[] = [
  {
    id: "1",
    thumbnail: "https://images.unsplash.com/photo-1619405399517-d7fce0f13302?w=300&h=400&fit=crop",
    platform: "instagram",
    views: "2.4M",
    hook: "Watch this Tesla go from boring to BEAST mode 🔥",
    overlays: ["WAIT FOR IT...", "THE REVEAL"],
    duration: "0:15",
  },
  {
    id: "2",
    thumbnail: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=300&h=400&fit=crop",
    platform: "tiktok",
    views: "890K",
    hook: "POV: Your car gets the glow up it deserves",
    overlays: ["BEFORE", "AFTER", "LINK IN BIO"],
    duration: "0:12",
  },
  {
    id: "3",
    thumbnail: "https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?w=300&h=400&fit=crop",
    platform: "youtube",
    views: "1.2M",
    hook: "This wrap took us 72 hours straight...",
    overlays: ["DAY 1", "DAY 2", "DAY 3", "FINAL RESULT"],
    duration: "0:45",
  },
  {
    id: "4",
    thumbnail: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=300&h=400&fit=crop",
    platform: "instagram",
    views: "567K",
    hook: "When the customer says 'surprise me'",
    overlays: ["BOLD CHOICE", "TRUST THE PROCESS"],
    duration: "0:18",
  },
];

const SUPPORTED_PLATFORMS = [
  { name: "Instagram Reels", icon: Instagram, color: "text-pink-500" },
  { name: "TikTok", icon: Music2, color: "text-foreground" },
  { name: "YouTube Shorts", icon: Youtube, color: "text-red-500" },
  { name: "Facebook Video", icon: Video, color: "text-blue-500" },
];

export default function InspirationHub() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState<StyleAnalysis | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("library");
  const [selectedPack, setSelectedPack] = useState<TrendPack | null>(null);

  const { analyzeVideo, analyzing, history, historyLoading, saved, savedLoading, toggleSaved, deleteAnalysis } = useInspoAnalysis();
  const { library, isLoading: libraryLoading, uploadFile, isUploading, deleteFile, reanalyzeAll, reanalyzeProgress } = useInspoLibrary();
  const { staticAds, isLoading: staticAdsLoading, deleteAd, refetch: refetchStaticAds } = useStaticAds();
  const [analyzingImageId, setAnalyzingImageId] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<any>(null);
  const [showImageAnalysisModal, setShowImageAnalysisModal] = useState(false);
  const [staticAdUploadOpen, setStaticAdUploadOpen] = useState(false);

  const detectPlatform = (inputUrl: string) => {
    if (inputUrl.includes("instagram.com")) return "Instagram";
    if (inputUrl.includes("tiktok.com")) return "TikTok";
    if (inputUrl.includes("youtube.com") || inputUrl.includes("youtu.be")) return "YouTube";
    if (inputUrl.includes("facebook.com") || inputUrl.includes("fb.watch")) return "Facebook";
    return "Video";
  };

  const handleAnalyze = async () => {
    if (!url) {
      toast.error("Please paste a video URL first");
      return;
    }

    const platform = detectPlatform(url);
    toast.info(`Analyzing ${platform} video...`);

    const result = await analyzeVideo(url, platform.toLowerCase());

    if (result) {
      // Transform the hook's StyleAnalysis to local format for display
      setAnalysis({
        styleName: "AI Style Analysis",
        energy: result.music?.energy === "high" ? 3 : result.music?.energy === "medium" ? 2 : 1,
        pacing: typeof result.pacing === "object" 
          ? `${result.pacing.rhythm} cuts, ~${result.pacing.averageClipLength}s per clip` 
          : "Fast cuts",
        font: typeof result.overlays === "object" && !Array.isArray(result.overlays) 
          ? `${result.overlays.fontWeight} ${result.overlays.fontSize}` 
          : "Bold uppercase",
        colorTheme: result.color?.palette || ["#FF6B35", "#2E2E2E", "#FFFFFF"],
        structure: Array.isArray(result.structure) 
          ? Object.entries(result.structure).map(([key, val]) => ({
              time: `${(val as any).duration || 3}s`,
              label: `${key}: ${(val as any).style || ""}`,
            }))
          : [
              { time: `${result.structure?.hook?.duration || 3}s`, label: `Hook: ${result.structure?.hook?.style || "Opening"}` },
              { time: `${result.structure?.body?.duration || 10}s`, label: `Body: ${result.structure?.body?.style || "Content"}` },
              { time: `${result.structure?.cta?.duration || 3}s`, label: `CTA: ${result.structure?.cta?.style || "Closing"}` },
            ],
        overlays: result.hooks || ["WAIT FOR IT...", "THE REVEAL"],
        hooks: result.hooks || ["Watch this transformation"],
        cta: result.cta || "DM us for a quote",
        music: typeof result.music === "object" 
          ? `${result.music.genre} - ${result.music.energy} energy (${result.music.bpm} BPM)` 
          : "Trending audio",
        transitions: result.transitions || ["Cut", "Zoom"],
      });
      setShowAnalysisModal(true);
    }
  };

  const handleApplyToReel = () => {
    if (analysis) {
      toast.success("Opening Reel Builder with this style applied...");
      navigate("/organic/reel-builder", { state: { styleAnalysis: analysis } });
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "instagram":
        return <Instagram className="w-3 h-3" />;
      case "tiktok":
        return <Music2 className="w-3 h-3" />;
      case "youtube":
        return <Youtube className="w-3 h-3" />;
      default:
        return <Video className="w-3 h-3" />;
    }
  };

  // Handle AI analysis of uploaded image
  const handleAnalyzeImage = async (file: InspoFile) => {
    setAnalyzingImageId(file.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let organizationId = null;
      if (user) {
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        organizationId = orgMember?.organization_id;
      }

      const { data, error } = await lovableFunctions.functions.invoke("analyze-inspo-image", {
        body: { imageUrl: file.file_url, organizationId, contentFileId: file.id },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setImageAnalysis(data.analysis);
      setShowImageAnalysisModal(true);
      toast.success("Style analysis complete!");
    } catch (err) {
      console.error("Analysis error:", err);
      toast.error("Failed to analyze image");
    } finally {
      setAnalyzingImageId(null);
    }
  };

  // Generate similar content based on analyzed style
  // GATED: Disabled in Single Path Mode
  const handleGenerateSimilar = (file: InspoFile) => {
    if (SINGLE_PATH_MODE) {
      toast.info("Opening Reel Builder...");
      navigate("/organic/reel-builder", { state: { inspoFile: file } });
      return;
    }
    toast.info("Opening Ad Creator with this style...");
    navigate("/contentbox", { state: { inspoFile: file } });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/organic")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-bold text-xl flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                  Inspiration Hub
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-powered discovery • Style breakdown • Trend scrubbing
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Hero Section - Paste Link */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Paste Any Video Link</h2>
                  <p className="text-muted-foreground text-sm">
                    AI breaks down pacing, overlays, hooks, transitions, colors, CTAs, and more.
                    <br />
                    Then rebuild it for YOUR brand.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Input
                    placeholder="https://instagram.com/reel/... or youtube.com/shorts/... or tiktok.com/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-background"
                  />
                  <Button
                    onClick={handleAnalyze}
                    disabled={!url || analyzing}
                    className="bg-gradient-to-r from-[#405DE6] to-[#E1306C] min-w-[160px]"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Analyze Style
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_PLATFORMS.map((platform) => (
                    <Badge
                      key={platform.name}
                      variant="secondary"
                      className="text-xs flex items-center gap-1"
                    >
                      <platform.icon className={cn("w-3 h-3", platform.color)} />
                      {platform.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:w-48">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setUploadModalOpen(true)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Inspo Video
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setActiveTab("saved")}
                >
                  <Bookmark className="w-4 h-4 mr-2" />
                  Saved Inspiration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="library">
              <FolderOpen className="w-4 h-4 mr-2" />
              My Library
            </TabsTrigger>
            <TabsTrigger value="static-ads">
              <LayoutGrid className="w-4 h-4 mr-2" />
              Static Ads
            </TabsTrigger>
            <TabsTrigger value="discover">
              <TrendingUp className="w-4 h-4 mr-2" />
              Discover
            </TabsTrigger>
            <TabsTrigger value="saved">
              <Bookmark className="w-4 h-4 mr-2" />
              Saved
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="w-4 h-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          {/* My Library Tab - Uploaded Content */}
          <TabsContent value="library" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary" />
                My Uploaded Inspiration
                {library.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{library.length}</Badge>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {library.length > 0 && (
                  <Button 
                    variant="outline" 
                    onClick={reanalyzeAll}
                    disabled={!!reanalyzeProgress}
                  >
                    {reanalyzeProgress ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {reanalyzeProgress.current}/{reanalyzeProgress.total}
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Re-analyze All
                      </>
                    )}
                  </Button>
                )}
                <Button onClick={() => setUploadModalOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload More
                </Button>
              </div>
            </div>

            {reanalyzeProgress && (
              <Card className="mb-4 p-4 bg-primary/5 border-primary/20">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Extracting your style from uploads...</p>
                    <p className="text-xs text-muted-foreground">
                      Processing {reanalyzeProgress.current} of {reanalyzeProgress.total} files
                    </p>
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(reanalyzeProgress.current / reanalyzeProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {libraryLoading ? (
              <Card className="p-12 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Loading your library...</p>
              </Card>
            ) : library.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {library.map((file) => (
                  <InspoImageCard
                    key={file.id}
                    file={file}
                    onAnalyze={handleAnalyzeImage}
                    onDelete={deleteFile}
                    onGenerateSimilar={handleGenerateSimilar}
                    isAnalyzing={analyzingImageId === file.id}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Uploads Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your Canva ads, reels, or any content to analyze their styles
                </p>
                <Button onClick={() => setUploadModalOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Your First File
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* Static Ads Tab */}
          <TabsContent value="static-ads" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-primary" />
                Static Ad Templates
                {staticAds.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{staticAds.length}</Badge>
                )}
              </h3>
              <Button onClick={() => setStaticAdUploadOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Static Ads
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Upload your static ad images for AI analysis. The AI will extract layout, colors, typography, and CTA patterns to help generate similar ads.
            </p>

            {staticAdsLoading ? (
              <Card className="p-12 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Loading static ads...</p>
              </Card>
            ) : staticAds.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {staticAds.map((ad) => (
                  <Card key={ad.id} className="overflow-hidden group relative">
                    <img
                      src={ad.file_url}
                      alt={ad.original_filename || 'Static ad'}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          toast.info("Opening Static Creator with this style...");
                          navigate("/organic/static", { state: { staticAd: ad } });
                        }}
                      >
                        <Wand2 className="w-4 h-4 mr-2" />
                        Generate Similar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteAd(ad.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                    {ad.tags && ad.tags.length > 0 && (
                      <div className="absolute bottom-2 left-2">
                        <Badge variant="secondary" className="text-xs">
                          {ad.tags[0]?.replace('_', ' ')}
                        </Badge>
                      </div>
                    )}
                    {ad.ai_labels && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Analyzed
                        </Badge>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center border-dashed">
                <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h4 className="font-semibold mb-2">No Static Ads Yet</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload static ad images so AI can analyze and help you create similar ads and carousels
                </p>
                <Button onClick={() => setStaticAdUploadOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Static Ads
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="discover" className="space-y-8 mt-6">
            {/* Trend Packs */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  Trend Packs
                </h3>
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

              <ScrollArea className="w-full">
                <div className="flex gap-4 pb-4">
                  {TREND_PACKS.map((pack) => (
                    <Card
                      key={pack.id}
                      className={cn(
                        "min-w-[240px] cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg",
                        selectedPack?.id === pack.id && "ring-2 ring-primary"
                      )}
                      onClick={() => setSelectedPack(pack)}
                    >
                      <CardContent className="p-4">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center text-white mb-3 bg-gradient-to-br",
                            pack.color
                          )}
                        >
                          {pack.icon}
                        </div>
                        <h4 className="font-semibold text-sm mb-1">{pack.title}</h4>
                        <p className="text-xs text-muted-foreground mb-2">{pack.description}</p>
                        <Badge variant="secondary" className="text-xs">
                          {pack.count} examples
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </section>

            {/* Inspo Grid */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {selectedPack ? selectedPack.title : "Featured Inspiration"}
                </h3>
                {selectedPack && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPack(null)}>
                    Clear Filter
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {MOCK_INSPO_ITEMS.map((item) => (
                  <Card
                    key={item.id}
                    className="overflow-hidden cursor-pointer group hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => {
                      setUrl(`https://instagram.com/reel/${item.id}`);
                      toast.info("Link loaded - click Analyze to break down this style");
                    }}
                  >
                    <div className="relative aspect-[9/16]">
                      <img
                        src={item.thumbnail}
                        alt="Inspiration"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                      {/* Platform badge */}
                      <div className="absolute top-2 left-2">
                        <Badge
                          variant="secondary"
                          className="text-xs bg-black/50 backdrop-blur-sm border-0"
                        >
                          {getPlatformIcon(item.platform)}
                          <span className="ml-1 capitalize">{item.platform}</span>
                        </Badge>
                      </div>

                      {/* Duration */}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="text-xs bg-black/50 backdrop-blur-sm border-0">
                          {item.duration}
                        </Badge>
                      </div>

                      {/* Views */}
                      <div className="absolute bottom-12 left-2 flex items-center gap-1 text-white text-xs">
                        <Eye className="w-3 h-3" />
                        {item.views}
                      </div>

                      {/* Hook text */}
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white text-xs font-medium line-clamp-2">{item.hook}</p>
                      </div>

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button size="sm" className="bg-white text-black hover:bg-white/90">
                          <Sparkles className="w-4 h-4 mr-1" />
                          Analyze
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="saved" className="mt-6">
            {savedLoading ? (
              <Card className="p-12 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Loading saved styles...</p>
              </Card>
            ) : saved && saved.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {saved.map((item) => (
                  <Card key={item.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{item.platform}</Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleSaved({ id: item.id, isSaved: false })}
                          >
                            <Bookmark className="w-4 h-4 fill-current" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteAnalysis(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm font-medium">{item.title || "Style Analysis"}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.source_url}</p>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setAnalysis(item.analysis_data as unknown as StyleAnalysis);
                          setShowAnalysisModal(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Analysis
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Bookmark className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Saved Inspiration Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Analyze videos and save styles you love to use later
                </p>
                <Button variant="outline">Browse Trend Packs</Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            {historyLoading ? (
              <Card className="p-12 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Loading history...</p>
              </Card>
            ) : history && history.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((item) => (
                  <Card key={item.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{item.platform}</Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleSaved({ id: item.id, isSaved: !item.is_saved })}
                          >
                            <Bookmark className={cn("w-4 h-4", item.is_saved && "fill-current")} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteAnalysis(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm font-medium">{item.title || "Style Analysis"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{item.source_url}</p>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setAnalysis(item.analysis_data as unknown as StyleAnalysis);
                          setShowAnalysisModal(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Analysis
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Analysis History</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Videos you analyze will appear here
                </p>
                <Button variant="outline">Paste a Link Above</Button>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Analysis Results Modal */}
      <Dialog open={showAnalysisModal} onOpenChange={setShowAnalysisModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Style Analysis Complete
            </DialogTitle>
            <DialogDescription>
              AI has extracted the style, pacing, and techniques from this video
            </DialogDescription>
          </DialogHeader>

          {analysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
              {/* Left Column - Style Details */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold bg-gradient-to-r from-[#405DE6] to-[#E1306C] bg-clip-text text-transparent">
                    {analysis.styleName}
                  </span>
                  <Badge variant="secondary" className="gap-1">
                    <Zap className="w-3 h-3" />
                    {analysis.energy === 3 ? "High" : analysis.energy === 2 ? "Medium" : "Low"} Energy
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Clock className="w-3 h-3" />
                      Pacing
                    </div>
                    <p className="text-sm font-medium">
                      {typeof analysis.pacing === "string" 
                        ? analysis.pacing 
                        : analysis.pacing 
                          ? `${analysis.pacing.rhythm} (${analysis.pacing.cutsPerSecond}/s)` 
                          : "Fast cuts"}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Type className="w-3 h-3" />
                      Font Style
                    </div>
                    <p className="text-sm font-medium">{analysis.font || "Bold uppercase"}</p>
                  </Card>
                </div>

                <Card className="p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Palette className="w-3 h-3" />
                    Color Theme
                  </div>
                  <div className="flex gap-2">
                    {(analysis.colorTheme || analysis.color?.palette || ["#FF6B35", "#2E2E2E", "#FFFFFF"]).map((color, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full border-2 border-border"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </Card>

                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-2">Video Structure</h4>
                  <div className="space-y-2">
                    {(analysis.structure || []).map((segment, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">
                          {segment.time || `${segment.duration || 3}s`}
                        </span>
                        <span className="text-sm font-medium">{segment.label || segment.style || "Segment"}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-2">Transitions Used</h4>
                  <div className="flex flex-wrap gap-2">
                    {(analysis.transitions || ["Cut", "Zoom"]).map((t, i) => (
                      <Badge key={i} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Right Column - Overlays & Actions */}
              <div className="space-y-4">
                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-2">Text Overlays</h4>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(analysis.overlays) ? analysis.overlays : analysis.hooks || ["WAIT FOR IT..."]).map((overlay, i) => (
                      <div
                        key={i}
                        className="px-3 py-1.5 rounded-full bg-black text-white text-sm font-bold border border-white/20"
                      >
                        {overlay}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-2">Hook Examples</h4>
                  <div className="space-y-2">
                    {(analysis.hooks || ["Watch this transformation"]).map((hook, i) => (
                      <div key={i} className="p-2 rounded-lg bg-muted/50 text-sm italic">
                        "{hook}"
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-2">CTA</h4>
                  <p className="text-sm font-semibold text-primary">{analysis.cta || "DM us for a quote"}</p>
                </Card>

                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-2">Music / Audio</h4>
                  <p className="text-sm text-muted-foreground">
                    {typeof analysis.music === "string" 
                      ? analysis.music 
                      : analysis.music 
                        ? `${analysis.music.genre} - ${analysis.music.energy} energy` 
                        : "Trending audio"}
                  </p>
                </Card>

                <Card className="border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h3 className="font-semibold">Apply This Style</h3>
                  <Button
                    className="w-full bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
                    onClick={handleApplyToReel}
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Apply to Reel Builder
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const overlayTexts = Array.isArray(analysis.overlays) 
                        ? analysis.overlays.join("\n") 
                        : (analysis.hooks || []).join("\n");
                      navigator.clipboard.writeText(overlayTexts);
                      toast.success("Overlay texts copied!");
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Overlay Texts
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={async () => {
                      // The analysis was persisted server-side keyed by its
                      // source URL — flag the newest matching row as saved.
                      const { data: row, error: findErr } = await supabase
                        .from("inspo_analyses")
                        .select("id")
                        .eq("source_url", url)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (findErr || !row) {
                        toast.error("Couldn't find this analysis to save — try re-analyzing");
                        return;
                      }
                      toggleSaved({ id: row.id, isSaved: true });
                      toast.success("Style saved to your library!");
                      setActiveTab("saved");
                    }}
                  >
                    <Bookmark className="w-4 h-4 mr-2" />
                    Save Style to Library
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Modal - Real Upload */}
      <InspoUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUpload={uploadFile}
        isUploading={isUploading}
      />

      {/* Image Analysis Modal */}
      <Dialog open={showImageAnalysisModal} onOpenChange={setShowImageAnalysisModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Image Style Analysis
            </DialogTitle>
            <DialogDescription>
              AI has extracted the visual style and design elements
            </DialogDescription>
          </DialogHeader>

          {imageAnalysis && (
            <div className="space-y-4 mt-4">
              {/* Style Name */}
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                  {imageAnalysis.styleName || "Analyzed Style"}
                </span>
              </div>

              {/* Color Palette */}
              {imageAnalysis.colorPalette && (
                <Card className="p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Color Palette
                  </h4>
                  <div className="flex gap-2 mb-2">
                    {imageAnalysis.colorPalette.map((color: string, i: number) => (
                      <div
                        key={i}
                        className="w-12 h-12 rounded-lg shadow-sm border cursor-pointer hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                        title={color}
                        onClick={() => {
                          navigator.clipboard.writeText(color);
                          toast.success(`Copied ${color}`);
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{imageAnalysis.colorMood}</p>
                </Card>
              )}

              {/* Typography */}
              {imageAnalysis.typography && (
                <Card className="p-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    Typography
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Style:</span> {imageAnalysis.typography.style}</div>
                    <div><span className="text-muted-foreground">Weight:</span> {imageAnalysis.typography.weight}</div>
                    <div><span className="text-muted-foreground">Case:</span> {imageAnalysis.typography.case}</div>
                    <div><span className="text-muted-foreground">Position:</span> {imageAnalysis.typography.position}</div>
                  </div>
                </Card>
              )}

              {/* Hooks & CTA */}
              <div className="grid grid-cols-2 gap-4">
                {imageAnalysis.hooks && imageAnalysis.hooks.length > 0 && (
                  <Card className="p-4">
                    <h4 className="text-sm font-medium mb-2">Hooks</h4>
                    <div className="space-y-1">
                      {imageAnalysis.hooks.map((hook: string, i: number) => (
                        <p key={i} className="text-sm italic text-muted-foreground">"{hook}"</p>
                      ))}
                    </div>
                  </Card>
                )}
                {imageAnalysis.cta && (
                  <Card className="p-4">
                    <h4 className="text-sm font-medium mb-2">CTA</h4>
                    <p className="text-sm font-semibold text-primary">{imageAnalysis.cta}</p>
                  </Card>
                )}
              </div>

              {/* Marketing Angle */}
              {imageAnalysis.marketingAngle && (
                <Card className="p-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Marketing Approach
                  </h4>
                  <p className="text-sm text-muted-foreground">{imageAnalysis.marketingAngle}</p>
                  {imageAnalysis.targetEmotion && (
                    <Badge className="mt-2" variant="secondary">Target Emotion: {imageAnalysis.targetEmotion}</Badge>
                  )}
                </Card>
              )}

              {/* Recommendations */}
              {imageAnalysis.recommendations && (
                <Card className="p-4 border-primary/30 bg-primary/5">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Wand2 className="w-4 h-4" />
                    AI Recommendations
                  </h4>
                  <ul className="space-y-1">
                    {imageAnalysis.recommendations.map((rec: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    navigate("/contentbox", { state: { styleAnalysis: imageAnalysis } });
                    setShowImageAnalysisModal(false);
                  }}
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Similar Ad
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(imageAnalysis, null, 2));
                    toast.success("Style JSON copied!");
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Style
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Static Ad Upload Dialog */}
      <Dialog open={staticAdUploadOpen} onOpenChange={setStaticAdUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Static Ads</DialogTitle>
            <DialogDescription>
              Upload static ad images for AI to analyze layout, colors, and typography patterns.
            </DialogDescription>
          </DialogHeader>
          <StaticAdUploader 
            onUploadComplete={() => {
              setStaticAdUploadOpen(false);
              refetchStaticAds();
            }} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
