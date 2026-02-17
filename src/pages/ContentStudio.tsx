import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Calendar, 
  FileText, 
  FolderOpen, 
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Lock,
  Wand2,
  Film
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase, contentDB } from '@/integrations/supabase/client';
import { format, addDays, isBefore, isToday, startOfDay } from 'date-fns';
import { GenerateMonthModal } from '@/components/studio/GenerateMonthModal';
import { CampaignContentCreator } from '@/components/studio/CampaignContentCreator';
import { isWithinCampaign } from '@/lib/campaign-prompts/january-2026';
import { SINGLE_PATH_MODE } from '@/lib/featureFlags';

interface CalendarItem {
  id: string;
  title: string | null;
  scheduled_date: string;
  status: string | null;
  content_type: string;
  platform: string;
  brand: string;
  directive?: string | null;
  locked_metadata?: any;
  intent_preset_id?: string | null;
}

export default function ContentStudio() {
  const navigate = useNavigate();
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [campaignCreatorOpen, setCampaignCreatorOpen] = useState(false);
  const [selectedCalendarItem, setSelectedCalendarItem] = useState<CalendarItem | null>(null);
  // Fetch upcoming content calendar entries (next 14 days)
  const { data: upcomingContent = [], refetch: refetchUpcoming } = useQuery({
    queryKey: ['studio-upcoming-content'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const twoWeeksOut = format(addDays(new Date(), 14), 'yyyy-MM-dd');
      
      const { data, error } = await contentDB
        .from('content_calendar')
        .select('id, title, scheduled_date, status, content_type, platform, brand, directive, locked_metadata, intent_preset_id')
        .gte('scheduled_date', today)
        .lte('scheduled_date', twoWeeksOut)
        .order('scheduled_date', { ascending: true })
        .limit(10);

      if (error) throw error;
      return (data || []) as CalendarItem[];
    }
  });

  // Fetch content drafts status
  const { data: draftStats } = useQuery({
    queryKey: ['studio-draft-stats'],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from('content_drafts')
        .select('status');

      if (error) throw error;
      
      const pending = data?.filter(d => d.status === 'pending' || d.status === 'draft').length || 0;
      const approved = data?.filter(d => d.status === 'approved').length || 0;
      const scheduled = data?.filter(d => d.status === 'scheduled').length || 0;
      
      return { pending, approved, scheduled, total: data?.length || 0 };
    }
  });

  // Fetch calendar stats
  const { data: calendarStats } = useQuery({
    queryKey: ['studio-calendar-stats'],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from('content_calendar')
        .select('status');

      if (error) throw error;
      
      const needsCreating = data?.filter(d => 
        !d.status || d.status === 'Needs Creating' || d.status === 'needs_creating'
      ).length || 0;
      const inProgress = data?.filter(d => d.status === 'In Progress' || d.status === 'in_progress').length || 0;
      const ready = data?.filter(d => d.status === 'Ready' || d.status === 'ready').length || 0;
      const posted = data?.filter(d => d.status === 'Posted' || d.status === 'posted').length || 0;
      
      return { needsCreating, inProgress, ready, posted, total: data?.length || 0 };
    }
  });

  const getStatusBadge = (status: string | null) => {
    if (!status || status === 'Needs Creating' || status === 'needs_creating') {
      return <Badge variant="destructive" className="text-xs">Needs Creating</Badge>;
    }
    if (status === 'In Progress' || status === 'in_progress') {
      return <Badge variant="secondary" className="text-xs">In Progress</Badge>;
    }
    if (status === 'Ready' || status === 'ready') {
      return <Badge className="bg-green-500/20 text-green-400 text-xs">Ready</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              Content Studio
            </h1>
            <p className="text-muted-foreground">
              Creative workspace for planning and drafting content
            </p>
          </div>
          {SINGLE_PATH_MODE ? (
            <Button 
              size="lg" 
              className="gap-2 bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
              onClick={() => navigate('/organic/reel-builder')}
            >
              <Film className="h-4 w-4" />
              Go to Reel Builder
            </Button>
          ) : (
            <Button 
              size="lg" 
              className="gap-2"
              onClick={() => setGenerateModalOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              Generate Month of Content
            </Button>
          )}
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{calendarStats?.needsCreating || 0}</p>
                  <p className="text-xs text-muted-foreground">Needs Creating</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Clock className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{calendarStats?.inProgress || 0}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{calendarStats?.ready || 0}</p>
                  <p className="text-xs text-muted-foreground">Ready</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{draftStats?.pending || 0}</p>
                  <p className="text-xs text-muted-foreground">Pending Drafts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Upcoming Content */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Content
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/content-calendar')}
              >
                View All
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingContent.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No upcoming content scheduled</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => setGenerateModalOpen(true)}
                  >
                    Generate Content
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingContent.slice(0, 6).map((item) => {
                    const isCampaignItem = isWithinCampaign(item.scheduled_date);
                    return (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                      >
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => navigate('/content-calendar')}
                        >
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">
                              {item.title || `${item.content_type} for ${item.brand}`}
                            </p>
                            {isCampaignItem && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">
                                <Lock className="h-2.5 w-2.5 mr-1" />
                                Jan 2026
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(item.scheduled_date), 'MMM d')} • {item.platform}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(item.status)}
                          {isCampaignItem && (!item.status || item.status === 'Needs Creating' || item.status === 'needs_creating') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCalendarItem(item);
                                setCampaignCreatorOpen(true);
                              }}
                            >
                              <Wand2 className="h-3.5 w-3.5 mr-1" />
                              Create
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Access */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => navigate('/content-calendar')}
              >
                <Calendar className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Content Calendar</p>
                  <p className="text-xs text-muted-foreground">View and manage scheduled content</p>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => navigate('/content-drafts')}
              >
                <FileText className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Content Drafts</p>
                  <p className="text-xs text-muted-foreground">
                    {draftStats?.pending || 0} pending • {draftStats?.approved || 0} approved
                  </p>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => navigate('/contentbox')}
              >
                <FolderOpen className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Media Library</p>
                  <p className="text-xs text-muted-foreground">Browse and manage media assets</p>
                </div>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Generation Info */}
        <Card className="border-dashed">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">AI-Assisted Content Generation</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Generate a full month of content drafts with titles, directives, and brand voice assignments. 
                  All entries are text-only drafts marked "Needs Creating" — no video rendering or autopilot.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">40% Educational</Badge>
                  <Badge variant="outline">30% Authority</Badge>
                  <Badge variant="outline">20% Promotional</Badge>
                  <Badge variant="outline">10% Culture</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <GenerateMonthModal 
        open={generateModalOpen} 
        onOpenChange={setGenerateModalOpen} 
      />

      {selectedCalendarItem && (
        <CampaignContentCreator
          open={campaignCreatorOpen}
          onOpenChange={setCampaignCreatorOpen}
          calendarItem={{
            id: selectedCalendarItem.id,
            title: selectedCalendarItem.title,
            scheduled_date: selectedCalendarItem.scheduled_date,
            content_type: selectedCalendarItem.content_type,
            platform: selectedCalendarItem.platform,
            brand: selectedCalendarItem.brand,
            directive: selectedCalendarItem.directive ?? null,
            locked_metadata: selectedCalendarItem.locked_metadata ?? null,
          }}
          onDraftSaved={() => {
            refetchUpcoming();
            setSelectedCalendarItem(null);
          }}
        />
      )}
    </MainLayout>
  );
}
