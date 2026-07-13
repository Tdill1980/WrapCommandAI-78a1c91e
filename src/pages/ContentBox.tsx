import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { useContentBox, ContentFile, ContentProject, ContentCalendarEntry } from "@/hooks/useContentBox";
import { useAutoCreateReel } from "@/hooks/useAutoCreateReel";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Upload, 
  Instagram, 
  Calendar, 
  Sparkles, 
  Loader2, 
  Image, 
  Video, 
  Play,
  Grid,
  LayoutList,
  FolderSync,
  Wand2,
  Scissors,
  Target,
  Repeat,
  Link2,
  Zap,
  Lightbulb,
  FolderOpen,
  Home,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { SINGLE_PATH_MODE } from "@/lib/featureFlags";
// Components
import { SourceIntegrationsPanel } from "@/components/contentbox/SourceIntegrationsPanel";
import { AIVideoEditor } from "@/components/contentbox/AIVideoEditor";
import { AdCreator } from "@/components/contentbox/AdCreator";
import { ContentRepurposer } from "@/components/contentbox/ContentRepurposer";
import { MediaLibrary } from "@/components/media/MediaLibrary";
import { ContentPlannerCalendar } from "@/components/calendar";
import { MetaVideoAdFastPanel } from "@/components/ads/MetaVideoAdFastPanel";
import { StaticAdDesigner } from "@/components/ads/StaticAdDesigner";
import { InspirationAIPanel } from "@/components/contentbox/InspirationAIPanel";
import { ContentRequestPanel } from "@/components/contentbox/ContentRequestPanel";
import { BulkVariationGenerator } from "@/components/content/BulkVariationGenerator";
import { ContentToolsNav } from "@/components/content/ContentToolsNav";
import { AssetGrid } from "@/components/assets/AssetGrid";

const BRANDS = [
  { value: 'all', label: 'All Brands' },
  { value: 'wpw', label: 'WePrintWraps' },
  { value: 'wraptv', label: 'WrapTV' },
  { value: 'inkandedge', label: 'Ink & Edge' },
];

const CONTENT_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'reel', label: 'Reels' },
];

const GOALS = [
  { value: 'sell', label: 'Sell' },
  { value: 'educate', label: 'Educate' },
  { value: 'entertain', label: 'Entertain' },
  { value: 'hype', label: 'Hype' },
  { value: 'convert', label: 'Convert' },
];

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
];

const STYLE_MODIFIERS = [
  { value: 'none', label: 'No Style Modifier', description: 'Pure brand voice' },
  { value: 'garyvee', label: 'Gary Vee', description: 'Raw, authentic, founder POV' },
  { value: 'sabrisuby', label: 'Sabri Suby', description: 'Direct response, conversion-focused' },
  { value: 'daradenney', label: 'Dara Denney', description: 'UGC, paid social, storytelling' },
];

// MediaCard moved to MediaLibrary component
import { ContentMetadataPanel, useContentMetadata, ContentMetadata } from "@/components/content/ContentMetadataPanel";

function GeneratorModal({ 
  open, 
  onClose, 
  selectedFiles,
  onGenerate,
  generating 
}: { 
  open: boolean; 
  onClose: () => void;
  selectedFiles: ContentFile[];
  onGenerate: (params: Record<string, unknown>) => void;
  generating: boolean;
}) {
  const [brand, setBrand] = useState('wpw');
  const [contentType, setContentType] = useState('reel');
  const [goal, setGoal] = useState('sell');
  const [platform, setPlatform] = useState('instagram');
  const [styleModifier, setStyleModifier] = useState('none');
  const [additionalContext, setAdditionalContext] = useState('');
  const [autoTransform, setAutoTransform] = useState(false);
  const [contentMetadata, setContentMetadata] = useState<ContentMetadata>({
    brand: 'wpw',
    channel: '@weprintwraps',
    contentPurpose: 'organic',
    platform: 'instagram',
  });

  const hasMismatch = selectedFiles.some(f => f.brand !== brand);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Generate Content Pack
          </DialogTitle>
          <DialogDescription>
            Create AI-powered content from {selectedFiles.length} selected media file(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Brand</label>
            <select
              className="w-full mt-1 bg-muted text-foreground p-2 rounded-md border border-border"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              {BRANDS.filter(b => b.value !== 'all').map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
              <option value="software">WrapCommand AI / RestylePro</option>
            </select>
          </div>

          {hasMismatch && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-400">Brand Mismatch Detected</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Some selected media was tagged for a different brand
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-muted-foreground">Auto-Transform</span>
                  <button
                    type="button"
                    onClick={() => setAutoTransform(!autoTransform)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      autoTransform ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span 
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        autoTransform ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>
              </div>
              {autoTransform && (
                <p className="text-xs text-primary mt-2 flex items-center gap-1">
                  <Wand2 className="w-3 h-3" />
                  Content will be automatically transformed to match {brand.toUpperCase()} brand style
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Content Type</label>
            <select
              className="w-full mt-1 bg-muted text-foreground p-2 rounded-md border border-border"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              <option value="reel">Reel</option>
              <option value="static">Static Post</option>
              <option value="carousel">Carousel</option>
              <option value="thumbnail">Thumbnail</option>
              <option value="story">Story</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Goal</label>
            <select
              className="w-full mt-1 bg-muted text-foreground p-2 rounded-md border border-border"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            >
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Platform</label>
            <select
              className="w-full mt-1 bg-muted text-foreground p-2 rounded-md border border-border"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Creative Style</label>
            <select
              className="w-full mt-1 bg-muted text-foreground p-2 rounded-md border border-border"
              value={styleModifier}
              onChange={(e) => setStyleModifier(e.target.value)}
            >
              {STYLE_MODIFIERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.description}
                </option>
              ))}
            </select>
            {styleModifier !== 'none' && (
              <p className="text-xs text-muted-foreground mt-1">
                {styleModifier === 'garyvee' && '🔥 Raw, punchy founder energy with cultural insight'}
                {styleModifier === 'sabrisuby' && '💰 Hardcore direct-response with PAS framework'}
                {styleModifier === 'daradenney' && '✨ Modern UGC storytelling optimized for paid social'}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Additional Context (optional)</label>
            <textarea
              className="w-full mt-1 bg-muted text-foreground p-2 rounded-md border border-border min-h-[80px]"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Add any specific details about the content..."
            />
          </div>

          {/* Content Metadata Panel */}
          <ContentMetadataPanel 
            metadata={contentMetadata} 
            onChange={setContentMetadata}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => onGenerate({
                brand: contentMetadata.brand,
                content_type: contentType,
                goal,
                platform: contentMetadata.platform,
                style: styleModifier,
                media_urls: selectedFiles.map(f => f.file_url),
                tags: selectedFiles.flatMap(f => f.tags || []),
                additional_context: additionalContext,
                auto_transform: autoTransform,
                channel: contentMetadata.channel,
                content_purpose: contentMetadata.contentPurpose,
                ad_placement: contentMetadata.adPlacement,
              })}
              className="bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" /> Generate
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CalendarView({ calendar }: { calendar: ContentCalendarEntry[] }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  
  const byDate = calendar?.reduce((acc, entry) => {
    const date = entry.scheduled_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, ContentCalendarEntry[]>) || {};

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map(day => (
        <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
          {day}
        </div>
      ))}
      {dates.map(date => {
        const entries = byDate[date] || [];
        const d = new Date(date);
        const isToday = date === today.toISOString().split('T')[0];
        
        return (
          <Card 
            key={date} 
            className={`p-2 min-h-[100px] ${isToday ? 'ring-2 ring-primary' : ''}`}
          >
            <div className="text-xs font-medium mb-1">
              {d.getDate()}
            </div>
            <div className="space-y-1">
              {entries.map(entry => (
                <div 
                  key={entry.id}
                  className={`text-xs p-1 rounded truncate ${
                    entry.brand === 'wpw' ? 'bg-blue-500/20 text-blue-400' :
                    entry.brand === 'wraptv' ? 'bg-green-500/20 text-green-400' :
                    'bg-purple-500/20 text-purple-400'
                  }`}
                >
                  {entry.title || entry.content_type}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function ContentBox() {
  const navigate = useNavigate();
  const { 
    files, 
    projects, 
    calendar, 
    isLoading, 
    uploadFile,
    generateContent,
    syncInstagram,
    generateCalendar,
    processVideo,
    generateAd,
    repurposeContent
  } = useContentBox();

  const autoCreateReel = useAutoCreateReel();

  const [selectedFiles, setSelectedFiles] = useState<ContentFile[]>([]);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('library');
  const [creatorTab, setCreatorTab] = useState('video-editor');
  const [showBulkGenerator, setShowBulkGenerator] = useState(false);
  const [syncingSource, setSyncingSource] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleAutoCreateReel = async () => {
    const result = await autoCreateReel.autoCreate({
      filterCategory: typeFilter === 'video' ? undefined : typeFilter,
    });

    if (result && result.selected_videos.length > 0) {
      // Navigate to ReelBuilder with pre-selected clips
      navigate("/organic/reel-builder", {
        state: {
          autoCreatedClips: result.selected_videos,
          reelConcept: result.reel_concept,
          suggestedHook: result.suggested_hook,
          suggestedCta: result.suggested_cta,
          musicVibe: result.music_vibe,
          autoRunSmartAssist: true,
        },
      });
    }
  };


  const handleConnectSource = (source: string) => {
    toast.info(`${source} integration coming soon!`);
  };

  const handleSyncSource = async (source: string) => {
    setSyncingSource(source);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setSyncingSource(null);
    toast.info(`${source} sync coming soon!`);
  };

  const handleVideoProcess = async (action: string, params: Record<string, unknown>) => {
    setProcessing(true);
    try {
      const result = await processVideo.mutateAsync({
        action,
        file_id: params.file_id as string,
        file_url: params.file_url as string,
        trim_start: params.trim_start as number,
        trim_end: params.trim_end as number,
        brand: params.brand as string
      });
      return result;
    } finally {
      setProcessing(false);
    }
  };

  const handleAdGenerate = async (params: Record<string, unknown>) => {
    setProcessing(true);
    try {
      const result = await generateAd.mutateAsync({
        brand: params.brand as string || 'wpw',
        objective: params.objective as string || params.ad_type as string,
        platform: params.platform as string,
        format: params.format as string,
        media_urls: params.media_urls as string[],
        headline: params.headline as string,
        cta: params.cta as string
      });
      return result;
    } finally {
      setProcessing(false);
    }
  };

  const handleRepurpose = async (params: Record<string, unknown>) => {
    setProcessing(true);
    try {
      const result = await repurposeContent.mutateAsync({
        brand: params.brand as string || 'wpw',
        organizationId: params.organizationId as string | undefined,
        source_type: params.source_type as string || 'video',
        source_filename: params.source_filename as string | undefined,
        source_tags: params.source_tags as string[] | undefined,
        source_transcript: params.source_transcript as string,
        target_formats: params.target_formats as string[] || params.formats as string[],
        enhancements: params.enhancements as string[]
      });
      return result;
    } finally {
      setProcessing(false);
    }
  };

  return (
    <MainLayout>
      {/* Bulk Variation Generator Modal */}
      <BulkVariationGenerator
        open={showBulkGenerator}
        onClose={() => setShowBulkGenerator(false)}
        onComplete={(bulkId) => {
          setShowBulkGenerator(false);
          navigate(`/bulk-variations?bulk_id=${bulkId}`);
        }}
      />

      {/* Content Request Panel - Ask the right agent */}
      <ContentRequestPanel />

      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <button 
          onClick={() => navigate("/")} 
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Dashboard</span>
        </button>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-medium">ContentBox</span>
      </nav>

      {/* Unified Content Tools Navigation */}
      <div className="mb-4">
        <ContentToolsNav />
      </div>

      {/* Header - Mobile Responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
            <span className="bg-gradient-to-r from-[#405DE6] via-[#833AB4] to-[#E1306C] bg-clip-text text-transparent">
              ContentBox
            </span>
            <span className="text-foreground">AI</span>
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base hidden sm:block">
            AI-powered content creation • Video editing • Ad generation • Repurposing
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Bulk Variations Button - Hidden in Single Path Mode */}
          {!SINGLE_PATH_MODE && (
            <Button 
              size="sm"
              className="sm:size-default"
              variant="outline"
              onClick={() => setShowBulkGenerator(true)}
            >
              <Sparkles className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Bulk Variations</span>
            </Button>
          )}

          {/* AI Auto-Create Reel Button - Redirects to ReelBuilder in Single Path Mode */}
          <Button 
            size="sm"
            className="sm:size-default bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            onClick={() => {
              if (SINGLE_PATH_MODE) {
                navigate("/organic/reel-builder");
              } else {
                handleAutoCreateReel();
              }
            }}
            disabled={!SINGLE_PATH_MODE && autoCreateReel.loading}
          >
            {autoCreateReel.loading && !SINGLE_PATH_MODE ? (
              <Loader2 className="w-4 h-4 animate-spin sm:mr-2" />
            ) : (
              <Zap className="w-4 h-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">{SINGLE_PATH_MODE ? "Go to Reel Builder" : "AI Auto-Create Reel"}</span>
            <span className="sm:hidden">{SINGLE_PATH_MODE ? "Builder" : "Auto"}</span>
          </Button>

          <Button 
            variant="outline" 
            size="sm"
            className="sm:size-default"
            onClick={() => syncInstagram.mutate({ brand: brandFilter === 'all' ? 'wpw' : brandFilter })}
            disabled={syncInstagram.isPending}
          >
            {syncInstagram.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin sm:mr-2" />
            ) : (
              <Instagram className="w-4 h-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Sync Instagram</span>
          </Button>
          
          {/* Generate Button - Hidden in Single Path Mode */}
          {selectedFiles.length > 0 && !SINGLE_PATH_MODE && (
            <Button 
              size="sm"
              className="sm:size-default bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
              onClick={() => setGeneratorOpen(true)}
            >
              <Sparkles className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Generate</span> ({selectedFiles.length})
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Mobile-friendly scrollable tabs */}
        <TabsList className="flex w-full overflow-x-auto no-scrollbar gap-1 p-1">
          <TabsTrigger value="library" className="flex-shrink-0 min-w-[44px] sm:min-w-fit px-3 sm:px-4">
            <Grid className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Library</span>
          </TabsTrigger>
          <TabsTrigger value="assets" className="flex-shrink-0 min-w-[44px] sm:min-w-fit px-3 sm:px-4">
            <FolderOpen className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Assets</span>
          </TabsTrigger>
          <TabsTrigger value="inspiration" className="flex-shrink-0 min-w-[44px] sm:min-w-fit px-3 sm:px-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 data-[state=active]:from-purple-500/20 data-[state=active]:to-pink-500/20">
            <Lightbulb className="w-4 h-4 sm:mr-2 text-purple-400" />
            <span className="hidden sm:inline">Inspiration AI</span>
          </TabsTrigger>
          <TabsTrigger value="sources" className="flex-shrink-0 min-w-[44px] sm:min-w-fit px-3 sm:px-4">
            <Link2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Sources</span>
          </TabsTrigger>
          <TabsTrigger value="create" className="flex-shrink-0 min-w-[44px] sm:min-w-fit px-3 sm:px-4">
            <Wand2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">AI Create</span>
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex-shrink-0 min-w-[44px] sm:min-w-fit px-3 sm:px-4">
            <Sparkles className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Projects</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex-shrink-0 min-w-[44px] sm:min-w-fit px-3 sm:px-4">
            <Calendar className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
        </TabsList>

        {/* Media Library Tab */}
        <TabsContent value="library" className="space-y-4">
          <MediaLibrary
            selectionMode={true}
            onSelect={(file, mode) => {
              // Add to selected files for use in editors
              setSelectedFiles(prev => {
                const exists = prev.find(f => f.id === file.id);
                if (exists) return prev.filter(f => f.id !== file.id);
                return [...prev, file as ContentFile];
              });

              toast.success(`Selected: ${file.original_filename || 'Media file'}`);

              // Route to appropriate editor based on mode
              if (mode === "reel" || mode === "hybrid") {
                setActiveTab("create");
                setCreatorTab("video-editor");
              }
              if (mode === "static") {
                setActiveTab("create");
                setCreatorTab("static-ad");
              }
              if (mode === "video-ad") {
                setActiveTab("create");
                setCreatorTab("video-ad-fast");
              }
            }}
          />
        </TabsContent>

        {/* Assets Tab - Video grid with manual tagging */}
        <TabsContent value="assets" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">Uploaded Assets</h2>
            <p className="text-sm text-muted-foreground">
              View and tag your uploaded videos. Tags are used by Smart Assist, Reel Builder, and Ads/Organic logic.
            </p>
          </div>
          <AssetGrid />
        </TabsContent>

        {/* Inspiration AI Tab */}
        <TabsContent value="inspiration" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Media Grid */}
            <div className="lg:col-span-2">
              <MediaLibrary
                selectionMode={true}
                onSelect={(file, mode) => {
                  setSelectedFiles(prev => {
                    const exists = prev.find(f => f.id === file.id);
                    if (exists) return prev.filter(f => f.id !== file.id);
                    return [...prev, file as ContentFile];
                  });
                  toast.success(`Selected for AI: ${file.original_filename || 'Media file'}`);
                }}
              />
            </div>
            
            {/* Right: AI Panel */}
            <div>
              <InspirationAIPanel 
                selectedMediaIds={selectedFiles.map(f => f.id)}
                onSelectHook={(hook) => {
                  navigator.clipboard.writeText(hook);
                  toast.success("Hook copied to clipboard!");
                }}
                onAdGenerated={(ad) => {
                  toast.success("Ad package created! Check the output panel.");
                }}
              />
            </div>
          </div>
        </TabsContent>

        {/* Source Integrations Tab */}
        <TabsContent value="sources" className="space-y-4">
          <SourceIntegrationsPanel
            onConnect={handleConnectSource}
            onSync={handleSyncSource}
            syncing={syncingSource}
          />
        </TabsContent>

        {/* AI Create Tab */}
        <TabsContent value="create" className="space-y-4">
          <Tabs value={creatorTab} onValueChange={setCreatorTab}>
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="video-editor">
                <Scissors className="w-4 h-4 mr-2" /> Video Editor
              </TabsTrigger>
              <TabsTrigger value="video-ad-fast">
                <Target className="w-4 h-4 mr-2" /> Video Ad Fast
              </TabsTrigger>
              <TabsTrigger value="static-ad">
                <Image className="w-4 h-4 mr-2" /> Static Ad
              </TabsTrigger>
              <TabsTrigger value="ad-creator">
                <Target className="w-4 h-4 mr-2" /> Ad Creator
              </TabsTrigger>
              <TabsTrigger value="repurposer">
                <Repeat className="w-4 h-4 mr-2" /> Repurposer
              </TabsTrigger>
            </TabsList>

            <TabsContent value="video-editor">
              <AIVideoEditor
                selectedFile={selectedFiles[0] || null}
                onProcess={handleVideoProcess}
                processing={processing}
              />
            </TabsContent>

            <TabsContent value="video-ad-fast">
              <MetaVideoAdFastPanel
                videoUrl={selectedFiles[0]?.file_type === "video" ? selectedFiles[0]?.file_url : undefined}
                videoThumbnail={selectedFiles[0]?.thumbnail_url || undefined}
              />
            </TabsContent>

            <TabsContent value="static-ad">
              <StaticAdDesigner
                mediaUrl={selectedFiles[0]?.file_type === "image" ? selectedFiles[0]?.file_url : undefined}
              />
            </TabsContent>

            <TabsContent value="ad-creator">
              <AdCreator
                selectedFiles={selectedFiles}
                onGenerate={handleAdGenerate}
                generating={processing}
              />
            </TabsContent>

            <TabsContent value="repurposer">
              <ContentRepurposer
                selectedFile={selectedFiles[0] || null}
                onRepurpose={handleRepurpose}
                processing={processing}
              />
            </TabsContent>
          </Tabs>

          {selectedFiles.length === 0 && (
            <Card className="p-6 bg-primary/5 border-primary/20">
              <p className="text-center text-muted-foreground text-sm">
                Select media from the <strong>Library</strong> tab first, then come back to create content
              </p>
            </Card>
          )}
        </TabsContent>

        {/* Content Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          {projects?.length === 0 ? (
            <Card className="p-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-foreground font-medium">No content projects yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                Select media and generate content to create projects
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects?.map(project => (
                <Card key={project.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge>{project.brand.toUpperCase()}</Badge>
                    <Badge variant="outline">{project.status}</Badge>
                  </div>
                  <h3 className="font-medium text-foreground mb-2">
                    {project.project_type} • {project.platform}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {project.ai_brief}
                  </p>
                  {project.ai_output && (
                    <div className="mt-3 space-y-1">
                      {(project.ai_output as { hooks?: string[] }).hooks?.slice(0, 1).map((hook, i) => (
                        <p key={i} className="text-xs text-primary italic">"{hook}"</p>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Calendar Tab - Instagram-Style Content Planner */}
        <TabsContent value="calendar" className="space-y-4">
          <ContentPlannerCalendar />
        </TabsContent>
      </Tabs>

      <GeneratorModal
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        selectedFiles={selectedFiles}
        onGenerate={async (params) => {
          await generateContent.mutateAsync(params as Parameters<typeof generateContent.mutateAsync>[0]);
          setGeneratorOpen(false);
          setSelectedFiles([]);
        }}
        generating={generateContent.isPending}
      />
    </MainLayout>
  );
}
