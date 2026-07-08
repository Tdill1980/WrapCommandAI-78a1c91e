import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Lock, AlertTriangle, CheckCircle2, Copy, Film } from "lucide-react";
import { useHybridGenerate, CampaignOutput } from "@/hooks/useHybridGenerate";
import { JANUARY_2026_CAMPAIGN } from "@/lib/campaign-prompts/january-2026";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CampaignContentCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarItem?: {
    id: string;
    title: string | null;
    brand: string;
    content_type: string;
    platform: string;
    scheduled_date: string;
    directive?: string | null;
    locked_metadata?: Record<string, unknown> | null;
  } | null;
  organizationId?: string | null;
  onDraftSaved?: () => void;
}

const INTENT_PRESETS = [
  { value: "commercialpro_ad", label: "CommercialPro Ad" },
  { value: "bulk_discount", label: "Bulk Discount Promo" },
  { value: "premium_guarantee", label: "Premium Wrap Guarantee" },
  { value: "fast_production", label: "1-2 Day Production" },
  { value: "restylepro_preview", label: "RestylePro AI Previews" },
  { value: "shop_authority", label: "Shop Authority / Education" },
  { value: "transformation_reveal", label: "Transformation Reveal" },
];

export function CampaignContentCreator({
  open,
  onOpenChange,
  calendarItem,
  organizationId,
  onDraftSaved,
}: CampaignContentCreatorProps) {
  const navigate = useNavigate();
  const [contentMode, setContentMode] = useState<'meta' | 'organic'>('meta');
  const [intentPreset, setIntentPreset] = useState<string>('');
  const [additionalBrief, setAdditionalBrief] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const { 
    generateCampaignContent, 
    reset, 
    isGenerating, 
    campaignOutput, 
    rawOutput,
    error,
    violations 
  } = useHybridGenerate();

  // Hand-off to MightyEdit for actual video production
  const handleContinueToProduction = () => {
    if (!calendarItem || !campaignOutput) return;
    
    // Build preset for MightyEdit in the format it expects
    const preset = {
      source: 'campaign_creator',
      calendar_id: calendarItem.id,
      task_id: calendarItem.id, // For marking complete after render
      content_type: calendarItem.content_type,
      platform: calendarItem.platform,
      hook: campaignOutput.type === 'reel' ? campaignOutput.overlays?.[0]?.text : '',
      cta: campaignOutput.type === 'reel' ? campaignOutput.cta : '',
      caption: campaignOutput.caption,
      overlays: campaignOutput.type === 'reel' ? campaignOutput.overlays : [],
      brand: calendarItem.brand,
      scheduled_date: calendarItem.scheduled_date,
    };
    
    sessionStorage.setItem('mightyedit_preset', JSON.stringify(preset));
    handleClose();
    navigate('/mightyedit');
    toast.success('Opening MightyEdit — select a video to render your ad');
  };

  const handleGenerate = async () => {
    if (!calendarItem) return;
    
    await generateCampaignContent({
      organizationId,
      campaignId: JANUARY_2026_CAMPAIGN.id,
      contentType: calendarItem.content_type,
      contentMode,
      title: calendarItem.title || '',
      intentPreset: intentPreset || calendarItem.directive || '',
      brief: additionalBrief || calendarItem.directive || '',
    });
  };

  const handleSaveDraft = async () => {
    if (!calendarItem || !rawOutput) return;
    
    setIsSaving(true);
    try {
      // Save to content_drafts table
      const { error: insertError } = await contentDB.from('content_drafts').insert({
        organization_id: organizationId,
        content_type: calendarItem.content_type,
        platform: calendarItem.platform,
        caption: campaignOutput?.caption || null,
        status: 'pending',
        created_by_agent: `campaign:${JANUARY_2026_CAMPAIGN.id}`,
      });

      if (insertError) throw insertError;

      // Update calendar item status to in_progress
      await contentDB
        .from('content_calendar')
        .update({ status: 'in_progress', in_progress_at: new Date().toISOString() })
        .eq('id', calendarItem.id);

      toast.success('Draft saved! Ready for review.');
      onDraftSaved?.();
      handleClose();
    } catch (err) {
      console.error('Failed to save draft:', err);
      toast.error('Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyOutput = () => {
    if (rawOutput) {
      navigator.clipboard.writeText(rawOutput);
      toast.success('Copied to clipboard');
    }
  };

  const handleClose = () => {
    reset();
    setContentMode('meta');
    setIntentPreset('');
    setAdditionalBrief('');
    onOpenChange(false);
  };

  const campaign = JANUARY_2026_CAMPAIGN;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Campaign Content Creator
          </DialogTitle>
          <DialogDescription>
            Generate disciplined content for the January 2026 campaign
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Calendar Item Info */}
            {calendarItem && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{calendarItem.title || 'Untitled'}</span>
                  <Badge variant="outline">{calendarItem.scheduled_date}</Badge>
                </div>
                <div className="flex gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{calendarItem.brand}</Badge>
                  <Badge variant="secondary">{calendarItem.content_type}</Badge>
                  <Badge variant="secondary">{calendarItem.platform}</Badge>
                </div>
              </div>
            )}

            {/* Campaign Lock Indicator */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">CAMPAIGN LOCKED</span>
              </div>
              <p className="text-xs text-muted-foreground">{campaign.name}</p>
              <div className="flex gap-1 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs">Voice: {campaign.defaultVoice}</Badge>
                <Badge variant="outline" className="text-xs">Music: {campaign.musicStyle}</Badge>
                <Badge variant="outline" className="text-xs">Caption: {campaign.captionStyle}</Badge>
              </div>
            </div>

            {/* Mode Selection */}
            <div className="space-y-2">
              <Label>Content Mode</Label>
              <RadioGroup value={contentMode} onValueChange={(v) => setContentMode(v as 'meta' | 'organic')}>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="meta" id="meta" />
                    <Label htmlFor="meta" className="cursor-pointer">
                      <span className="font-medium">Meta Ad</span>
                      <span className="text-xs text-muted-foreground ml-1">(conversion, CTA allowed)</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="organic" id="organic" />
                    <Label htmlFor="organic" className="cursor-pointer">
                      <span className="font-medium">Organic</span>
                      <span className="text-xs text-muted-foreground ml-1">(authority, soft CTA)</span>
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Intent Preset */}
            <div className="space-y-2">
              <Label>Intent Preset</Label>
              <Select value={intentPreset} onValueChange={setIntentPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select intent..." />
                </SelectTrigger>
                <SelectContent>
                  {INTENT_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Additional Brief */}
            <div className="space-y-2">
              <Label>Additional Instructions (optional)</Label>
              <Textarea
                placeholder="Any specific directions beyond the calendar directive..."
                value={additionalBrief}
                onChange={(e) => setAdditionalBrief(e.target.value)}
                rows={3}
              />
            </div>

            {/* Generate Button - show if no raw output yet */}
            {!rawOutput && (
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Draft
                  </>
                )}
              </Button>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Generation Failed</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            )}

            {/* Violations Warning */}
            {violations && violations.length > 0 && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Forbidden Phrases Detected</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Removed: {violations.join(', ')}
                </p>
              </div>
            )}

            {/* Output Display */}
            {rawOutput && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-sm">Draft Generated</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleCopyOutput}>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                </div>
                
                <div className="p-3 rounded-lg bg-muted/50 border font-mono text-xs overflow-auto max-h-60">
                  <pre className="whitespace-pre-wrap">{rawOutput}</pre>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {rawOutput && (
            <>
              <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Save Draft Only
                  </>
                )}
              </Button>
              <Button onClick={handleContinueToProduction}>
                <Film className="w-4 h-4 mr-2" />
                Continue to Production
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
