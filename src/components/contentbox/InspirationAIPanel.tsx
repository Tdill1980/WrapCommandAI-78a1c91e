import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  Sparkles, 
  Lightbulb, 
  Zap, 
  Video, 
  Image as ImageIcon, 
  Loader2, 
  Copy, 
  Check,
  Target,
  TrendingUp,
  Wand2,
  Play,
  FileText,
  Clock,
  Download,
  Rocket
} from "lucide-react";
import { useInspirationAI, HookItem, AdPackage } from "@/hooks/useInspirationAI";
import { useInspoLibrary } from "@/hooks/useInspoLibrary";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface InspirationAIPanelProps {
  selectedMediaIds?: string[];
  onSelectHook?: (hook: string) => void;
  onAdGenerated?: (ad: AdPackage) => void;
}

export function InspirationAIPanel({ 
  selectedMediaIds = [], 
  onSelectHook,
  onAdGenerated 
}: InspirationAIPanelProps) {
  const { library, isLoading: libraryLoading } = useInspoLibrary();
  const {
    analyzing,
    generatingHooks,
    generatingAd,
    libraryAnalysis,
    generatedHooks,
    adPackage,
    analyzeLibrary,
    generateHooks,
    generateAd,
  } = useInspirationAI();

  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [renderingStatic, setRenderingStatic] = useState(false);
  const [staticOutputUrl, setStaticOutputUrl] = useState<string | null>(null);

  const [copiedHook, setCopiedHook] = useState<string | null>(null);
  const [adType, setAdType] = useState<"video" | "static" | "carousel">("video");
  const [platform, setPlatform] = useState("instagram");
  const [objective, setObjective] = useState("engagement");

  const videoCount = library.filter(f => f.file_type === "video").length;
  const imageCount = library.filter(f => f.file_type === "image").length;

  const handleCopyHook = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHook(text);
    toast.success("Hook copied!");
    setTimeout(() => setCopiedHook(null), 2000);
  };

  const handleGenerateAd = async () => {
    const result = await generateAd({
      mediaIds: selectedMediaIds.length > 0 ? selectedMediaIds : undefined,
      adType,
      platform,
      objective
    });
    if (result && onAdGenerated) {
      onAdGenerated(result);
    }
  };

  const handleRenderNow = async () => {
    if (!adPackage) return;

    // Get selected media for rendering
    const selectedMedia = library.filter(m => 
      selectedMediaIds.length > 0 
        ? selectedMediaIds.includes(m.id) 
        : true
    );

    if (adType === "video") {
      // Find first video in selection or library
      const videoMedia = selectedMedia.find(m => m.file_type === "video") || 
                         library.find(m => m.file_type === "video");
      
      if (!videoMedia) {
        toast.error("No video found in your library to render");
        return;
      }

      // Use the first hook text as headline
      const headline = adPackage.hooks?.[0]?.text || adPackage.script?.intro || "";
      const subtext = adPackage.script?.cta || "";

      // Store preset data for MightyEdit
      setIsRedirecting(true);
      const mightyEditPreset = {
        videoUrl: videoMedia.file_url,
        headline,
        subtext,
        platform,
        adPackage,
        selectedMediaIds,
        source: "inspiration_ai",
      };
      sessionStorage.setItem("mightyedit_preset", JSON.stringify(mightyEditPreset));
      toast.success("Redirecting to MightyEdit for rendering...");
      navigate("/mighty-edit");
    } else if (adType === "static") {
      // Find first image in selection or library
      const imageMedia = selectedMedia.find(m => m.file_type === "image") || 
                         library.find(m => m.file_type === "image");
      
      if (!imageMedia) {
        toast.error("No image found in your library to render");
        return;
      }

      setRenderingStatic(true);
      try {
        // render-static-ad requires action:"start" and uses media_url/cta/aspect_ratio.
        // Vertical platforms (tiktok/youtube) → 9:16, feed platforms → 4:5.
        const aspect_ratio = platform === "tiktok" || platform === "youtube" ? "9:16" : "4:5";
        const { data: startData, error: startError } = await lovableFunctions.functions.invoke("render-static-ad", {
          body: {
            action: "start",
            media_url: imageMedia.file_url,
            headline: adPackage.hooks?.[0]?.text || "",
            cta: adPackage.cta_options?.[0] || "Learn More",
            aspect_ratio,
          }
        });

        if (startError) throw startError;
        const renderId = startData?.render_id;
        if (!renderId) throw new Error(startData?.error || "Render did not start");

        // Poll for completion (Creatomate renders are async).
        let finalUrl: string | null = null;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const { data: statusData } = await lovableFunctions.functions.invoke("render-static-ad", {
            body: { action: "status", render_id: renderId },
          });
          if (statusData?.status === "succeeded" && statusData?.url) {
            finalUrl = statusData.url;
            break;
          }
          if (statusData?.status === "failed") {
            throw new Error(statusData?.error || "Render failed");
          }
        }

        if (finalUrl) {
          setStaticOutputUrl(finalUrl);
          toast.success("Static ad rendered!");
        } else {
          toast.error("Render timed out — try again");
        }
      } catch (err) {
        console.error("Static render error:", err);
        toast.error("Failed to render static ad");
      } finally {
        setRenderingStatic(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Library Stats */}
      <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-purple-400" />
              <span className="font-semibold">Your Inspiration Library</span>
            </div>
            <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/30">
              {library.length} files
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
              <Video className="w-4 h-4 text-blue-400" />
              <span className="text-sm">{videoCount} Videos</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
              <ImageIcon className="w-4 h-4 text-green-400" />
              <span className="text-sm">{imageCount} Images</span>
            </div>
          </div>

          {selectedMediaIds.length > 0 && (
            <div className="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-sm text-primary">
                {selectedMediaIds.length} files selected for AI generation
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="hooks" className="w-full">
        <TabsList className="w-full grid grid-cols-3 gap-1">
          <TabsTrigger value="hooks" className="gap-1.5">
            <Zap className="w-4 h-4" /> Hooks
          </TabsTrigger>
          <TabsTrigger value="patterns" className="gap-1.5">
            <TrendingUp className="w-4 h-4" /> Patterns
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1.5">
            <Wand2 className="w-4 h-4" /> Create Ad
          </TabsTrigger>
        </TabsList>

        {/* Hooks Tab */}
        <TabsContent value="hooks" className="space-y-4">
          <Button 
            onClick={() => generateHooks(selectedMediaIds.length > 0 ? selectedMediaIds : undefined)}
            disabled={generatingHooks || library.length === 0}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
          >
            {generatingHooks ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Fresh Hooks...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Generate Fresh Hooks from Inspiration</>
            )}
          </Button>

          {generatedHooks.length > 0 && (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-4">
                {generatedHooks.map((hook, idx) => (
                  <Card key={idx} className="p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{hook.text}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {hook.type.replace("_", " ")}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {hook.best_for === "video" ? <Video className="w-3 h-3 mr-1" /> : 
                             hook.best_for === "static" ? <ImageIcon className="w-3 h-3 mr-1" /> :
                             <><Video className="w-3 h-3 mr-1" /><ImageIcon className="w-3 h-3" /></>}
                            {hook.best_for}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              hook.energy_level === "high" ? "text-red-400 border-red-400/30" :
                              hook.energy_level === "medium" ? "text-yellow-400 border-yellow-400/30" :
                              "text-blue-400 border-blue-400/30"
                            }`}
                          >
                            {hook.energy_level}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => handleCopyHook(hook.text)}
                        >
                          {copiedHook === hook.text ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        {onSelectHook && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => onSelectHook(hook.text)}
                          >
                            Use
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="space-y-4">
          <Button 
            onClick={() => analyzeLibrary(selectedMediaIds.length > 0 ? selectedMediaIds : undefined)}
            disabled={analyzing || library.length === 0}
            className="w-full"
            variant="outline"
          >
            {analyzing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing Patterns...</>
            ) : (
              <><TrendingUp className="w-4 h-4 mr-2" /> Analyze My Inspiration Library</>
            )}
          </Button>

          {libraryAnalysis && (
            <ScrollArea className="h-[300px]">
              <div className="space-y-4 pr-4">
                <Card className="p-3">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" /> Themes Found
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {libraryAnalysis.themes.map((theme, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">{theme}</Badge>
                    ))}
                  </div>
                </Card>

                <Card className="p-3">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" /> Hook Patterns
                  </h4>
                  <ul className="text-sm space-y-1">
                    {libraryAnalysis.hook_patterns.map((pattern, idx) => (
                      <li key={idx} className="text-muted-foreground">• {pattern}</li>
                    ))}
                  </ul>
                </Card>

                <Card className="p-3">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-green-400" /> Recommendations
                  </h4>
                  <ul className="text-sm space-y-1">
                    {libraryAnalysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="text-muted-foreground">• {rec}</li>
                    ))}
                  </ul>
                </Card>

                {libraryAnalysis.hook_formulas && libraryAnalysis.hook_formulas.length > 0 && (
                  <Card className="p-3">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400" /> Hook Formulas
                    </h4>
                    <div className="space-y-2">
                      {libraryAnalysis.hook_formulas.map((formula, idx) => (
                        <div key={idx} className="p-2 rounded bg-muted/50">
                          <p className="text-sm font-medium">{formula.formula}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Example: "{formula.example}"
                          </p>
                          <Badge variant="outline" className="text-xs mt-1">
                            Best for: {formula.best_for}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Create Ad Tab */}
        <TabsContent value="create" className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ad Type</label>
              <Select value={adType} onValueChange={(v) => setAdType(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video Ad</SelectItem>
                  <SelectItem value="static">Static Ad</SelectItem>
                  <SelectItem value="carousel">Carousel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Platform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Objective</label>
              <Select value={objective} onValueChange={setObjective}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="engagement">Engagement</SelectItem>
                  <SelectItem value="leads">Lead Gen</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="awareness">Awareness</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            onClick={handleGenerateAd}
            disabled={generatingAd || library.length === 0}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
          >
            {generatingAd ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating Ad Package...</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-2" /> Generate Ad from My Content</>
            )}
          </Button>

          {adPackage && (
            <>
              {/* Render Now Button */}
              <Card className="p-3 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Rocket className="w-4 h-4 text-green-400" />
                      Ready to Render
                    </span>
                    <Badge variant="outline" className="text-green-400 border-green-400/30">
                      {adType === "video" ? "Video" : "Static"}
                    </Badge>
                  </div>
                  
                  {(isRedirecting || renderingStatic) ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isRedirecting ? "Redirecting to MightyEdit..." : "Rendering..."}
                      </div>
                    </div>
                  ) : staticOutputUrl ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <Check className="w-4 h-4" /> Render Complete!
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => window.open(staticOutputUrl, "_blank")}
                        >
                          <Play className="w-4 h-4 mr-1" /> Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (staticOutputUrl) {
                              const a = document.createElement("a");
                              a.href = staticOutputUrl;
                              a.download = "ad-static.png";
                              a.click();
                            }
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={handleRenderNow}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600"
                    >
                      <Rocket className="w-4 h-4 mr-2" /> Render {adType === "video" ? "Video" : "Static"} Ad Now
                    </Button>
                  )}
                </div>
              </Card>

              <ScrollArea className="h-[250px]">
                <div className="space-y-4 pr-4">
                  {/* Hooks */}
                  <Card className="p-3">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Play className="w-4 h-4 text-red-400" /> Hook Options
                    </h4>
                    <div className="space-y-2">
                      {adPackage.hooks?.map((hook, idx) => (
                        <div key={idx} className="p-2 rounded bg-muted/50">
                          <p className="text-sm font-medium">{hook.text}</p>
                          {hook.voiceover && (
                            <p className="text-xs text-muted-foreground mt-1">VO: {hook.voiceover}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Script */}
                  {adPackage.script && (
                    <Card className="p-3">
                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" /> Script
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="p-2 rounded bg-muted/50">
                          <span className="text-xs text-muted-foreground">Intro:</span>
                          <p>{adPackage.script.intro}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <span className="text-xs text-muted-foreground">Body:</span>
                          <p>{adPackage.script.body}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <span className="text-xs text-muted-foreground">CTA:</span>
                          <p>{adPackage.script.cta}</p>
                        </div>
                        <Badge variant="outline">
                          <Clock className="w-3 h-3 mr-1" /> {adPackage.script.total_duration}
                        </Badge>
                      </div>
                    </Card>
                  )}

                  {/* Text Overlays */}
                  {adPackage.text_overlays && adPackage.text_overlays.length > 0 && (
                    <Card className="p-3">
                      <h4 className="font-semibold text-sm mb-2">Text Overlays</h4>
                      <div className="space-y-1">
                        {adPackage.text_overlays.map((overlay, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">{overlay.timestamp}</Badge>
                            <span>{overlay.text}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Caption */}
                  {adPackage.caption && (
                    <Card className="p-3">
                      <h4 className="font-semibold text-sm mb-2">Caption</h4>
                      <p className="text-sm">{adPackage.caption}</p>
                      {adPackage.hashtags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {adPackage.hashtags.map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">#{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Media Usage */}
                  {adPackage.media_usage && adPackage.media_usage.length > 0 && (
                    <Card className="p-3">
                      <h4 className="font-semibold text-sm mb-2">How to Use Your Media</h4>
                      <div className="space-y-2">
                        {adPackage.media_usage.map((usage, idx) => (
                          <div key={idx} className="p-2 rounded bg-muted/50 text-sm">
                            <span className="font-medium">{usage.filename}</span>
                            <p className="text-muted-foreground text-xs">{usage.usage}</p>
                            {usage.timestamp && (
                              <Badge variant="outline" className="text-xs mt-1">{usage.timestamp}</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
