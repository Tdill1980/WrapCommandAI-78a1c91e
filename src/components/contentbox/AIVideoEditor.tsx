import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  Scissors, 
  Wand2, 
  Type, 
  Sparkles,
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Download,
  Copy,
  CheckCircle,
  Video,
  ExternalLink
} from "lucide-react";
import { ContentFile, VideoProcessResult } from "@/hooks/useContentBox";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useNavigate } from "react-router-dom";
import { useHybridGenerate } from "@/hooks/useHybridGenerate";
import { EditorModeProvider, useEditorMode } from "@/contexts/EditorModeContext";
import { EditorModeTabs, EditorToolSidebar } from "@/components/editor";
import { MusicPicker } from "./MusicPicker";
import { BrandVoiceIndicator } from "./BrandVoiceIndicator";
import { HybridModeSelector } from "./HybridModeSelector";
import { HybridOutputDisplay } from "./HybridOutputDisplay";
import { ScriptEditor } from "./ScriptEditor";
import { toast } from "sonner";

interface AIVideoEditorProps {
  selectedFile: ContentFile | null;
  onProcess: (action: string, params: Record<string, unknown>) => Promise<VideoProcessResult>;
  processing: boolean;
}

function AIVideoEditorContent({ selectedFile, onProcess, processing }: AIVideoEditorProps) {
  const { mode } = useEditorMode();
  const [trimStart, setTrimStart] = useState([0]);
  const [trimEnd, setTrimEnd] = useState([100]);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [result, setResult] = useState<VideoProcessResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  
  // Creatomate render state
  const [headline, setHeadline] = useState("");
  const [subtext, setSubtext] = useState("");
  const [videoScript, setVideoScript] = useState("");
  const [selectedMusicUrl, setSelectedMusicUrl] = useState<string | null>(null);
  
  // Hybrid Mode state
  const [contentMode, setContentMode] = useState<'auto' | 'hybrid' | 'exact'>('auto');
  const [hybridBrief, setHybridBrief] = useState("");
  const [contentType, setContentType] = useState("reel");
  const [references, setReferences] = useState("");
  const [assets, setAssets] = useState("");
  
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  const {
    generate: generateHybrid,
    isGenerating: isGeneratingHybrid,
    output: hybridOutput,
    rawOutput: hybridRawOutput,
    reset: resetHybrid,
  } = useHybridGenerate();

  const actions = [
    {
      id: 'auto_cut',
      name: 'Auto Cut',
      icon: <Scissors className="w-5 h-5" />,
      description: 'AI finds best moments and creates cuts automatically',
    },
    {
      id: 'add_captions',
      name: 'Auto Captions',
      icon: <Type className="w-5 h-5" />,
      description: 'Generate and download SRT/VTT caption files',
    },
    {
      id: 'enhance',
      name: 'AI Enhance',
      icon: <Sparkles className="w-5 h-5" />,
      description: 'Get color, pacing, and enhancement suggestions',
    },
  ];

  const handleRenderReel = async () => {
    if (!selectedFile?.file_url) {
      toast.error("No video selected");
      return;
    }

    // Store preset data for MightyEdit and redirect
    setIsRedirecting(true);
    const mightyEditPreset = {
      videoUrl: selectedFile.file_url,
      headline: headline || undefined,
      subtext: subtext || undefined,
      organizationId: organizationId || undefined,
      musicUrl: selectedMusicUrl || undefined,
      videoScript,
      source: "ai_video_editor",
    };
    sessionStorage.setItem("mightyedit_preset", JSON.stringify(mightyEditPreset));
    toast.success("Redirecting to MightyEdit for rendering...");
    navigate("/mighty-edit");
  };

  const handleGenerateHybrid = async () => {
    if (!selectedFile?.file_url && contentMode !== 'auto') {
      toast.error("Please select a video or provide a brief");
      return;
    }

    await generateHybrid({
      organizationId,
      mode: contentMode,
      contentType,
      hybridBrief,
      references,
      assets,
      mediaUrl: selectedFile?.file_url,
    });
  };

  const handleSendHybridToRender = () => {
    if (hybridOutput?.hook) {
      setHeadline(hybridOutput.hook);
    }
    if (hybridOutput?.cta) {
      setSubtext(hybridOutput.cta);
    }
    toast.success("Applied to Creatomate render settings");
  };

  const handleAddHybridToScheduler = async () => {
    if (!hybridOutput) {
      toast.error("No hybrid content to schedule");
      return;
    }

    try {
      const { contentDB } = await import("@/integrations/supabase/client");

      const { error } = await contentDB.from("content_queue").insert({
        organization_id: organizationId,
        content_type: contentType,
        mode: contentMode,
        script: hybridOutput.script || null,
        caption: hybridOutput.caption || null,
        hashtags: hybridOutput.hashtags || [],
        cta_text: hybridOutput.cta || null,
        ai_metadata: {
          hook: hybridOutput.hook,
          overlays: hybridOutput.overlays,
          media_plan: hybridOutput.media_plan,
        },
        media_urls: selectedFile?.file_url ? [selectedFile.file_url] : [],
        status: "draft",
      });

      if (error) throw error;
      toast.success("Added to Content Scheduler!");
    } catch (err) {
      console.error("Failed to add to scheduler:", err);
      toast.error("Failed to add to scheduler");
    }
  };

  const handleProcess = async () => {
    if (!selectedAction || !selectedFile) return;
    
    try {
      const data = await onProcess(selectedAction, {
        file_id: selectedFile.id,
        file_url: selectedFile.file_url,
        trim_start: trimStart[0],
        trim_end: trimEnd[0],
        brand: selectedFile.brand
      });
      setResult(data);
    } catch (error) {
      console.error('Processing failed:', error);
    }
  };

  const handleToolSelect = (toolId: string) => {
    setSelectedTool(toolId);
    // Map sidebar tool to action for basic mode
    if (mode === 'basic') {
      if (toolId === 'auto_cut') setSelectedAction('auto_cut');
      else if (toolId === 'auto_captions') setSelectedAction('add_captions');
      else if (toolId === 'enhance') setSelectedAction('enhance');
    }
  };

  const downloadCaptions = (format: 'srt' | 'vtt') => {
    if (!result) return;
    const content = format === 'srt' ? result.captions_srt : result.captions_vtt;
    if (!content) return;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `captions.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded captions.${format}`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!selectedFile) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Wand2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium text-foreground mb-2">Select a Video to Edit</h3>
        <p className="text-muted-foreground text-sm">
          Choose a video from your library to start AI-powered editing
        </p>
      </Card>
    );
  }

  const isVideo = selectedFile.file_type === 'video' || selectedFile.file_type === 'reel';

  if (!isVideo) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Wand2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium text-foreground mb-2">Video Required</h3>
        <p className="text-muted-foreground text-sm">
          Select a video file to use the AI Video Editor
        </p>
      </Card>
    );
  }

  // Render content based on current mode
  const renderModeContent = () => {
    switch (mode) {
      case 'basic':
        return (
          <>
            {/* Trim Controls */}
            <Card>
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scissors className="w-4 h-4" />
                  Trim Video
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-3 sm:px-6">
                <div>
                  <label className="text-xs text-muted-foreground">Start Point</label>
                  <Slider
                    value={trimStart}
                    onValueChange={setTrimStart}
                    max={100}
                    step={1}
                    className="mt-2 touch-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">End Point</label>
                  <Slider
                    value={trimEnd}
                    onValueChange={setTrimEnd}
                    max={100}
                    step={1}
                    className="mt-2 touch-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Trimming from {trimStart[0]}% to {trimEnd[0]}%
                </p>
              </CardContent>
            </Card>

            {/* AI Actions */}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              {actions.map((action) => (
                <Card 
                  key={action.id}
                  className={`cursor-pointer transition-all ${
                    selectedAction === action.id 
                      ? 'ring-2 ring-primary border-primary' 
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedAction(action.id)}
                >
                  <CardContent className="py-3 sm:py-4 px-3 sm:px-4">
                    <div className="flex items-center sm:items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-foreground text-sm">{action.name}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">{action.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              className="w-full bg-gradient-to-r from-[hsl(var(--instagram-blue))] to-[hsl(var(--instagram-pink))] h-11 sm:h-12"
              size="lg"
              disabled={!selectedAction || processing}
              onClick={handleProcess}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Apply {selectedAction ? actions.find(a => a.id === selectedAction)?.name : 'Edit'}
                </>
              )}
            </Button>
          </>
        );

      case 'smart_assist':
        return (
          <Card className="p-8 text-center border-dashed">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary/50" />
            <h3 className="text-lg font-medium text-foreground mb-2">Smart Assist Coming Soon</h3>
            <p className="text-muted-foreground text-sm">
              AI-powered clip analysis, scene detection, and creative suggestions
            </p>
          </Card>
        );

      case 'auto_create':
        return (
          <Card className="p-8 text-center border-dashed">
            <Wand2 className="w-12 h-12 mx-auto mb-4 text-primary/50" />
            <h3 className="text-lg font-medium text-foreground mb-2">Auto Create Coming Soon</h3>
            <p className="text-muted-foreground text-sm">
              Fully automated timeline, variants, and multi-platform export
            </p>
          </Card>
        );

      case 'hybrid':
        return (
          <>
            <HybridModeSelector
              mode={contentMode}
              setMode={setContentMode}
              hybridBrief={hybridBrief}
              setHybridBrief={setHybridBrief}
              contentType={contentType}
              setContentType={setContentType}
              references={references}
              setReferences={setReferences}
              assets={assets}
              setAssets={setAssets}
            />

            {(contentMode === 'hybrid' || contentMode === 'exact') && (
              <Button
                className="w-full bg-gradient-to-r from-[hsl(var(--instagram-purple))] to-[hsl(var(--instagram-pink))]"
                size="lg"
                disabled={isGeneratingHybrid || !hybridBrief}
                onClick={handleGenerateHybrid}
              >
                {isGeneratingHybrid ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5 mr-2" />
                    Generate {contentMode === 'hybrid' ? 'Hybrid' : 'Exact'} Content
                  </>
                )}
              </Button>
            )}

            {(hybridOutput || hybridRawOutput) && (
              <HybridOutputDisplay
                output={hybridOutput}
                rawOutput={hybridRawOutput}
                onSendToRender={handleSendHybridToRender}
                onAddToScheduler={handleAddHybridToScheduler}
              />
            )}
          </>
        );

      case 'render':
        return (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5">
            <CardHeader className="pb-3 px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Video className="w-4 h-4 text-primary" />
                  Render Reel with Creatomate
                </CardTitle>
                <BrandVoiceIndicator />
              </div>
              <p className="text-xs text-muted-foreground">
                Add text overlays and music, then render a polished reel
              </p>
            </CardHeader>
            <CardContent className="space-y-4 px-3 sm:px-6">
              {/* Script Editor with Hook Tools */}
              <ScriptEditor
                value={videoScript}
                onChange={setVideoScript}
                assets={selectedFile ? [{ type: selectedFile.file_type, tags: selectedFile.tags || [] }] : []}
                label="Video Script / Hook"
                placeholder="Write your hook or use a template..."
              />

              {/* Text Overlays */}
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="headline" className="text-xs">Headline (Text-1)</Label>
                  <Input
                    id="headline"
                    placeholder="Your Text Here"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="bg-background h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subtext" className="text-xs">Subtext (Text-2)</Label>
                  <Input
                    id="subtext"
                    placeholder="Create & Automate Video"
                    value={subtext}
                    onChange={(e) => setSubtext(e.target.value)}
                    className="bg-background h-10"
                  />
                </div>
              </div>

              {/* Music Picker */}
              <MusicPicker
                selectedUrl={selectedMusicUrl}
                onSelect={setSelectedMusicUrl}
              />

              {/* Redirect Progress */}
              {isRedirecting && (
                <div className="space-y-2 p-4 rounded-lg bg-background/50 border border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      Redirecting to MightyEdit...
                    </span>
                  </div>
                </div>
              )}

              {/* Render Button */}
              <Button
                className="w-full bg-gradient-to-r from-[hsl(var(--instagram-blue))] via-[hsl(var(--instagram-purple))] to-[hsl(var(--instagram-pink))] hover:opacity-90"
                size="lg"
                disabled={isRedirecting || !selectedFile}
                onClick={handleRenderReel}
              >
                {isRedirecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <Video className="w-5 h-5 mr-2" />
                    Render in MightyEdit
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* Top Mode Tabs */}
      <EditorModeTabs />

      <div className="flex w-full gap-4">
        {/* Left Sidebar */}
        <EditorToolSidebar onToolSelect={handleToolSelect} selectedTool={selectedTool} />

        {/* Main Workspace */}
        <div className="flex-1 space-y-4 sm:space-y-6">
          {/* Video Preview */}
          <Card className="bg-black overflow-hidden">
            <div className="aspect-video relative">
              <video
                src={selectedFile.file_url}
                className="w-full h-full object-contain"
                controls={false}
              />
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-center gap-2 sm:gap-4 mb-2 sm:mb-3">
                  <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 h-9 w-9 sm:h-10 sm:w-10">
                    <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                  <Button size="icon" className="bg-white text-black hover:bg-white/90 h-10 w-10 sm:h-12 sm:w-12">
                    <Play className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 h-9 w-9 sm:h-10 sm:w-10">
                    <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 h-9 w-9 sm:h-10 sm:w-10">
                    <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </div>
                
                {/* Timeline */}
                <div className="space-y-1 sm:space-y-2">
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[hsl(var(--instagram-blue))] to-[hsl(var(--instagram-pink))]"
                      style={{ width: '35%' }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>0:00</span>
                    <span>{selectedFile.duration_seconds ? `${Math.floor(selectedFile.duration_seconds / 60)}:${String(Math.floor(selectedFile.duration_seconds % 60)).padStart(2, '0')}` : '0:00'}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Mode-specific content */}
          {renderModeContent()}

          {/* Results Display - shown in all modes */}
          {result && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  AI Processing Complete
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Captions */}
                {result.captions_srt && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Caption Files</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadCaptions('srt')}>
                        <Download className="w-4 h-4 mr-1" /> SRT
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadCaptions('vtt')}>
                        <Download className="w-4 h-4 mr-1" /> VTT
                      </Button>
                    </div>
                  </div>
                )}

                {/* Transcript */}
                {result.transcript && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-foreground">Transcript</p>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(result.transcript!)}>
                        {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground bg-muted p-3 rounded-lg max-h-32 overflow-y-auto">
                      {result.transcript}
                    </p>
                  </div>
                )}

                {/* Beat Sheet */}
                {result.beat_sheet && result.beat_sheet.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Beat Sheet</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {result.beat_sheet.map((beat, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-muted p-2 rounded">
                          <span className="text-primary font-mono">{beat.timestamp}</span>
                          <span className="text-muted-foreground">{beat.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cut Recommendations */}
                {result.cut_recommendations && result.cut_recommendations.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Recommended Cuts</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {result.cut_recommendations.map((cut, i) => (
                        <div key={i} className="text-xs bg-muted p-2 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-mono">{cut.start} → {cut.end}</span>
                            <span className="text-green-500">Score: {cut.score}/10</span>
                          </div>
                          <p className="text-muted-foreground mt-1">{cut.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enhancement Suggestions */}
                {result.enhancement_suggestions && result.enhancement_suggestions.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Enhancement Suggestions</p>
                    <ul className="space-y-1">
                      {result.enhancement_suggestions.map((suggestion, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <Sparkles className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIVideoEditor(props: AIVideoEditorProps) {
  return (
    <EditorModeProvider>
      <AIVideoEditorContent {...props} />
    </EditorModeProvider>
  );
}
