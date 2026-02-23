import { useState, useCallback } from 'react';
import { supabase, lovableFunctions } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BatchProject {
  projectId: string;
  orderNumber: string;
  customerName: string;
  productType: string;
  designInstructions: string | null;
  vehicleInfo: {
    year?: string;
    make?: string;
    model?: string;
    type?: string;
  } | null;
  colorInfo: {
    color?: string;
    color_hex?: string;
    finish?: string;
  } | null;
  customerInspoImages: string[];
  customerUploadedFiles: Array<{
    url: string;
    filename: string;
    fileType: string;
  }>;
  latestVersionUrl: string | null;
  latestVersionId: string | null;
  injectedPrompt: string;
  status: string;
}

export interface BatchRenderResult {
  projectId: string;
  orderNumber: string;
  success: boolean;
  generatedViews?: number;
  error?: string;
}

export interface BatchStats {
  total: number;
  enriched: number;
  withInstructions: number;
  withInspo: number;
  withProof: number;
  failed: number;
  rendered?: number;
}

export interface PromptOverrides {
  styleDirective?: string;
  colorOverride?: string;
  additionalContext?: string;
}

export function useApproveFlowBatchRender() {
  const [projects, setProjects] = useState<BatchProject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderResults, setRenderResults] = useState<BatchRenderResult[]>([]);
  const [stats, setStats] = useState<BatchStats | null>(null);
  const { toast } = useToast();

  // Fetch all ApproveFlow projects (for selection)
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('approveflow_projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Map to lightweight list for selection
      const mapped = (data || []).map((p: any) => ({
        projectId: p.id,
        orderNumber: p.order_number,
        customerName: p.customer_name,
        productType: p.product_type,
        designInstructions: p.design_instructions,
        vehicleInfo: p.vehicle_info,
        colorInfo: p.color_info,
        customerInspoImages: [],
        customerUploadedFiles: [],
        latestVersionUrl: null,
        latestVersionId: null,
        injectedPrompt: '',
        status: p.status,
      }));

      setProjects(mapped);
    } catch (error: any) {
      toast({
        title: 'Failed to load projects',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Toggle selection
  const toggleSelect = useCallback((projectId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  // Select all / deselect all
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(projects.map(p => p.projectId)));
  }, [projects]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Preview: Enrich selected projects with prompt injection data
  const previewBatch = useCallback(async (overrides?: PromptOverrides) => {
    if (selectedIds.size === 0) {
      toast({ title: 'No projects selected', variant: 'destructive' });
      return;
    }

    setPreviewing(true);
    try {
      const { data, error } = await lovableFunctions.functions.invoke('batch-render-approveflow', {
        body: {
          projectIds: Array.from(selectedIds),
          mode: 'preview',
          promptOverrides: overrides,
        },
      });

      if (error) throw error;

      if (data?.projects) {
        // Update projects with enriched data
        setProjects(prev => {
          const enrichedMap = new Map(
            (data.projects as BatchProject[]).map(p => [p.projectId, p])
          );
          return prev.map(p => enrichedMap.get(p.projectId) || p);
        });
      }

      if (data?.stats) {
        setStats(data.stats);
      }

      toast({
        title: 'Preview complete',
        description: `${data?.stats?.enriched || 0} projects enriched with WooCommerce data`,
      });
    } catch (error: any) {
      toast({
        title: 'Preview failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setPreviewing(false);
    }
  }, [selectedIds, toast]);

  // Render: Execute batch renders for selected projects
  const executeBatchRender = useCallback(async (overrides?: PromptOverrides) => {
    if (selectedIds.size === 0) {
      toast({ title: 'No projects selected', variant: 'destructive' });
      return;
    }

    setRendering(true);
    setRenderResults([]);
    try {
      toast({
        title: 'Batch render started',
        description: `Processing ${selectedIds.size} orders...`,
      });

      const { data, error } = await lovableFunctions.functions.invoke('batch-render-approveflow', {
        body: {
          projectIds: Array.from(selectedIds),
          mode: 'render',
          promptOverrides: overrides,
        },
      });

      if (error) throw error;

      if (data?.results) {
        setRenderResults(data.results);
      }

      if (data?.stats) {
        setStats(data.stats);
      }

      const successCount = data?.stats?.rendered || 0;
      const failedCount = (data?.stats?.failed || 0) + (data?.stats?.skipped || 0);

      toast({
        title: 'Batch render complete',
        description: `${successCount} succeeded, ${failedCount} failed`,
      });
    } catch (error: any) {
      toast({
        title: 'Batch render failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setRendering(false);
    }
  }, [selectedIds, toast]);

  return {
    projects,
    selectedIds,
    loading,
    previewing,
    rendering,
    renderResults,
    stats,
    fetchProjects,
    toggleSelect,
    selectAll,
    deselectAll,
    previewBatch,
    executeBatchRender,
  };
}
