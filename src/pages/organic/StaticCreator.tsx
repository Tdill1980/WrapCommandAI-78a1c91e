import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Image,
  Images,
  Sparkles,
  Type,
  Palette,
  Download,
  Loader2,
  Wand2,
  Settings,
  Upload,
  LayoutGrid,
  Copy,
  Check,
} from "lucide-react";
import { ContentMetadataPanel, useContentMetadata } from "@/components/content/ContentMetadataPanel";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadToDevice, copyToClipboard, generateFilename } from "@/lib/downloadUtils";
import { StyleReferenceUpload, type ExtractedStyle } from "@/components/static-creator/StyleReferenceUpload";
import { CopyBoostModal } from "@/components/static-creator/CopyBoostModal";
import { CarouselTopicGenerator } from "@/components/static-creator/CarouselTopicGenerator";

const TEMPLATES = [
  { id: "before-after", name: "Before/After", icon: "↔️" },
  { id: "quote-card", name: "Quote Card", icon: "💬" },
  { id: "tips-list", name: "Tips List", icon: "📋" },
  { id: "product-feature", name: "Product Feature", icon: "✨" },
  { id: "magazine-cover", name: "Magazine Cover", icon: "📰" },
  { id: "stat-highlight", name: "Stat Highlight", icon: "📊" },
];

interface LocationState {
  calendarItem?: {
    id: string;
    title: string;
    scheduled_date: string;
  };
  autoGenerate?: boolean;
}

export default function StaticCreator() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | undefined;
  
  const [contentMetadata, setContentMetadata] = useContentMetadata("wpw");
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("single");
  const [generating, setGenerating] = useState(false);
  const [headline, setHeadline] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedCaption, setGeneratedCaption] = useState<string | null>(null);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [carouselSlides, setCarouselSlides] = useState<string[]>([]);
  const [captionCopied, setCaptionCopied] = useState(false);
  
  // NEW: AI Copy Boost & Upload States
  const [copyBoostOpen, setCopyBoostOpen] = useState(false);
  const [extractedStyle, setExtractedStyle] = useState<ExtractedStyle | null>(null);
  const [styleReferenceUrl, setStyleReferenceUrl] = useState<string | null>(null);
  const [wrappedVehicleUrl, setWrappedVehicleUrl] = useState<string | null>(null);
  const [isBoosted, setIsBoosted] = useState(false);
  const handleGenerateSingle = async () => {
    if (!headline.trim()) {
      toast.error("Please enter a headline");
      return;
    }

    setGenerating(true);
    try {
      // Call AI to generate static post with enhanced options
      const { data, error } = await lovableFunctions.functions.invoke("ai-generate-static", {
        body: {
          template: selectedTemplate || "product-feature",
          headline,
          bodyText,
          ctaText,
          brand: contentMetadata.brand,
          platform: contentMetadata.platform,
          contentPurpose: contentMetadata.contentPurpose,
          // NEW: Pass style reference and vehicle photo if available
          styleReference: extractedStyle ? {
            imageUrl: styleReferenceUrl,
            extractedStyle,
          } : undefined,
          wrappedVehicleUrl,
        },
      });

      if (error) throw error;

      if (data?.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
        setGeneratedCaption(data.caption || null);
        setGeneratedHashtags(data.hashtags || []);
        
        // Save to content_queue
        await contentDB.from("content_queue").insert({
          content_type: "static",
          status: "draft",
          title: headline,
          caption: data.caption || bodyText,
          cta_text: ctaText,
          output_url: data.imageUrl,
          brand: contentMetadata.brand,
          channel: contentMetadata.channel,
          content_purpose: contentMetadata.contentPurpose,
          platform: contentMetadata.platform,
          ad_placement: contentMetadata.adPlacement,
          mode: "auto",
          ai_metadata: {
            template: selectedTemplate,
            design: data.design,
            hashtags: data.hashtags,
            generated_at: new Date().toISOString(),
          },
        });

        toast.success("Static post created!");
      } else {
        // Fallback: create placeholder in queue
        await contentDB.from("content_queue").insert({
          content_type: "static",
          status: "draft",
          title: headline,
          caption: bodyText,
          cta_text: ctaText,
          brand: contentMetadata.brand,
          channel: contentMetadata.channel,
          content_purpose: contentMetadata.contentPurpose,
          platform: contentMetadata.platform,
          ad_placement: contentMetadata.adPlacement,
          mode: "auto",
          ai_metadata: {
            template: selectedTemplate,
            needs_design: true,
            generated_at: new Date().toISOString(),
          },
        });
        
        toast.success("Content brief saved! Ready for design.");
      }
    } catch (err) {
      console.error("Generation failed:", err);
      toast.error("Failed to generate. Brief saved as draft.");
      
      // Still save the brief
      await contentDB.from("content_queue").insert({
        content_type: "static",
        status: "draft",
        title: headline,
        caption: bodyText,
        brand: contentMetadata.brand,
        channel: contentMetadata.channel,
        content_purpose: contentMetadata.contentPurpose,
        platform: contentMetadata.platform,
        mode: "manual",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateCarousel = async () => {
    if (!headline.trim()) {
      toast.error("Please enter a headline");
      return;
    }

    setGenerating(true);
    try {
      // Save carousel brief to queue
      await contentDB.from("content_queue").insert({
        content_type: "carousel",
        status: "draft",
        title: headline,
        caption: bodyText,
        cta_text: ctaText,
        brand: contentMetadata.brand,
        channel: contentMetadata.channel,
        content_purpose: contentMetadata.contentPurpose,
        platform: contentMetadata.platform,
        ad_placement: contentMetadata.adPlacement,
        mode: "auto",
        ai_metadata: {
          slides_planned: 5,
          template: selectedTemplate,
          generated_at: new Date().toISOString(),
        },
      });

      toast.success("Carousel brief saved! Ready for design.");
    } catch (err) {
      console.error("Failed to save carousel:", err);
      toast.error("Failed to save carousel brief");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/organic")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg flex items-center gap-2">
                <Images className="w-5 h-5" />
                Static / Carousel Creator
              </h1>
              <p className="text-xs text-muted-foreground">
                Create organic static posts & carousels
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setMetadataOpen(!metadataOpen)}
            className={metadataOpen ? "bg-primary/10 border-primary/40" : ""}
          >
            <Settings className="w-4 h-4 mr-1.5" />
            {contentMetadata.brand.toUpperCase()} • {contentMetadata.contentPurpose === 'paid' ? '💰' : '🌱'}
          </Button>
        </div>
      </div>

      {/* Content Metadata Panel */}
      {metadataOpen && (
        <div className="max-w-5xl mx-auto px-4 py-3 border-b border-border/30 bg-card/30">
          <ContentMetadataPanel 
            metadata={contentMetadata} 
            onChange={setContentMetadata}
            showContentType
          />
        </div>
      )}

      <div className="max-w-5xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <Image className="w-4 h-4" />
              Single Post
            </TabsTrigger>
            <TabsTrigger value="carousel" className="flex items-center gap-2">
              <Images className="w-4 h-4" />
              Carousel
            </TabsTrigger>
          </TabsList>

          {/* Single Post Tab */}
          <TabsContent value="single" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    Content Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Headline *</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => setCopyBoostOpen(true)}
                        disabled={!headline.trim()}
                      >
                        <Sparkles className="w-3 h-3" />
                        AI Boost
                      </Button>
                    </div>
                    <Input 
                      placeholder="Main headline for your post..."
                      value={headline}
                      onChange={(e) => {
                        setHeadline(e.target.value);
                        setIsBoosted(false);
                      }}
                    />
                    {isBoosted && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Sparkles className="w-3 h-3" />
                        AI Enhanced
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Body Text</Label>
                    <Textarea 
                      placeholder="Supporting text or description..."
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CTA Text</Label>
                    <Input 
                      placeholder="e.g., Shop Now, Learn More..."
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                    />
                  </div>

                  {/* NEW: Upload Sections */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <StyleReferenceUpload
                      type="style"
                      onStyleExtracted={(style, imageUrl) => {
                        setExtractedStyle(style);
                        setStyleReferenceUrl(imageUrl);
                      }}
                    />
                    <StyleReferenceUpload
                      type="vehicle"
                      onVehicleUploaded={(imageUrl) => {
                        setWrappedVehicleUrl(imageUrl);
                      }}
                    />
                  </div>

                  <Button 
                    onClick={handleGenerateSingle}
                    disabled={generating || !headline.trim()}
                    className="w-full bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Generate with AI
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Template Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    Quick Templates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`aspect-square rounded-lg border-2 transition-all flex flex-col items-center justify-center p-4 text-center ${
                          selectedTemplate === template.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50 bg-muted/50"
                        }`}
                      >
                        <span className="text-2xl mb-2">{template.icon}</span>
                        <span className="text-sm font-medium">{template.name}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview */}
            {generatedImageUrl && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Generated Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="aspect-square max-w-md mx-auto rounded-lg overflow-hidden border border-border">
                    <img 
                      src={generatedImageUrl} 
                      alt="Generated static post" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {/* Caption & Hashtags */}
                  {(generatedCaption || generatedHashtags.length > 0) && (
                    <div className="max-w-md mx-auto space-y-3">
                      {generatedCaption && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Caption</span>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-6 px-2"
                              onClick={async () => {
                                await copyToClipboard(generatedCaption, "Caption copied!");
                                setCaptionCopied(true);
                                setTimeout(() => setCaptionCopied(false), 2000);
                              }}
                            >
                              {captionCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </Button>
                          </div>
                          <p className="text-sm">{generatedCaption}</p>
                        </div>
                      )}
                      {generatedHashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {generatedHashtags.map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {tag.startsWith("#") ? tag : `#${tag}`}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-2 justify-center">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => downloadToDevice(generatedImageUrl, generateFilename("static-post", "png"))}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button size="sm" onClick={() => navigate("/content-schedule")}>
                      Schedule Post
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Carousel Tab */}
          <TabsContent value="carousel" className="space-y-6">
            <Card>
              <CardContent className="p-8">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#833AB4] to-[#E1306C] flex items-center justify-center mx-auto">
                    <Images className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg">Create Carousel</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Build a multi-slide carousel with cohesive design. AI will help you structure the content flow.
                  </p>

                  {/* AI Topic Generator Button */}
                  <div className="flex justify-center">
                    <CarouselTopicGenerator
                      brand={contentMetadata.brand}
                      onTopicGenerated={(topic) => {
                        setHeadline(topic.title);
                        // Convert slides to body text (one per line)
                        const slidePoints = topic.slides
                          .map((s, i) => `${i + 1}. ${s.headline}: ${s.body}`)
                          .join("\n\n");
                        setBodyText(slidePoints);
                        if (topic.cta) setCtaText(topic.cta);
                      }}
                    />
                  </div>

                  <div className="max-w-md mx-auto space-y-4 text-left">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Carousel Topic *</Label>
                        {headline && (
                          <Badge variant="secondary" className="text-xs">
                            AI Generated
                          </Badge>
                        )}
                      </div>
                      <Input 
                        placeholder="What's your carousel about?"
                        value={headline}
                        onChange={(e) => setHeadline(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Key Points (one per slide)</Label>
                      <Textarea 
                        placeholder="Enter each slide's main point on a new line..."
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        className="min-h-[120px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CTA Text</Label>
                      <Input 
                        placeholder="e.g., Get Your Quote Today"
                        value={ctaText}
                        onChange={(e) => setCtaText(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button 
                    className="mt-4 bg-gradient-to-r from-[#833AB4] to-[#E1306C]"
                    onClick={handleGenerateCarousel}
                    disabled={generating || !headline.trim()}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Carousel
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Compact Metadata Display */}
        <div className="mt-6">
          <ContentMetadataPanel 
            metadata={contentMetadata} 
            onChange={setContentMetadata}
            compact
          />
        </div>
      </div>

      {/* AI Copy Boost Modal */}
      <CopyBoostModal
        open={copyBoostOpen}
        onOpenChange={setCopyBoostOpen}
        rawHeadline={headline}
        rawBody={bodyText}
        rawCta={ctaText}
        onBoosted={(result) => {
          setHeadline(result.headline);
          if (result.primary_text) setBodyText(result.primary_text);
          if (result.cta) setCtaText(result.cta);
          setIsBoosted(true);
          toast.success("Copy enhanced! Ready to generate.");
        }}
      />
    </div>
  );
}
