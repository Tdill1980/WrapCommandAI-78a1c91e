import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2, Calendar, CheckCircle } from 'lucide-react';
import { format, addMonths, startOfMonth, addDays, getDay } from 'date-fns';
import { supabase, contentDB } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface GenerateMonthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Brand voice presets
const BRAND_VOICES = [
  { id: 'WPW_COMMERCIAL', name: 'WPW Commercial', brand: 'wpw' },
  { id: 'INK_EDGE_EDITORIAL', name: 'Ink & Edge Editorial', brand: 'ink-edge' },
  { id: 'WRAPTVWORLD_CREATOR', name: 'WrapTVWorld Creator', brand: 'wraptv' },
  { id: 'SABRI_MARKETING', name: 'Sabri Marketing', brand: 'wpw' },
  { id: 'DARA_DIRECT', name: 'Dara Direct', brand: 'wpw' },
];

// Channel/platform options
const CHANNELS = [
  { id: 'instagram_reel', name: 'Instagram Reels', platform: 'Instagram', contentType: 'reel' },
  { id: 'instagram_carousel', name: 'Instagram Carousels', platform: 'Instagram', contentType: 'carousel' },
  { id: 'instagram_static', name: 'Instagram Static', platform: 'Instagram', contentType: 'static' },
  { id: 'youtube_short', name: 'YouTube Shorts', platform: 'YouTube', contentType: 'short' },
  { id: 'youtube_long', name: 'YouTube Long-Form', platform: 'YouTube', contentType: 'video' },
  { id: 'magazine', name: 'Ink & Edge Magazine', platform: 'Magazine', contentType: 'article' },
];

// Content mix templates
const CONTENT_TEMPLATES = {
  educational: [
    { title: 'How-To: Professional Wrap Techniques', directive: 'Create educational content showing professional wrapping techniques step-by-step' },
    { title: 'Common Wrap Mistakes to Avoid', directive: 'Highlight common wrapping errors and how to prevent them' },
    { title: 'Material Selection Guide', directive: 'Explain different wrap materials and when to use each' },
    { title: 'Tool Essentials for Wrap Installers', directive: 'Showcase essential tools every wrap installer needs' },
    { title: 'Surface Prep Best Practices', directive: 'Demonstrate proper surface preparation techniques' },
  ],
  authority: [
    { title: 'Industry Trend Analysis', directive: 'Share insights on current trends in the vehicle wrap industry' },
    { title: 'Case Study: Fleet Transformation', directive: 'Document a successful fleet wrap project from start to finish' },
    { title: 'Expert Interview Series', directive: 'Feature insights from industry experts and veteran installers' },
    { title: 'Behind the Scenes: Major Project', directive: 'Give exclusive look at a major wrap installation project' },
  ],
  promotional: [
    { title: 'CommercialPro Showcase', directive: 'Highlight CommercialPro product features and benefits' },
    { title: 'Bulk Order Benefits', directive: 'Promote bulk ordering discounts and advantages' },
    { title: 'Wall Wraps Collection', directive: 'Feature wall wrap capabilities and recent projects' },
    { title: 'Customer Success Story', directive: 'Share testimonial and results from satisfied customer' },
  ],
  culture: [
    { title: 'Team Spotlight', directive: 'Feature team member background and expertise' },
    { title: 'Shop Tour', directive: 'Give viewers a tour of the facility and workspace' },
    { title: 'Day in the Life', directive: 'Show authentic behind-the-scenes daily operations' },
  ],
};

export function GenerateMonthModal({ open, onOpenChange }: GenerateMonthModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);
  
  // Form state
  const [selectedMonth, setSelectedMonth] = useState(() => format(addMonths(new Date(), 1), 'yyyy-MM'));
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['instagram_reel', 'instagram_static', 'youtube_short']);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(['wpw', 'ink-edge', 'wraptv']);
  
  // NEW: Monthly theme - required input for content direction
  const [monthlyTheme, setMonthlyTheme] = useState('Professional Wrap Techniques');
  
  // NEW: Default style settings (dara + upbeat for premium positioning)
  const [captionStyle, setCaptionStyle] = useState<'sabri' | 'dara' | 'clean'>('dara');
  const [musicStyle, setMusicStyle] = useState<'upbeat' | 'cinematic' | 'hiphop' | 'none'>('upbeat');

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => 
      prev.includes(brand) 
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  };

  const getNextMonths = () => {
    const months = [];
    for (let i = 0; i <= 3; i++) {
      const date = addMonths(new Date(), i);
      months.push({
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy'),
      });
    }
    return months;
  };

  const generateContent = async () => {
    if (selectedChannels.length === 0) {
      toast({ title: 'Select at least one channel', variant: 'destructive' });
      return;
    }
    if (selectedBrands.length === 0) {
      toast({ title: 'Select at least one brand', variant: 'destructive' });
      return;
    }
    if (!monthlyTheme.trim()) {
      toast({ title: 'Enter a monthly theme', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setGeneratedCount(0);

    try {
      const entries: Array<{
        title: string;
        directive: string;
        scheduled_date: string;
        scheduled_time: string;
        content_type: string;
        platform: string;
        brand: string;
        status: string;
      }> = [];

      const monthStart = startOfMonth(new Date(selectedMonth + '-01'));
      
      // Generate 30 entries with content mix: 40% educational, 30% authority, 20% promotional, 10% culture
      const totalEntries = 30;
      const educationalCount = Math.floor(totalEntries * 0.4);
      const authorityCount = Math.floor(totalEntries * 0.3);
      const promotionalCount = Math.floor(totalEntries * 0.2);
      const cultureCount = totalEntries - educationalCount - authorityCount - promotionalCount;

      let dayOffset = 0;
      let entryIndex = 0;

      const createEntry = (template: { title: string; directive: string }, category: string) => {
        const channel = CHANNELS.find(c => selectedChannels.includes(c.id));
        if (!channel) return null;

        const brand = selectedBrands[entryIndex % selectedBrands.length];
        const channelForEntry = CHANNELS.filter(c => selectedChannels.includes(c.id))[entryIndex % selectedChannels.length];
        
        const scheduledDate = addDays(monthStart, dayOffset);
        // Skip weekends for business content
        if (getDay(scheduledDate) === 0 || getDay(scheduledDate) === 6) {
          dayOffset++;
          return null;
        }

        // Include monthly theme in directive and store style metadata
        const entry = {
          title: template.title,
          directive: `[${category.toUpperCase()}] [Theme: ${monthlyTheme}] ${template.directive}`,
          scheduled_date: format(scheduledDate, 'yyyy-MM-dd'),
          scheduled_time: '10:00:00',
          content_type: channelForEntry.contentType,
          platform: channelForEntry.platform,
          brand: brand,
          status: 'Needs Creating',
          // Store style preferences in notes for downstream use
          notes: JSON.stringify({
            monthlyTheme,
            captionStyle,
            musicStyle,
          }),
        };

        dayOffset++;
        entryIndex++;
        return entry;
      };

      // Add educational content (40%)
      for (let i = 0; i < educationalCount; i++) {
        const template = CONTENT_TEMPLATES.educational[i % CONTENT_TEMPLATES.educational.length];
        const entry = createEntry(template, 'educational');
        if (entry) entries.push(entry);
      }

      // Add authority content (30%)
      for (let i = 0; i < authorityCount; i++) {
        const template = CONTENT_TEMPLATES.authority[i % CONTENT_TEMPLATES.authority.length];
        const entry = createEntry(template, 'authority');
        if (entry) entries.push(entry);
      }

      // Add promotional content (20%)
      for (let i = 0; i < promotionalCount; i++) {
        const template = CONTENT_TEMPLATES.promotional[i % CONTENT_TEMPLATES.promotional.length];
        const entry = createEntry(template, 'promotional');
        if (entry) entries.push(entry);
      }

      // Add culture content (10%)
      for (let i = 0; i < cultureCount; i++) {
        const template = CONTENT_TEMPLATES.culture[i % CONTENT_TEMPLATES.culture.length];
        const entry = createEntry(template, 'culture');
        if (entry) entries.push(entry);
      }

      // Filter out nulls and sort by date
      const validEntries = entries.filter(Boolean).sort((a, b) => 
        a.scheduled_date.localeCompare(b.scheduled_date)
      );

      // Insert in batches
      const batchSize = 10;
      for (let i = 0; i < validEntries.length; i += batchSize) {
        const batch = validEntries.slice(i, i + batchSize);
        const { error } = await contentDB
          .from('content_calendar')
          .insert(batch);

        if (error) throw error;
        setGeneratedCount(prev => prev + batch.length);
      }

      toast({
        title: 'Content Generated!',
        description: `Created ${validEntries.length} calendar entries for ${format(monthStart, 'MMMM yyyy')}`,
      });

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ['studio-upcoming-content'] });
      queryClient.invalidateQueries({ queryKey: ['studio-calendar-stats'] });
      queryClient.invalidateQueries({ queryKey: ['content-calendar-30day'] });

      onOpenChange(false);
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate content',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Month of Content
          </DialogTitle>
          <DialogDescription>
            Create 30 text-only calendar entries with titles and directives. 
            All entries will be marked "Needs Creating" — no rendering or automation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Monthly Theme - Required */}
          <div className="space-y-2">
            <Label htmlFor="monthly-theme" className="flex items-center gap-1">
              Monthly Theme <span className="text-destructive">*</span>
            </Label>
            <Input
              id="monthly-theme"
              value={monthlyTheme}
              onChange={(e) => setMonthlyTheme(e.target.value)}
              placeholder="e.g., Professional Wrap Techniques"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              This theme will guide all AI content generation for the month
            </p>
          </div>

          {/* Month Selection */}
          <div className="space-y-2">
            <Label>Month to Generate</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getNextMonths().map(month => (
                  <SelectItem key={month.value} value={month.value}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {month.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Style Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Caption Style</Label>
              <Select value={captionStyle} onValueChange={(v: 'sabri' | 'dara' | 'clean') => setCaptionStyle(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dara">Dara (Professional)</SelectItem>
                  <SelectItem value="sabri">Sabri (Bold Caps)</SelectItem>
                  <SelectItem value="clean">Clean (Minimal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Music Style</Label>
              <Select value={musicStyle} onValueChange={(v: 'upbeat' | 'cinematic' | 'hiphop' | 'none') => setMusicStyle(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upbeat">Upbeat</SelectItem>
                  <SelectItem value="cinematic">Cinematic</SelectItem>
                  <SelectItem value="hiphop">Hip Hop</SelectItem>
                  <SelectItem value="none">No Music</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Channel Selection */}
          <div className="space-y-2">
            <Label>Channels to Include</Label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map(channel => (
                <div 
                  key={channel.id}
                  className="flex items-center space-x-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Checkbox 
                    id={channel.id}
                    checked={selectedChannels.includes(channel.id)}
                    onCheckedChange={() => toggleChannel(channel.id)}
                  />
                  <label 
                    htmlFor={channel.id}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {channel.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Brand Selection */}
          <div className="space-y-2">
            <Label>Brands</Label>
            <div className="flex flex-wrap gap-2">
              {['wpw', 'ink-edge', 'wraptv'].map(brand => (
                <div 
                  key={brand}
                  className="flex items-center space-x-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Checkbox 
                    id={`brand-${brand}`}
                    checked={selectedBrands.includes(brand)}
                    onCheckedChange={() => toggleBrand(brand)}
                  />
                  <label 
                    htmlFor={`brand-${brand}`}
                    className="text-sm cursor-pointer"
                  >
                    {brand === 'wpw' ? 'WePrintWraps' : brand === 'ink-edge' ? 'Ink & Edge' : 'WrapTVWorld'}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Content Mix Info */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium mb-1">Content Mix:</p>
            <p className="text-muted-foreground">
              40% Educational • 30% Authority • 20% Promotional • 10% Culture
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={generateContent} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating ({generatedCount})...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate 30 Entries
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
