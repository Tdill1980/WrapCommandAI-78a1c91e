import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, GripVertical, Plus, Edit, Trash2, CheckCircle, Send } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, contentDB } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

export default function ContentSchedule() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const queryClient = useQueryClient();

  // Fetch scheduled content
  const { data: scheduledContent = [], isLoading } = useQuery({
    queryKey: ['content-schedule'],
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

  // Update status mutation
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await contentDB
        .from('content_calendar')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-schedule'] });
      toast.success('Status updated!');
    }
  });

  // Delete mutation
  const deleteContent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await contentDB
        .from('content_calendar')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-schedule'] });
      toast.success('Content removed from schedule');
    }
  });

  // Generate week days
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group content by date
  const contentByDate = scheduledContent.reduce((acc, item) => {
    const date = item.scheduled_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {} as Record<string, ScheduledContent[]>);

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram': return '📸';
      case 'facebook': return '👥';
      case 'tiktok': return '🎵';
      case 'youtube': return '▶️';
      default: return '📱';
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'published': return 'bg-green-500';
      case 'scheduled': return 'bg-blue-500';
      case 'draft': return 'bg-yellow-500';
      default: return 'bg-muted';
    }
  };

  const getBrandColor = (brand: string) => {
    switch (brand) {
      case 'wpw': return 'border-red-500 bg-red-500/10';
      case 'wraptv': return 'border-purple-500 bg-purple-500/10';
      case 'inkedge': return 'border-gray-500 bg-gray-500/10';
      default: return 'border-border';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Content Schedule</h1>
            <p className="text-muted-foreground">Plan and schedule your content across platforms</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant={viewMode === 'calendar' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('calendar')}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Calendar
            </Button>
            <Button 
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Content
            </Button>
          </div>
        </div>

        {/* Week Navigation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, -7))}
              >
                ← Previous Week
              </Button>
              <h2 className="text-lg font-semibold">
                {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
              </h2>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              >
                Next Week →
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayContent = contentByDate[dateStr] || [];
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

              return (
                <Card 
                  key={dateStr} 
                  className={`min-h-[200px] ${isToday ? 'ring-2 ring-primary' : ''}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex justify-between items-center">
                      <span>{format(day, 'EEE')}</span>
                      <span className={`text-lg ${isToday ? 'text-primary font-bold' : ''}`}>
                        {format(day, 'd')}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dayContent.map((item) => (
                      <div 
                        key={item.id}
                        className={`p-2 rounded-md border text-xs cursor-pointer hover:opacity-80 transition-opacity ${getBrandColor(item.brand)}`}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <span>{getPlatformIcon(item.platform)}</span>
                          <span className="font-medium truncate">{item.title || item.content_type}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{item.scheduled_time || '12:00'}</span>
                          <div className={`w-2 h-2 rounded-full ml-auto ${getStatusColor(item.status)}`} />
                        </div>
                      </div>
                    ))}
                    {dayContent.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No content</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              ) : scheduledContent.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No content scheduled</p>
                  <Button className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Schedule Content
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {scheduledContent.map((item) => (
                    <div 
                      key={item.id}
                      className={`p-4 rounded-lg border flex items-center gap-4 ${getBrandColor(item.brand)}`}
                    >
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getPlatformIcon(item.platform)}</span>
                          <span className="font-medium">{item.title || item.content_type}</span>
                          <Badge variant="outline">{item.brand.toUpperCase()}</Badge>
                          <Badge variant="secondary">{item.content_type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(item.scheduled_date), 'MMM d, yyyy')} at {item.scheduled_time || '12:00'}
                        </p>
                        {item.caption && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{item.caption}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(item.status)}>
                          {item.status || 'draft'}
                        </Badge>

                        {item.status === 'draft' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateStatus.mutate({ id: item.id, status: 'scheduled' })}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Confirm
                          </Button>
                        )}

                        {item.status === 'scheduled' && (
                          <Button 
                            size="sm"
                            onClick={() => updateStatus.mutate({ id: item.id, status: 'published' })}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Publish
                          </Button>
                        )}

                        <Button size="sm" variant="ghost">
                          <Edit className="h-4 w-4" />
                        </Button>

                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => deleteContent.mutate(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">
                {scheduledContent.filter(c => c.status === 'draft').length}
              </p>
              <p className="text-sm text-muted-foreground">Drafts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">
                {scheduledContent.filter(c => c.status === 'scheduled').length}
              </p>
              <p className="text-sm text-muted-foreground">Scheduled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">
                {scheduledContent.filter(c => c.status === 'published').length}
              </p>
              <p className="text-sm text-muted-foreground">Published</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">
                {scheduledContent.length}
              </p>
              <p className="text-sm text-muted-foreground">Total</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
