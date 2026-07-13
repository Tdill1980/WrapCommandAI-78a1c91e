import { useState } from "react";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface StyleAnalysis {
  pacing: {
    cutsPerSecond: number;
    averageClipLength: number;
    rhythm: "slow" | "medium" | "fast" | "variable";
  };
  color: {
    palette: string[];
    mood: string;
    saturation: "muted" | "balanced" | "vibrant";
    contrast: "low" | "medium" | "high";
  };
  structure: {
    hook: { duration: number; style: string };
    body: { duration: number; style: string };
    cta: { duration: number; style: string };
  };
  overlays: {
    textStyle: string;
    fontSize: "small" | "medium" | "large";
    fontWeight: "light" | "regular" | "bold";
    position: "top" | "center" | "bottom";
    animation: string;
  };
  hooks: string[];
  cta: string;
  music: {
    genre: string;
    energy: "low" | "medium" | "high";
    bpm: number;
  };
  transitions: string[];
}

export interface InspoAnalysis {
  id: string;
  organization_id: string | null;
  source_url: string;
  platform: string;
  thumbnail_url: string | null;
  analysis_data: StyleAnalysis;
  is_saved: boolean;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export function useInspoAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  // Fetch history
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["inspo-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspo_analyses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []).map((item) => ({
        ...item,
        analysis_data: item.analysis_data as unknown as StyleAnalysis,
      })) as InspoAnalysis[];
    },
  });

  // Fetch saved only
  const { data: saved, isLoading: savedLoading } = useQuery({
    queryKey: ["inspo-saved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspo_analyses")
        .select("*")
        .eq("is_saved", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((item) => ({
        ...item,
        analysis_data: item.analysis_data as unknown as StyleAnalysis,
      })) as InspoAnalysis[];
    },
  });

  // Analyze video
  const analyzeVideo = async (videoUrl: string, platform: string): Promise<StyleAnalysis | null> => {
    setAnalyzing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get organization ID
      let organizationId = null;
      if (user) {
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        organizationId = orgMember?.organization_id;
      }

      const { data, error } = await lovableFunctions.functions.invoke("analyze-inspo-video", {
        body: { videoUrl, platform, organizationId },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return null;
      }

      // The function reports whether it actually decoded the video. If not,
      // the "analysis" is an ungrounded guess — say so instead of celebrating.
      if (data?.videoWasSeen === false) {
        toast.warning("Couldn't fetch the actual video from that link — results are a rough guess");
      } else {
        toast.success("Video analyzed successfully!");
      }
      queryClient.invalidateQueries({ queryKey: ["inspo-history"] });

      return data.analysis as StyleAnalysis;
    } catch (err) {
      console.error("Analysis error:", err);
      toast.error("Failed to analyze video");
      return null;
    } finally {
      setAnalyzing(false);
    }
  };

  // Toggle saved status
  const toggleSaved = useMutation({
    mutationFn: async ({ id, isSaved }: { id: string; isSaved: boolean }) => {
      const { error } = await supabase
        .from("inspo_analyses")
        .update({ is_saved: isSaved })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspo-history"] });
      queryClient.invalidateQueries({ queryKey: ["inspo-saved"] });
    },
  });

  // Delete analysis
  const deleteAnalysis = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("inspo_analyses")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspo-history"] });
      queryClient.invalidateQueries({ queryKey: ["inspo-saved"] });
      toast.success("Analysis deleted");
    },
  });

  return {
    analyzeVideo,
    analyzing,
    history,
    historyLoading,
    saved,
    savedLoading,
    toggleSaved: toggleSaved.mutate,
    deleteAnalysis: deleteAnalysis.mutate,
  };
}