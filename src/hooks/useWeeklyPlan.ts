import { useState } from "react";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContentSuggestion {
  day: string;
  type: "reel" | "static" | "carousel" | "story" | "ad";
  title: string;
  hook: string;
  script?: string;
  hashtags?: string[];
  cta?: string;
  platform: string;
  estimated_runtime?: string;
}

interface WeeklyPlan {
  suggestions: ContentSuggestion[];
  theme?: string;
  generated_at: string;
}

export function useWeeklyPlan() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatePlan = async (organizationId?: string) => {
    setIsGenerating(true);
    setError(null);

    try {
      const { data, error: fnError } = await lovableFunctions.functions.invoke(
        "ai-weekly-plan",
        {
          body: { organization_id: organizationId },
        }
      );

      if (fnError) throw fnError;

      if (data?.success && data?.plan) {
        setPlan(data.plan);
        toast.success("Weekly content plan generated!");
      } else {
        throw new Error(data?.error || "Failed to generate plan");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      toast.error("Failed to generate plan: " + message);
    } finally {
      setIsGenerating(false);
    }
  };

  const addToQueue = async (suggestion: ContentSuggestion) => {
    try {
      const { error } = await contentDB.from("content_queue").insert({
        content_type: suggestion.type,
        title: suggestion.title,
        script: suggestion.script,
        caption: suggestion.hook,
        hashtags: suggestion.hashtags,
        cta_text: suggestion.cta,
        platform: suggestion.platform,
        status: "draft",
        mode: "auto",
      });

      if (error) throw error;
      toast.success(`"${suggestion.title}" added to content queue`);
    } catch (err) {
      toast.error("Failed to add to queue");
    }
  };

  const addAllToQueue = async () => {
    if (!plan?.suggestions) return;

    for (const suggestion of plan.suggestions) {
      await addToQueue(suggestion);
    }
    toast.success("All suggestions added to content queue!");
  };

  const reset = () => {
    setPlan(null);
    setError(null);
  };

  return {
    isGenerating,
    plan,
    error,
    generatePlan,
    addToQueue,
    addAllToQueue,
    reset,
  };
}
