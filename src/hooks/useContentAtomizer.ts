import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ContentAtom {
  id?: string;
  organization_id?: string;
  source_type: string;
  atom_type: string;
  original_text: string;
  processed_text?: string;
  tags: string[];
  product_id?: string;
  product_match?: string;
  ad_angles: string[];
  suggested_formats?: string[];
  is_used?: boolean;
  use_count?: number;
  created_at?: string;
}

export interface MicroContent {
  format: string;
  style: string;
  output: any;
}

export interface Product {
  id: string;
  product_name: string;
  category?: string;
  price_per_sqft?: number;
  flat_price?: number;
}

export function useContentAtomizer(organizationId?: string) {
  const queryClient = useQueryClient();
  const [selectedAtom, setSelectedAtom] = useState<ContentAtom | null>(null);
  const [generatedContent, setGeneratedContent] = useState<MicroContent | null>(null);

  // Fetch existing atoms
  const { data: atoms = [], isLoading: loadingAtoms, refetch: refetchAtoms } = useQuery({
    queryKey: ["content-atoms", organizationId],
    queryFn: async () => {
      const query = contentDB
        .from("content_atoms")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (organizationId) {
        query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ContentAtom[];
    },
  });

  // Fetch products for matching
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-atomizer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, product_name, category, price_per_sqft, flat_price")
        .eq("is_active", true);
      if (error) throw error;
      return data as Product[];
    },
  });

  // Atomize content mutation
  const atomizeMutation = useMutation({
    mutationFn: async ({ text, sourceType }: { text: string; sourceType: string }) => {
      const { data, error } = await lovableFunctions.functions.invoke("ai-atomize-content", {
        body: { 
          text, 
          source_type: sourceType,
          organization_id: organizationId,
          products 
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data, variables) => {
      // Empty result = the AI didn't produce atoms. Surface it — previously
      // this silently did nothing while the page cleared the user's text.
      if (!data.atoms || data.atoms.length === 0) {
        toast({
          title: "No atoms found",
          description: "The AI couldn't break this content down — try different or longer text",
          variant: "destructive",
        });
        throw new Error("No atoms generated");
      }

      // Save atoms to database.
      // - source_type comes from the user's selection (the AI output has no
      //   per-atom source_type, so the old `atom.source_type` was always undefined).
      // - product_match (a product NAME from the AI) is resolved to product_id.
      const atomsToInsert = data.atoms.map((atom: any) => ({
        organization_id: organizationId,
        source_type: variables.sourceType || "other",
        atom_type: atom.atom_type || "idea",
        original_text: atom.original_text,
        processed_text: atom.processed_text,
        tags: atom.tags || [],
        product_id: atom.product_match
          ? products.find((p) =>
              p.product_name.toLowerCase() === String(atom.product_match).toLowerCase()
            )?.id ?? null
          : null,
        ad_angles: atom.ad_angles || [],
        suggested_formats: atom.suggested_formats || [],
      }));

      const { error } = await contentDB.from("content_atoms").insert(atomsToInsert);
      if (error) {
        // Failed save must NOT show the success toast (it used to).
        console.error("Failed to save atoms:", error);
        toast({
          title: "Atomized, but saving failed",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["content-atoms"] });
      toast({
        title: "Content Atomized",
        description: `Created ${data.atoms.length} content atoms`,
      });
      return data;
    },
    onError: (error) => {
      toast({
        title: "Atomization Failed",
        description: error instanceof Error ? error.message : "Failed to atomize content",
        variant: "destructive",
      });
    },
  });

  // Generate micro content mutation
  const generateMutation = useMutation({
    mutationFn: async ({ atom, format, style }: { atom: ContentAtom; format: string; style: string }) => {
      const { data, error } = await lovableFunctions.functions.invoke("ai-generate-micro-content", {
        body: { 
          atom, 
          format, 
          style,
          organization_id: organizationId 
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGeneratedContent(data);
      toast({
        title: "Content Generated",
        description: `Generated ${data.format} content`,
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate content",
        variant: "destructive",
      });
    },
  });

  // Mark atom as used (real increment — the old code always wrote 1)
  const markAsUsed = useCallback(async (atomId: string) => {
    const { data: current } = await contentDB
      .from("content_atoms")
      .select("use_count")
      .eq("id", atomId)
      .maybeSingle();

    const { error } = await contentDB
      .from("content_atoms")
      .update({
        is_used: true,
        use_count: (current?.use_count ?? 0) + 1,
      })
      .eq("id", atomId);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["content-atoms"] });
    }
  }, [queryClient]);

  // Delete atom
  const deleteAtom = useMutation({
    mutationFn: async (atomId: string) => {
      const { error } = await contentDB.from("content_atoms").delete().eq("id", atomId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-atoms"] });
      toast({ title: "Atom deleted" });
    },
  });

  // Add to content queue
  const addToQueue = useCallback(async (content: MicroContent, title: string) => {
    const { error } = await contentDB.from("content_queue").insert({
      organization_id: organizationId,
      title,
      content_type: content.format,
      ai_metadata: content.output,
      status: "draft",
    });
    
    if (error) {
      toast({ title: "Failed to add to queue", variant: "destructive" });
    } else {
      toast({ title: "Added to content queue" });
    }
  }, [organizationId]);

  return {
    atoms,
    loadingAtoms,
    refetchAtoms,
    products,
    selectedAtom,
    setSelectedAtom,
    generatedContent,
    setGeneratedContent,
    atomizeContent: atomizeMutation.mutateAsync,
    isAtomizing: atomizeMutation.isPending,
    generateMicroContent: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    markAsUsed,
    deleteAtom: deleteAtom.mutate,
    addToQueue,
  };
}
