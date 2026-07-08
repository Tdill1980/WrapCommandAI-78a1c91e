import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface SavedView {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  target_file_type: "video" | "image" | "text" | "any";
  filter_json: Record<string, unknown>;
  sort_json: Record<string, unknown>;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedViewInput {
  name: string;
  description?: string;
  target_file_type: "video" | "image" | "text" | "any";
  filter_json: Record<string, unknown>;
  sort_json?: Record<string, unknown>;
}

export function useSavedViews() {
  const queryClient = useQueryClient();

  // List all saved views
  const { data: views, isLoading } = useQuery({
    queryKey: ["saved-views"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_views")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SavedView[];
    },
  });

  // Get single view
  const getView = async (id: string): Promise<SavedView | null> => {
    const { data, error } = await supabase
      .from("saved_views")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as SavedView;
  };

  // Create view
  const createViewMutation = useMutation({
    mutationFn: async (input: SavedViewInput) => {
      const { error } = await supabase.from("saved_views").insert({
        name: input.name,
        description: input.description || null,
        target_file_type: input.target_file_type,
        filter_json: input.filter_json as Json,
        sort_json: (input.sort_json || {}) as Json,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      toast.success("Saved view created");
    },
    onError: (err) => {
      console.error("Create view failed:", err);
      toast.error("Failed to create saved view");
    },
  });

  // Update view
  const updateViewMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<SavedViewInput> }) => {
      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.target_file_type !== undefined) updateData.target_file_type = input.target_file_type;
      if (input.filter_json !== undefined) updateData.filter_json = input.filter_json;
      if (input.sort_json !== undefined) updateData.sort_json = input.sort_json;

      const { error } = await supabase
        .from("saved_views")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      toast.success("Saved view updated");
    },
    onError: (err) => {
      console.error("Update view failed:", err);
      toast.error("Failed to update saved view");
    },
  });

  // Delete view
  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      toast.success("Saved view deleted");
    },
    onError: (err) => {
      console.error("Delete view failed:", err);
      toast.error("Failed to delete saved view");
    },
  });

  // Preview view - returns count of matching assets
  const previewView = async (view: SavedView | SavedViewInput): Promise<number> => {
    try {
      // Simple count query - just count assets matching file type
      // More advanced filtering can be added later via RPC
      let query = contentDB
        .from("content_files")
        .select("id", { count: "exact", head: true })
        .neq("content_category", "inspo_reference");

      if (view.target_file_type !== "any") {
        query = query.eq("file_type", view.target_file_type);
      }

      const { count, error } = await query.limit(100);

      if (error) {
        console.error("Preview query error:", error);
        return 0;
      }

      return count ?? 0;
    } catch (err) {
      console.error("Preview failed:", err);
      return 0;
    }
  };

  return {
    views,
    isLoading,
    getView,
    createView: createViewMutation.mutateAsync,
    updateView: (id: string, input: Partial<SavedViewInput>) =>
      updateViewMutation.mutateAsync({ id, input }),
    deleteView: deleteViewMutation.mutateAsync,
    previewView,
    isCreating: createViewMutation.isPending,
    isUpdating: updateViewMutation.isPending,
    isDeleting: deleteViewMutation.isPending,
  };
}
