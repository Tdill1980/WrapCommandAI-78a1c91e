import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StaticAdFile {
  id: string;
  file_url: string;
  file_type: string;
  content_category: string;
  original_filename: string | null;
  tags: string[] | null;
  ai_labels: any | null;
  metadata: any | null;
  created_at: string;
}

export function useStaticAds() {
  const queryClient = useQueryClient();

  const { data: staticAds = [], isLoading } = useQuery({
    queryKey: ['static-ads'],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from('content_files')
        .select('*')
        .eq('content_category', 'static_ad')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as StaticAdFile[];
    }
  });

  const deleteAdMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await contentDB
        .from('content_files')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['static-ads'] });
      toast.success('Static ad deleted');
    },
    onError: () => {
      toast.error('Failed to delete static ad');
    }
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['static-ads'] });
  };

  return {
    staticAds,
    isLoading,
    deleteAd: deleteAdMutation.mutate,
    refetch
  };
}
