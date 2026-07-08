import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, contentDB } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CalendarItem {
  id: string;
  title: string | null;
  brand: string;
  content_type: string;
  platform: string;
  scheduled_date: string;
  status: string | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  content_calendar_id: string | null;
  content_type: string | null;
}

// Agent mapping based on content type
const CONTENT_TYPE_AGENT_MAP: Record<string, string> = {
  ig_reel: 'noah_bennett',
  reel: 'noah_bennett',
  ig_story: 'noah_bennett',
  story: 'noah_bennett',
  fb_reel: 'noah_bennett',
  fb_story: 'noah_bennett',
  youtube_short: 'noah_bennett',
  short: 'noah_bennett',
  meta_ad: 'emily_carter',
  ad: 'emily_carter',
  email: 'emily_carter',
  article: 'ryan_mitchell',
  magazine: 'ryan_mitchell',
  static: 'noah_bennett',
  carousel: 'noah_bennett',
};

export function getAgentForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  return CONTENT_TYPE_AGENT_MAP[ct] || 'emily_carter';
}

export function useCalendarTaskSync() {
  const queryClient = useQueryClient();

  // Fetch all calendar items
  const { data: calendarItems = [] } = useQuery({
    queryKey: ['calendar-items-for-sync'],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from('content_calendar')
        .select('id, title, brand, content_type, platform, scheduled_date, status')
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data as CalendarItem[];
    }
  });

  // Fetch all tasks
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-for-sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, content_calendar_id, content_type');

      if (error) throw error;
      return data as Task[];
    }
  });

  // Mutation to sync tasks with calendar items
  const syncMutation = useMutation({
    mutationFn: async () => {
      const results = { linked: 0, created: 0, errors: 0 };
      
      // Get already linked calendar IDs
      const linkedCalendarIds = new Set(
        tasks.filter(t => t.content_calendar_id).map(t => t.content_calendar_id)
      );

      // Find unlinked calendar items
      const unlinkedItems = calendarItems.filter(item => !linkedCalendarIds.has(item.id));

      for (const item of unlinkedItems) {
        // Try to find a matching task by title and date
        const matchingTask = tasks.find(task => {
          if (task.content_calendar_id) return false; // Already linked
          
          const titleMatch = task.title.toLowerCase().includes((item.title || '').toLowerCase()) ||
                            (item.title || '').toLowerCase().includes(task.title.toLowerCase());
          const dateMatch = task.due_date === item.scheduled_date;
          
          return titleMatch && dateMatch;
        });

        if (matchingTask) {
          // Link existing task to calendar item
          const { error } = await supabase
            .from('tasks')
            .update({ content_calendar_id: item.id })
            .eq('id', matchingTask.id);

          if (error) {
            console.error('Failed to link task:', error);
            results.errors++;
          } else {
            results.linked++;
          }
        } else {
          // Create new task for this calendar item
          const agentId = getAgentForContentType(item.content_type);
          const { error } = await supabase
            .from('tasks')
            .insert({
              title: item.title || `Create ${item.content_type} for ${item.platform}`,
              description: `Auto-generated from Content Calendar. Brand: ${item.brand}, Platform: ${item.platform}`,
              status: 'pending',
              priority: 'normal',
              due_date: item.scheduled_date,
              content_calendar_id: item.id,
              content_type: item.content_type,
              assigned_agent: agentId,
            });

          if (error) {
            console.error('Failed to create task:', error);
            results.errors++;
          } else {
            results.created++;
          }
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-for-sync'] });
      queryClient.invalidateQueries({ queryKey: ['content-calendar-30day'] });
      
      if (results.linked > 0 || results.created > 0) {
        toast.success(`Synced: ${results.linked} linked, ${results.created} created`);
      } else {
        toast.info('All calendar items already have tasks');
      }
      
      if (results.errors > 0) {
        toast.error(`${results.errors} errors during sync`);
      }
    },
    onError: (error) => {
      console.error('Sync failed:', error);
      toast.error('Failed to sync calendar with tasks');
    }
  });

  return {
    calendarItems,
    tasks,
    syncTasks: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
    getAgentForContentType,
  };
}
