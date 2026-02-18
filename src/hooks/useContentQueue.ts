import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface ContentQueueItem {
  id: string;
  organization_id: string | null;
  content_type: string | null;
  mode: string | null;
  title: string | null;
  ai_prompt: string | null;
  script: string | null;
  caption: string | null;
  hashtags: string[] | null;
  cta_text: string | null;
  media_urls: string[] | null;
  output_url: string | null;
  scheduled_for: string | null;
  status: string | null;
  ai_metadata: Json | null;
  created_at: string | null;
  updated_at: string | null;
  // New metadata fields
  brand: string | null;
  channel: string | null;
  content_purpose: string | null;
  ad_placement: string | null;
  platform: string | null;
}

export function useContentQueue(organizationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["content-queue", organizationId],
    queryFn: async () => {
      let queryBuilder = contentDB
        .from("content_queue")
        .select("*")
        .order("created_at", { ascending: false });

      if (organizationId) {
        queryBuilder = queryBuilder.eq("organization_id", organizationId);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as ContentQueueItem[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      scheduled_for,
    }: {
      id: string;
      status: string;
      scheduled_for?: string;
    }) => {
      const updateData: Record<string, string> = { status };
      if (scheduled_for) {
        updateData.scheduled_for = scheduled_for;
      }

      const { error } = await contentDB
        .from("content_queue")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-queue"] });
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await contentDB
        .from("content_queue")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-queue"] });
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  const addItem = useMutation({
    mutationFn: async (item: Record<string, unknown>) => {
      const { error } = await contentDB.from("content_queue").insert([item as any]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-queue"] });
      toast.success("Added to content queue!");
    },
    onError: (error: Error) => {
      toast.error("Failed to add: " + error.message);
    },
  });

  // Group items by status for easy access
  const groupedByStatus = {
    draft: query.data?.filter((i) => i.status === "draft" || !i.status) || [],
    review: query.data?.filter((i) => i.status === "review") || [],
    approved: query.data?.filter((i) => i.status === "approved") || [],
    scheduled: query.data?.filter((i) => i.status === "scheduled") || [],
    deployed: query.data?.filter((i) => i.status === "deployed") || [],
  };

  // Group items by date for calendar view
  const groupedByDate = (query.data || []).reduce(
    (acc, item) => {
      const date = item.scheduled_for
        ? item.scheduled_for.split("T")[0]
        : "unscheduled";
      if (!acc[date]) acc[date] = [];
      acc[date].push(item);
      return acc;
    },
    {} as Record<string, ContentQueueItem[]>
  );

  return {
    ...query,
    items: query.data || [],
    groupedByStatus,
    groupedByDate,
    updateStatus,
    deleteItem,
    addItem,
  };
}
