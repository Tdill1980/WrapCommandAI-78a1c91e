import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Upload, Image, Video, Music, Folder,
  Grid3X3, List, X, Play, Download, Trash2, Sparkles, FileStack, CheckCircle, Lightbulb,
  Wand2, Loader2, AlertTriangle, Scan, SlidersHorizontal
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase, lovableFunctions, lovable3DRenders } from "@/integrations/supabase/client";

// =============================================================================
// CONTENT DATA — CONSOLIDATED (Feb 17 2026)
// =============================================================================
// content_files now lives in YOUR Supabase (qxllysilzonrlyoaomce).
// lovable3DRenders now points to YOUR Supabase. Migration complete.
// =============================================================================
import { MediaUploader } from "./MediaUploader";
import { MediaCard, MediaSelectMode } from "./MediaCard";
import { TagEditorModal } from "./TagEditorModal";
import { toast } from "sonner";
import { useVisualAnalyzer } from "@/hooks/useVisualAnalyzer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface MediaFile {
  id: string;
  file_url: string;
  file_type: string;
  original_filename: string | null;
  thumbnail_url: string | null;
  tags: string[] | null;
  brand: string;
  created_at: string;
  duration_seconds: number | null;
  content_category?: string | null;
  visual_tags?: {
    style_tags?: string[];
    visual_tags?: string[];
    quality_tags?: string[];
    ai_confidence?: number;
    ai_description?: string;
    tagged_at?: string;
  } | null;
  ai_labels?: Record<string, unknown> | null;
  vehicle_info?: Record<string, unknown> | null;
  dominant_colors?: string[] | null;
  ai_parsed_at?: string | null;
}

const FILE_TYPES = [
  { id: "all", label: "All", icon: Grid3X3 },
  { id: "image", label: "Images", icon: Image },
  { id: "video", label: "Videos", icon: Video },
  { id: "audio", label: "Audio", icon: Music },
];

const CATEGORY_TABS = [
  { id: "all", label: "All", icon: Grid3X3 },
  { id: "raw", label: "Source", icon: Sparkles },
  { id: "ai_output", label: "AI Outputs", icon: Wand2 },
  { id: "inspo_reference", label: "Inspo", icon: Lightbulb },
  { id: "template", label: "Templates", icon: FileStack },
  { id: "finished", label: "Finished", icon: CheckCircle },
];

export function MediaLibrary({ 
  onSelect,
  selectionMode = false 
}: { 
  onSelect?: (file: MediaFile, mode?: MediaSelectMode) => void;
  selectionMode?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [category, setCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showUploader, setShowUploader] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [tagEditorFile, setTagEditorFile] = useState<MediaFile | null>(null);
  const [bulkRetagging, setBulkRetagging] = useState(false);
  const [showAnalysisConfirm, setShowAnalysisConfirm] = useState(false);
  // AI DNA filters
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [wrapTypeFilter, setWrapTypeFilter] = useState("all");
  const [showAiFilters, setShowAiFilters] = useState(false);
  
  const { analyzeAllUntagged, getStatus, analyzing } = useVisualAnalyzer();
  const [analysisStatus, setAnalysisStatus] = useState<{ analyzed: number; unanalyzed: number } | null>(null);

  // Fetch analysis status on mount
  useEffect(() => {
    getStatus().then(setAnalysisStatus).catch(console.error);
  }, []);

  const handleRunAnalysis = async () => {
    setShowAnalysisConfirm(false);
    try {
      const result = await analyzeAllUntagged(50);
      toast.success(`Analysis complete: ${result.processed} analyzed, ${result.skipped} skipped`);
      // Refresh status after analysis
      const newStatus = await getStatus();
      setAnalysisStatus(newStatus);
      refetch();
    } catch (error) {
      console.error("Analysis failed:", error);
      toast.error("Analysis failed. Check console for details.");
    }
  };

  const { data: files = [], isLoading, refetch } = useQuery({
    queryKey: ["media-library", filterType, category],
    queryFn: async () => {
      // Query YOUR Supabase where content_files lives (consolidated Feb 2026)
      let query = lovable3DRenders
        .from("content_files")
        .select("*")
        .order("created_at", { ascending: false });

      if (filterType !== "all") {
        query = query.eq("file_type", filterType);
      }

      if (category !== "all") {
        query = query.eq("content_category", category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MediaFile[];
    },
  });

  // Extract unique vehicle makes and wrap types from AI labels for filter dropdowns
  const { vehicleMakes, wrapTypes } = useMemo(() => {
    const makes = new Set<string>();
    const wraps = new Set<string>();
    for (const file of files) {
      const labels = file.ai_labels as Record<string, unknown> | null;
      if (!labels) continue;
      const make = labels.vehicle_make as string;
      const wrapType = labels.wrap_type as string;
      if (make) makes.add(make);
      if (wrapType) wraps.add(wrapType);
    }
    return {
      vehicleMakes: Array.from(makes).sort(),
      wrapTypes: Array.from(wraps).sort(),
    };
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;

    // Text search across filename, tags, and AI labels
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((file) => {
        if (file.original_filename?.toLowerCase().includes(q)) return true;
        if (file.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;
        // Search AI labels
        const labels = file.ai_labels as Record<string, unknown> | null;
        if (labels) {
          const make = (labels.vehicle_make as string || "").toLowerCase();
          const model = (labels.vehicle_model as string || "").toLowerCase();
          const wrapType = (labels.wrap_type as string || "").toLowerCase();
          const mood = (labels.mood as string || "").toLowerCase();
          if (make.includes(q) || model.includes(q) || wrapType.includes(q) || mood.includes(q)) return true;
        }
        return false;
      });
    }

    // Vehicle make filter
    if (vehicleFilter !== "all") {
      result = result.filter((file) => {
        const labels = file.ai_labels as Record<string, unknown> | null;
        return labels && (labels.vehicle_make as string) === vehicleFilter;
      });
    }

    // Wrap type filter
    if (wrapTypeFilter !== "all") {
      result = result.filter((file) => {
        const labels = file.ai_labels as Record<string, unknown> | null;
        return labels && (labels.wrap_type as string) === wrapTypeFilter;
      });
    }

    return result;
  }, [files, searchQuery, vehicleFilter, wrapTypeFilter]);

  const handleFileSelect = (file: MediaFile, mode?: MediaSelectMode) => {
    if (onSelect) {
      onSelect(file, mode);
    }
    
    if (!selectionMode) {
      setSelectedFiles((prev) =>
        prev.includes(file.id)
          ? prev.filter((id) => id !== file.id)
          : [...prev, file.id]
      );
    }
  };

  const handleUploadComplete = () => {
    setShowUploader(false);
    refetch();
  };

  // Bulk re-tag with AI
  const handleBulkRetag = async () => {
    const videosToTag = filteredFiles.filter(f => f.file_type === "video");
    if (videosToTag.length === 0) {
      toast.error("No videos to tag");
      return;
    }

    setBulkRetagging(true);
    let success = 0;
    let failed = 0;

    for (const file of videosToTag) {
      try {
        const { error } = await lovableFunctions.functions.invoke("ai-tag-video", {
          body: {
            content_file_id: file.id,
            video_url: file.file_url,
            thumbnail_url: file.thumbnail_url,
            existing_tags: file.tags || [],
          },
        });
        if (error) throw error;
        success++;
      } catch {
        failed++;
      }
    }

    setBulkRetagging(false);
    toast.success(`Tagged ${success} videos${failed > 0 ? `, ${failed} failed` : ""}`);
    refetch();
  };

  // Count untagged videos
  const untaggedCount = useMemo(() => {
    return filteredFiles.filter(f => 
      f.file_type === "video" && (!f.tags || f.tags.length === 0)
    ).length;
  }, [filteredFiles]);

  // Count low confidence
  const lowConfidenceCount = useMemo(() => {
    return filteredFiles.filter(f => {
      const confidence = f.visual_tags?.ai_confidence;
      return f.file_type === "video" && confidence !== undefined && confidence < 0.5;
    }).length;
  }, [filteredFiles]);

  return (
    <div className="space-y-4">
      {/* Analysis Confirmation Dialog */}
      <AlertDialog open={showAnalysisConfirm} onOpenChange={setShowAnalysisConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Analyze Source Footage</AlertDialogTitle>
            <AlertDialogDescription>
              This will analyze all unprocessed source videos and assign system tags.
              AI outputs and inspiration videos are excluded.
              {analysisStatus && (
                <span className="block mt-2 font-medium">
                  {analysisStatus.unanalyzed} videos pending analysis
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunAnalysis}>
              Run Analysis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg sm:text-xl font-semibold">Media Library</h2>
        <div className="flex items-center gap-2">
          {/* Run Analysis Button */}
          <Button 
            onClick={() => setShowAnalysisConfirm(true)} 
            size="sm" 
            variant="outline"
            disabled={analyzing || (analysisStatus?.unanalyzed === 0)}
            className="hidden sm:flex"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Scan className="w-4 h-4 mr-2" />
            )}
            {analyzing ? "Analyzing..." : `Analyze${analysisStatus?.unanalyzed ? ` (${analysisStatus.unanalyzed})` : ""}`}
          </Button>
          <Button 
            onClick={handleBulkRetag} 
            size="sm" 
            variant="outline"
            disabled={bulkRetagging || filterType !== "video"}
            className="hidden sm:flex"
          >
            {bulkRetagging ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4 mr-2" />
            )}
            AI Tag All
          </Button>
          <Button onClick={() => setShowUploader(true)} size="sm" className="sm:size-default">
            <Upload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      </div>

      {/* Tag Status Banner */}
      {filterType === "video" && (untaggedCount > 0 || lowConfidenceCount > 0) && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
          {untaggedCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span>{untaggedCount} untagged</span>
            </div>
          )}
          {lowConfidenceCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span>{lowConfidenceCount} low confidence</span>
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleBulkRetag}
            disabled={bulkRetagging}
            className="ml-auto h-7 text-xs"
          >
            {bulkRetagging ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3 mr-1" />
            )}
            Fix with AI
          </Button>
        </div>
      )}

      {/* Upload Modal */}
      {showUploader && (
        <MediaUploader 
          onClose={() => setShowUploader(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {/* Category Tabs */}
      <Tabs value={category} onValueChange={setCategory} className="w-full">
        <TabsList className="w-full justify-start gap-1 bg-muted/50 p-1 rounded-lg overflow-x-auto no-scrollbar">
          {CATEGORY_TABS.map((cat) => (
            <TabsTrigger 
              key={cat.id} 
              value={cat.id}
              className="gap-1.5 px-3 py-2 data-[state=active]:bg-background"
            >
              <cat.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{cat.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search + Type Filters + View Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Tabs value={filterType} onValueChange={setFilterType}>
            <TabsList className="h-10">
              {FILE_TYPES.map((type) => (
                <TabsTrigger 
                  key={type.id} 
                  value={type.id} 
                  className="gap-1.5 px-2.5 sm:px-3 min-w-[44px]"
                >
                  <type.icon className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">{type.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* View Mode Toggle */}
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="h-10 w-10 p-0"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="h-10 w-10 p-0"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* AI DNA Filters */}
      {(vehicleMakes.length > 0 || wrapTypes.length > 0) && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowAiFilters(!showAiFilters)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            AI Filters
            {(vehicleFilter !== "all" || wrapTypeFilter !== "all") && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1.5">
                Active
              </Badge>
            )}
          </Button>
          {showAiFilters && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30">
              {vehicleMakes.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Vehicle:</label>
                  <select
                    className="bg-background text-foreground text-xs p-1.5 rounded border border-border min-w-[120px]"
                    value={vehicleFilter}
                    onChange={(e) => setVehicleFilter(e.target.value)}
                  >
                    <option value="all">All Vehicles</option>
                    {vehicleMakes.map((make) => (
                      <option key={make} value={make}>{make}</option>
                    ))}
                  </select>
                </div>
              )}
              {wrapTypes.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Wrap:</label>
                  <select
                    className="bg-background text-foreground text-xs p-1.5 rounded border border-border min-w-[120px]"
                    value={wrapTypeFilter}
                    onChange={(e) => setWrapTypeFilter(e.target.value)}
                  >
                    <option value="all">All Wraps</option>
                    {wrapTypes.map((wt) => (
                      <option key={wt} value={wt}>{wt}</option>
                    ))}
                  </select>
                </div>
              )}
              {(vehicleFilter !== "all" || wrapTypeFilter !== "all") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => { setVehicleFilter("all"); setWrapTypeFilter("all"); }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {filteredFiles.length} result{filteredFiles.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Selected Count */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-primary/10 rounded-lg">
          <span className="text-sm">
            {selectedFiles.length} file(s) selected
          </span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-9">
              <Download className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button size="sm" variant="destructive" className="h-9">
              <Trash2 className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setSelectedFiles([])}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Files Grid/List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading media files...
        </div>
      ) : filteredFiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No files found</p>
            <Button className="w-full sm:w-auto" onClick={() => setShowUploader(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Your First File
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {filteredFiles.map((file) => (
            <MediaCard
              key={file.id}
              file={file}
              selected={selectedFiles.includes(file.id)}
              onClick={handleFileSelect}
              selectionMode={selectionMode}
              onEditTags={() => setTagEditorFile(file)}
              onDelete={refetch}
              onCategoryChange={refetch}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFiles.map((file) => (
            <MediaCard
              key={file.id}
              file={file}
              listMode
              selected={selectedFiles.includes(file.id)}
              onClick={handleFileSelect}
              selectionMode={selectionMode}
              onEditTags={() => setTagEditorFile(file)}
              onDelete={refetch}
              onCategoryChange={refetch}
            />
          ))}
        </div>
      )}

      {/* Tag Editor Modal */}
      {tagEditorFile && (
        <TagEditorModal
          file={tagEditorFile}
          open={!!tagEditorFile}
          onClose={() => setTagEditorFile(null)}
          onSave={refetch}
        />
      )}
    </div>
  );
}
