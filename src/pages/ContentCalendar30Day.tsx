import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Filter,
  RefreshCw,
  MessageSquare,
  Loader2,
  ListChecks,
  LayoutGrid,
  Sparkles
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, contentDB } from '@/integrations/supabase/client';
import { MainLayout } from '@/layouts/MainLayout';
import { cn } from '@/lib/utils';
import { ContentCalendarEditModal } from '@/components/calendar/ContentCalendarEditModal';
import { ContentExecutionList } from '@/components/calendar/ContentExecutionList';
import { useCalendarTaskSync, getAgentForContentType } from '@/hooks/useCalendarTaskSync';
import { CampaignContentCreator } from '@/components/studio/CampaignContentCreator';
import { isWithinCampaign } from '@/lib/campaign-prompts/january-2026';

interface ScheduledContent {
  id: string;
  title: string | null;
  brand: string;
  content_type: string;
  platform: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string | null;
  caption: string | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  content_calendar_id: string | null;
}

// Channel/Brand definitions - 4 unified buttons in order
const CHANNELS = [
  { id: 'all', name: 'All Channels', color: 'bg-muted', borderColor: 'border-muted-foreground' },
  { id: 'ink-edge-publisher', name: 'Ink & Edge Publisher', color: 'bg-indigo-600', borderColor: 'border-indigo-600', bgLight: 'bg-indigo-600/10' },
  { id: 'wpw', name: 'WePrintWraps.com', color: 'bg-red-500', borderColor: 'border-red-500', bgLight: 'bg-red-500/10' },
  { id: 'wraptv', name: 'WrapTVWorld', color: 'bg-purple-500', borderColor: 'border-purple-500', bgLight: 'bg-purple-500/10' },
  { id: 'ink-edge-content', name: 'Ink & Edge Content', color: 'bg-pink-500', borderColor: 'border-pink-500', bgLight: 'bg-pink-500/10' },
];

// Content type configuration for badges - mirrors MightyTask system
const CONTENT_TYPE_CONFIG: Record<string, { label: string; emoji: string; bgClass: string; textClass: string }> = {
  email: { label: 'Email', emoji: '📧', bgClass: 'bg-purple-500/20', textClass: 'text-purple-400' },
  ig_reel: { label: 'IG Reel', emoji: '📱', bgClass: 'bg-gradient-to-r from-pink-500/20 to-orange-500/20', textClass: 'text-pink-400' },
  ig_story: { label: 'IG Story', emoji: '📖', bgClass: 'bg-pink-500/20', textClass: 'text-pink-400' },
  fb_reel: { label: 'FB Reel', emoji: '📘', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' },
  fb_story: { label: 'FB Story', emoji: '📗', bgClass: 'bg-blue-400/20', textClass: 'text-blue-300' },
  meta_ad: { label: 'Meta Ad', emoji: '🎯', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  youtube_short: { label: 'YT Short', emoji: '▶️', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  youtube_video: { label: 'YouTube', emoji: '🎬', bgClass: 'bg-red-600/20', textClass: 'text-red-500' },
  article: { label: 'Article', emoji: '📰', bgClass: 'bg-indigo-500/20', textClass: 'text-indigo-400' },
  milestone: { label: 'Milestone', emoji: '🎯', bgClass: 'bg-yellow-500/20', textClass: 'text-yellow-400' },
  story: { label: 'Story', emoji: '📖', bgClass: 'bg-pink-500/20', textClass: 'text-pink-400' },
  reel: { label: 'Reel', emoji: '🎬', bgClass: 'bg-orange-500/20', textClass: 'text-orange-400' },
  ad: { label: 'Ad', emoji: '💰', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  short: { label: 'Short', emoji: '⚡', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  magazine: { label: 'Magazine', emoji: '📚', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-400' },
  carousel: { label: 'Carousel', emoji: '🎠', bgClass: 'bg-cyan-500/20', textClass: 'text-cyan-400' },
  static: { label: 'Static', emoji: '🖼️', bgClass: 'bg-teal-500/20', textClass: 'text-teal-400' },
};

// Maps content_type + platform to unified badge key
const getContentTypeKey = (contentType: string, platform: string): string => {
  const ct = contentType.toLowerCase();
  const pl = platform.toLowerCase();
  
  if (ct === 'reel' && pl === 'instagram') return 'ig_reel';
  if (ct === 'story' && pl === 'instagram') return 'ig_story';
  if (ct === 'reel' && pl === 'facebook') return 'fb_reel';
  if (ct === 'story' && pl === 'facebook') return 'fb_story';
  if ((ct === 'ad' || ct === 'reel-ad' || ct === 'static-ad') && (pl === 'meta' || pl === 'facebook' || pl === 'instagram')) return 'meta_ad';
  if ((ct === 'short' || ct === 'youtube_short') && pl === 'youtube') return 'youtube_short';
  if ((ct === 'video' || ct === 'youtube_video') && pl === 'youtube') return 'youtube_video';
  if (ct === 'email') return 'email';
  if (ct === 'article') return 'article';
  if (ct === 'milestone') return 'milestone';
  
  // Fallback to content type if no platform match
  return ct;
};

export default function ContentCalendar30Day() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selectedContent, setSelectedContent] = useState<ScheduledContent | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showCampaignCreator, setShowCampaignCreator] = useState(false);
  const [campaignItem, setCampaignItem] = useState<ScheduledContent | null>(null);

  // Check if execution mode is requested via URL
  const viewMode = searchParams.get('mode') === 'execute' ? 'execute' : 'calendar';

  const setViewMode = (mode: 'calendar' | 'execute') => {
    if (mode === 'execute') {
      setSearchParams({ mode: 'execute' });
    } else {
      setSearchParams({});
    }
  };

  // Calendar-Task sync hook
  const { syncTasks, isSyncing } = useCalendarTaskSync();

  // Fetch scheduled content
  const { data: scheduledContent = [], isLoading } = useQuery({
    queryKey: ['content-calendar-30day'],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from('content_calendar')
        .select('*')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (error) throw error;
      return data as ScheduledContent[];
    }
  });

  // Fetch tasks linked to calendar items
  const { data: tasks = [] } = useQuery({
    queryKey: ['calendar-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, content_calendar_id')
        .not('content_calendar_id', 'is', null);

      if (error) throw error;
      return data as Task[];
    }
  });

  // ═══════════════════════════════════════════════════════════
  // REDIRECT-OPEN: Handle navigation state from /mightytask guard
  // When campaign items are redirected here, auto-open the CampaignContentCreator
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const navState = location.state as { 
      openCampaign?: boolean; 
      calendarId?: string; 
      scheduledDate?: string; 
    } | null;
    
    if (!navState?.openCampaign || !navState?.calendarId) return;
    
    // Find the calendar item to open
    const itemToOpen = scheduledContent.find(item => item.id === navState.calendarId);
    if (itemToOpen) {
      setCampaignItem(itemToOpen);
      setShowCampaignCreator(true);
    }
    
    // Clear navigation state to prevent re-triggering on refresh
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.state, scheduledContent, navigate, location.pathname, location.search]);

  // Map tasks by content_calendar_id for quick lookup
  const tasksByCalendarId = useMemo(() => {
    return tasks.reduce((acc, task) => {
      if (task.content_calendar_id) {
        acc[task.content_calendar_id] = task;
      }
      return acc;
    }, {} as Record<string, Task>);
  }, [tasks]);

  // Check if content is created (task completed)
  const isContentCreated = (calendarItemId: string): boolean => {
    const task = tasksByCalendarId[calendarItemId];
    return task?.status === 'completed';
  };

  // Generate calendar days for the month (including padding days)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Filter content by selected channel
  const filteredContent = useMemo(() => {
    if (selectedChannel === 'all') return scheduledContent;
    return scheduledContent.filter(item => {
      const brandLower = item.brand.toLowerCase();
      // Map database brand values to our channel IDs
      if (selectedChannel === 'ink-edge-publisher') {
        return brandLower === 'ink-edge' || brandLower === 'inkedge' || brandLower === 'ink-edge-publisher';
      }
      if (selectedChannel === 'ink-edge-content') {
        return brandLower === 'ink-edge-content' || brandLower === 'ink-edge-dist';
      }
      if (selectedChannel === 'wpw') {
        return brandLower === 'wpw';
      }
      if (selectedChannel === 'wraptv') {
        return brandLower === 'wraptv' || brandLower === 'wraptvworld';
      }
      return false;
    });
  }, [scheduledContent, selectedChannel]);

  // Group content by date
  const contentByDate = useMemo(() => {
    return filteredContent.reduce((acc, item) => {
      const date = item.scheduled_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(item);
      return acc;
    }, {} as Record<string, ScheduledContent[]>);
  }, [filteredContent]);

  // Stats by channel
  const statsByChannel = useMemo(() => {
    const stats: Record<string, number> = {
      'ink-edge-publisher': 0,
      wpw: 0,
      wraptv: 0,
      'ink-edge-content': 0,
    };
    scheduledContent.forEach(item => {
      const brand = item.brand.toLowerCase();
      if (brand === 'wpw') stats.wpw++;
      else if (brand === 'ink-edge' || brand === 'inkedge' || brand === 'ink-edge-publisher') stats['ink-edge-publisher']++;
      else if (brand === 'wraptv' || brand === 'wraptvworld') stats.wraptv++;
      else if (brand === 'ink-edge-content' || brand === 'ink-edge-dist') stats['ink-edge-content']++;
    });
    return stats;
  }, [scheduledContent]);

  // Stats by content type
  const statsByType = useMemo(() => {
    const stats: Record<string, number> = {};
    scheduledContent.forEach(item => {
      const type = item.content_type.toLowerCase();
      stats[type] = (stats[type] || 0) + 1;
    });
    return stats;
  }, [scheduledContent]);

  const getChannelStyle = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower === 'ink-edge' || brandLower === 'inkedge' || brandLower === 'ink-edge-publisher') {
      return { border: 'border-l-4 border-l-indigo-600', bg: 'bg-indigo-600/10' };
    }
    if (brandLower === 'wpw') return { border: 'border-l-4 border-l-red-500', bg: 'bg-red-500/10' };
    if (brandLower === 'wraptv' || brandLower === 'wraptvworld') return { border: 'border-l-4 border-l-purple-500', bg: 'bg-purple-500/10' };
    if (brandLower === 'ink-edge-content' || brandLower === 'ink-edge-dist') return { border: 'border-l-4 border-l-pink-500', bg: 'bg-pink-500/10' };
    return { border: 'border-l-4 border-l-muted', bg: 'bg-muted/10' };
  };

  const getContentTypeBadge = (contentType: string, platform: string) => {
    const key = getContentTypeKey(contentType, platform);
    return CONTENT_TYPE_CONFIG[key] || { label: contentType, emoji: '📌', bgClass: 'bg-muted', textClass: 'text-muted-foreground' };
  };

  const getChannelLabel = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower === 'ink-edge' || brandLower === 'inkedge' || brandLower === 'ink-edge-publisher') return 'I&E Publisher';
    if (brandLower === 'wpw') return 'WPW';
    if (brandLower === 'wraptv' || brandLower === 'wraptvworld') return 'WrapTV';
    if (brandLower === 'ink-edge-content' || brandLower === 'ink-edge-dist') return 'I&E Content';
    return brand;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header with View Toggle */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Calendar className="h-8 w-8 text-primary" />
              Content Calendar
            </h1>
            <p className="text-muted-foreground">
              {viewMode === 'execute' 
                ? 'Execute due content — work top to bottom' 
                : '30-day view across all channels • Click to deploy agents'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'calendar' | 'execute')}>
              <TabsList>
                <TabsTrigger value="execute" className="gap-1">
                  <ListChecks className="w-4 h-4" />
                  Execute
                </TabsTrigger>
                <TabsTrigger value="calendar" className="gap-1">
                  <LayoutGrid className="w-4 h-4" />
                  Calendar
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => syncTasks()}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync
            </Button>
          </div>
        </div>

        {/* Execution Mode View */}
        {viewMode === 'execute' && (
          <ContentExecutionList />
        )}

        {/* Calendar Mode View */}
        {viewMode === 'calendar' && (
          <>
            {/* Action Banner */}
            <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-muted border border-border">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">📅 Content Calendar</p>
                  <p className="text-sm text-muted-foreground">
                    Click items to open agent chat and create content. Red items need creation.
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-indigo-600">
                <CardContent className="py-3 px-4">
                  <p className="text-2xl font-bold">{statsByChannel['ink-edge-publisher']}</p>
                  <p className="text-xs text-muted-foreground">I&E Publisher</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="py-3 px-4">
                  <p className="text-2xl font-bold">{statsByChannel.wpw}</p>
                  <p className="text-xs text-muted-foreground">WePrintWraps.com</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="py-3 px-4">
                  <p className="text-2xl font-bold">{statsByChannel.wraptv}</p>
                  <p className="text-xs text-muted-foreground">WrapTVWorld</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-pink-500">
                <CardContent className="py-3 px-4">
                  <p className="text-2xl font-bold">{statsByChannel['ink-edge-content']}</p>
                  <p className="text-xs text-muted-foreground">I&E Content</p>
                </CardContent>
              </Card>
            </div>

            {/* Channel Filter */}
            <div className="flex flex-wrap gap-2 items-center">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {CHANNELS.map(channel => (
                <Button
                  key={channel.id}
                  variant={selectedChannel === channel.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedChannel(channel.id)}
                  className={cn(
                    selectedChannel === channel.id && channel.id !== 'all' && `${channel.color} text-white hover:opacity-90`
                  )}
                >
                  {channel.id !== 'all' && (
                    <span className={cn('w-2 h-2 rounded-full mr-2', channel.color)} />
                  )}
                  {channel.name}
                </Button>
              ))}
            </div>

            {/* Month Navigation */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <Button variant="ghost" size="sm" onClick={() => navigateMonth('prev')}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">
                      {format(currentMonth, 'MMMM yyyy')}
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={goToToday}>
                      Today
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigateMonth('next')}>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, idx) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayContent = contentByDate[dateStr] || [];
                    const isCurrentMonthDay = isSameMonth(day, currentMonth);
                    const isTodayDay = isSameDay(day, new Date());

                    return (
                      <div
                        key={idx}
                        className={cn(
                          'min-h-[120px] border rounded-lg p-1 transition-colors',
                          isCurrentMonthDay ? 'bg-card' : 'bg-muted/30',
                          isTodayDay && 'ring-2 ring-primary'
                        )}
                      >
                        {/* Day Number */}
                        <div className={cn(
                          'text-sm font-medium mb-1 px-1',
                          !isCurrentMonthDay && 'text-muted-foreground/50',
                          isTodayDay && 'text-primary font-bold'
                        )}>
                          {format(day, 'd')}
                        </div>

                        {/* Content Items */}
                        <div className="space-y-1 overflow-y-auto max-h-[90px]">
                          {dayContent.slice(0, 3).map((item) => {
                            const channelStyle = getChannelStyle(item.brand);
                            const badgeConfig = getContentTypeBadge(item.content_type, item.platform);
                            const linkedTask = tasksByCalendarId[item.id];
                            const contentCreated = isContentCreated(item.id);
                            const hasLinkedTask = !!linkedTask;
                            
                            return (
                              <div
                                key={item.id}
                                className={cn(
                                  'text-[10px] p-1 rounded cursor-pointer hover:opacity-80 hover:ring-1 hover:ring-primary/50 transition-all relative',
                                  isWithinCampaign(item.scheduled_date)
                                    ? 'border-l-4 border-l-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                                    : hasLinkedTask && !contentCreated 
                                      ? 'border-l-4 border-l-red-500 bg-red-500/10' 
                                      : [channelStyle.border, channelStyle.bg]
                                )}
                                title={`${getChannelLabel(item.brand)} - ${badgeConfig.label}: ${item.title || 'Untitled'}${isWithinCampaign(item.scheduled_date) ? ' 🎯 Jan 2026 Campaign' : ''}${hasLinkedTask ? (contentCreated ? ' ✓ Created' : ' ⚠ Not Created') : ''}`}
                                onClick={() => {
                                  // Campaign gate: Jan 2026 items go to CampaignContentCreator
                                  if (isWithinCampaign(item.scheduled_date)) {
                                    setCampaignItem(item);
                                    setShowCampaignCreator(true);
                                    return;
                                  }
                                  
                                  // Legacy path - agent chat
                                  const agentId = getAgentForContentType(item.content_type);
                                  const context = {
                                    source: 'content_calendar',
                                    calendar_id: item.id,
                                    task_id: linkedTask?.id || null,
                                    content_type: getContentTypeKey(item.content_type, item.platform),
                                    platform: item.platform,
                                    brand: item.brand,
                                    title: item.title || 'Untitled',
                                    caption: item.caption || '',
                                    scheduled_date: item.scheduled_date,
                                    is_created: contentCreated,
                                  };
                                  
                                  sessionStorage.setItem('agent_chat_context', JSON.stringify(context));
                                  navigate(`/mightytask?agent=${agentId}&calendarId=${item.id}`);
                                }}
                              >
                                <div className="flex items-center gap-1 mb-0.5">
                                  {isWithinCampaign(item.scheduled_date) && (
                                    <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                                  )}
                                  <span className="font-medium truncate text-[9px]">
                                    {getChannelLabel(item.brand)}
                                  </span>
                                  {hasLinkedTask && !contentCreated && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                  )}
                                  {hasLinkedTask && contentCreated && (
                                    <span className="text-green-500 text-[8px]">✓</span>
                                  )}
                                </div>
                                <span className={cn(
                                  'inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[8px] font-medium',
                                  badgeConfig.bgClass,
                                  badgeConfig.textClass
                                )}>
                                  {badgeConfig.emoji} {badgeConfig.label}
                                </span>
                              </div>
                            );
                          })}
                          {dayContent.length > 3 && (
                            <div className="text-[10px] text-center text-muted-foreground">
                              +{dayContent.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Legend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6">
                  {/* Creation Status */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Creation Status</p>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="w-3 h-3 rounded bg-red-500" />
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        Not Created
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-green-500">✓</span>
                        Created
                      </div>
                    </div>
                  </div>

                  {/* Channels */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Channels</p>
                    <div className="flex flex-wrap gap-3">
                      {CHANNELS.filter(c => c.id !== 'all').map(channel => (
                        <div key={channel.id} className="flex items-center gap-1.5 text-sm">
                          <span className={cn('w-3 h-3 rounded', channel.color)} />
                          {channel.name}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Content Types */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Content Types</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(CONTENT_TYPE_CONFIG).slice(0, 8).map(([key, config]) => (
                        <span 
                          key={key}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                            config.bgClass,
                            config.textClass
                          )}
                        >
                          {config.emoji} {config.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Loading calendar...
          </div>
        )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      <ContentCalendarEditModal
        content={selectedContent}
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedContent(null);
        }}
        onUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ['content-calendar-30day'] });
        }}
        isContentCreated={selectedContent ? isContentCreated(selectedContent.id) : false}
      />

      {/* Campaign Content Creator Modal */}
      <CampaignContentCreator
        open={showCampaignCreator}
        onOpenChange={setShowCampaignCreator}
        calendarItem={campaignItem ? {
          id: campaignItem.id,
          title: campaignItem.title || 'Untitled',
          brand: campaignItem.brand,
          content_type: campaignItem.content_type,
          platform: campaignItem.platform,
          scheduled_date: campaignItem.scheduled_date,
          directive: campaignItem.caption || '',
          locked_metadata: null,
        } : null}
        organizationId={null}
        onDraftSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['content-calendar-30day'] });
          setShowCampaignCreator(false);
          setCampaignItem(null);
        }}
      />
    </MainLayout>
  );
}
