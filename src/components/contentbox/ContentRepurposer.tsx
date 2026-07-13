import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Repeat, 
  Wand2, 
  Loader2,
  Image,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Smartphone,
  LayoutGrid,
  Copy,
  CheckCircle,
  Download
} from "lucide-react";
import { ContentFile, RepurposeResult } from "@/hooks/useContentBox";
import { toast } from "sonner";

interface ContentRepurposerProps {
  selectedFile: ContentFile | null;
  onRepurpose: (params: Record<string, unknown>) => Promise<RepurposeResult>;
  processing: boolean;
}

const OUTPUT_FORMATS = [
  { id: 'reel', name: 'Instagram Reel', icon: <RectangleVertical className="w-5 h-5" />, aspect: '9:16', type: 'video' },
  { id: 'story', name: 'Story', icon: <Smartphone className="w-5 h-5" />, aspect: '9:16', type: 'video' },
  { id: 'feed_video', name: 'Feed Video', icon: <Square className="w-5 h-5" />, aspect: '1:1', type: 'video' },
  { id: 'youtube_short', name: 'YouTube Short', icon: <RectangleVertical className="w-5 h-5" />, aspect: '9:16', type: 'video' },
  { id: 'tiktok', name: 'TikTok', icon: <RectangleVertical className="w-5 h-5" />, aspect: '9:16', type: 'video' },
  { id: 'thumbnail', name: 'Thumbnail', icon: <Image className="w-5 h-5" />, aspect: '16:9', type: 'image' },
  { id: 'carousel', name: 'Carousel (5 slides)', icon: <LayoutGrid className="w-5 h-5" />, aspect: '1:1', type: 'image' },
  { id: 'landscape', name: 'Landscape', icon: <RectangleHorizontal className="w-5 h-5" />, aspect: '16:9', type: 'video' },
];

const ENHANCEMENTS = [
  { id: 'auto_captions', name: 'Auto Captions', description: 'Add animated text overlays' },
  { id: 'hook_opener', name: 'Hook Opener', description: 'AI generates attention-grabbing intro' },
  { id: 'cta_ending', name: 'CTA Ending', description: 'Add call-to-action at the end' },
  { id: 'music', name: 'Trending Audio', description: 'Add royalty-free trending music' },
  { id: 'transitions', name: 'Smart Transitions', description: 'Add smooth transitions between cuts' },
];

export function ContentRepurposer({ selectedFile, onRepurpose, processing }: ContentRepurposerProps) {
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['reel', 'story']);
  const [selectedEnhancements, setSelectedEnhancements] = useState<string[]>(['auto_captions']);
  const [result, setResult] = useState<RepurposeResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleFormat = (formatId: string) => {
    setSelectedFormats(prev => 
      prev.includes(formatId) 
        ? prev.filter(f => f !== formatId)
        : [...prev, formatId]
    );
  };

  const toggleEnhancement = (enhId: string) => {
    setSelectedEnhancements(prev =>
      prev.includes(enhId)
        ? prev.filter(e => e !== enhId)
        : [...prev, enhId]
    );
  };

  const handleRepurpose = async () => {
    if (!selectedFile) return;
    
    try {
      const data = await onRepurpose({
        brand: selectedFile.brand,
        organizationId: (selectedFile as Record<string, unknown>).organization_id,
        source_type: selectedFile.file_type,
        source_filename: selectedFile.original_filename || undefined,
        source_tags: selectedFile.tags || undefined,
        source_transcript: selectedFile.transcript || undefined,
        target_formats: selectedFormats,
        enhancements: selectedEnhancements
      });
      setResult(data);
    } catch (error) {
      console.error('Repurposing failed:', error);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const downloadContentPack = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'content-pack.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded content pack");
  };

  if (!selectedFile) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Repeat className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium text-foreground mb-2">Select Content to Repurpose</h3>
        <p className="text-muted-foreground text-sm">
          Choose a video to transform into multiple formats
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Source Preview */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <div className="w-24 h-24 rounded-lg overflow-hidden bg-black flex-shrink-0">
            <img 
              src={selectedFile.thumbnail_url || selectedFile.file_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground">{selectedFile.original_filename || 'Untitled'}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{selectedFile.brand.toUpperCase()}</Badge>
              <Badge variant="outline">{selectedFile.file_type}</Badge>
              {selectedFile.duration_seconds && (
                <Badge variant="outline">
                  {Math.floor(selectedFile.duration_seconds / 60)}:{String(Math.floor(selectedFile.duration_seconds % 60)).padStart(2, '0')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedFile.tags?.slice(0, 3).join(', ')}
            </p>
          </div>
        </div>
      </Card>

      {/* Output Formats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" />
            Output Formats
          </CardTitle>
          <CardDescription className="text-xs">Select all formats you want to generate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {OUTPUT_FORMATS.map((format) => (
              <button
                key={format.id}
                onClick={() => toggleFormat(format.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedFormats.includes(format.id)
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={selectedFormats.includes(format.id) ? 'text-primary' : 'text-muted-foreground'}>
                    {format.icon}
                  </span>
                </div>
                <span className="font-medium text-xs text-foreground block">{format.name}</span>
                <Badge variant="secondary" className="text-[10px] mt-1">{format.aspect}</Badge>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {selectedFormats.length} format(s) selected
          </p>
        </CardContent>
      </Card>

      {/* Enhancements */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wand2 className="w-4 h-4" />
            AI Enhancements
          </CardTitle>
          <CardDescription className="text-xs">Add AI-powered improvements to all outputs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ENHANCEMENTS.map((enh) => (
            <label
              key={enh.id}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <Checkbox
                checked={selectedEnhancements.includes(enh.id)}
                onCheckedChange={() => toggleEnhancement(enh.id)}
              />
              <div className="flex-1">
                <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                  {enh.name}
                </span>
                <p className="text-xs text-muted-foreground">{enh.description}</p>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Generation Summary */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Ready to Generate</p>
              <p className="text-xs text-muted-foreground">
                {selectedFormats.length} formats × {selectedEnhancements.length} enhancements
              </p>
            </div>
            <Badge className="bg-gradient-to-r from-[#405DE6] to-[#E1306C]">
              ~{selectedFormats.length * 2} minutes
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
        size="lg"
        disabled={selectedFormats.length === 0 || processing}
        onClick={handleRepurpose}
      >
        {processing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Repurposing Content...
          </>
        ) : (
          <>
            <Repeat className="w-5 h-5 mr-2" />
            Repurpose to {selectedFormats.length} Formats
          </>
        )}
      </Button>

      {/* Results Display */}
      {result && result.formats && result.formats.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Content Repurposed
              </CardTitle>
              <Button size="sm" variant="outline" onClick={downloadContentPack}>
                <Download className="w-4 h-4 mr-1" /> Export Pack
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.formats.map((content) => {
              const formatId = content.format_id || content.format_name;
              return (
              <div key={formatId} className="bg-muted p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary">{(content.format_name || formatId).toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">{content.estimated_duration}</span>
                </div>

                {/* Hook */}
                <div className="mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Hook</span>
                    <Button size="sm" variant="ghost" className="h-6" onClick={() => copyToClipboard(content.hook_line, `${formatId}-hook`)}>
                      {copiedKey === `${formatId}-hook` ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{content.hook_line}</p>
                </div>

                {/* Script */}
                <div className="mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Script</span>
                    <Button size="sm" variant="ghost" className="h-6" onClick={() => copyToClipboard(content.script, `${formatId}-script`)}>
                      {copiedKey === `${formatId}-script` ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{content.script}</p>
                </div>

                {/* Caption */}
                <div className="mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Caption</span>
                    <Button size="sm" variant="ghost" className="h-6" onClick={() => copyToClipboard(content.caption, `${formatId}-caption`)}>
                      {copiedKey === `${formatId}-caption` ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{content.caption}</p>
                </div>

                {/* Hashtags */}
                <div className="flex flex-wrap gap-1">
                  {(content.hashtags || []).slice(0, 5).map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>

                {/* Thumbnail Titles */}
                {content.thumbnail_texts && content.thumbnail_texts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <span className="text-xs font-medium text-foreground">Thumbnail Titles</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {content.thumbnail_texts.map((title, i) => (
                        <Badge key={i} className="text-[10px] cursor-pointer" onClick={() => copyToClipboard(title, `${formatId}-thumb-${i}`)}>
                          {title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
