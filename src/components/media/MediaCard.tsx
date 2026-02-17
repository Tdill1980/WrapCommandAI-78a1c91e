import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Play, Image, Video, Music, Check, Tag, Trash2, Target, AlertTriangle, 
  Wand2, Loader2, MoreVertical, Sparkles, Lightbulb, Bot 
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { lovable3DRenders } from "@/integrations/supabase/client";

// content_files lives in YOUR Supabase (qxllysilzonrlyoaomce) - consolidated Feb 2026
import { toast } from "sonner";
import { VideoThumbnail } from "./VideoThumbnail";
import { TAG_LABELS } from "@/lib/style-tag-rules";

interface MediaFile {
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
    ai_confidence?: number;
  } | null;
  ai_labels?: Record<string, unknown> | null;
  vehicle_info?: Record<string, unknown> | null;
  dominant_colors?: string[] | null;
  ai_parsed_at?: string | null;
}

export type MediaSelectMode = "select" | "reel" | "static" | "hybrid" | "video-ad";

interface MediaCardProps {
  file: MediaFile;
  selected?: boolean;
  onClick: (file: MediaFile, mode?: MediaSelectMode) => void;
  selectionMode?: boolean;
  listMode?: boolean;
  onEditTags?: () => void;
  onDelete?: () => void;
  onCategoryChange?: () => void;
}

export function MediaCard({ 
  file, 
  selected, 
  onClick, 
  selectionMode,
  listMode = false,
  onEditTags,
  onDelete,
  onCategoryChange
}: MediaCardProps) {
  const isMobile = useIsMobile();
  const isImage = file.file_type === "image";
  const isVideo = file.file_type === "video";
  const isAudio = file.file_type === "audio";

  const formatDuration = (seconds: number) => {
    if (!seconds) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await lovable3DRenders
        .from("content_files")
        .delete()
        .eq("id", file.id);
      
      if (error) throw error;
      toast.success("File deleted");
      onDelete?.();
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete file");
    }
  };

  const handleCategoryChange = async (newCategory: string) => {
    try {
      const { error } = await lovable3DRenders
        .from("content_files")
        .update({ content_category: newCategory })
        .eq("id", file.id);
      
      if (error) throw error;
      
      const categoryLabels: Record<string, string> = {
        raw: "Source Footage",
        ai_output: "AI Output",
        inspo_reference: "Inspiration"
      };
      toast.success(`Moved to ${categoryLabels[newCategory] || newCategory}`);
      onCategoryChange?.();
    } catch (err) {
      console.error("Category change error:", err);
      toast.error("Failed to change category");
    }
  };

  // List Mode Layout
  if (listMode) {
    return (
      <div
        className={cn(
          "flex gap-4 p-3 rounded-lg border bg-card cursor-pointer transition-all",
          "hover:ring-2 hover:ring-primary/50",
          selected && "ring-2 ring-primary"
        )}
        onClick={() => onClick(file, "select")}
      >
        {/* Thumbnail */}
        <div className="relative w-32 h-20 rounded overflow-hidden bg-muted flex-shrink-0">
          {isImage && file.file_url ? (
            <img 
              src={file.thumbnail_url || file.file_url} 
              alt={file.original_filename || "Media"} 
              className="w-full h-full object-cover" 
            />
          ) : isVideo ? (
            <VideoThumbnail 
              videoUrl={file.file_url} 
              thumbnailUrl={file.thumbnail_url}
              alt={file.original_filename || "Video"}
              showPlayIcon={false}
            />
          ) : isAudio ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <Music className="w-8 h-8 text-muted-foreground" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
          
          {file.duration_seconds && (
            <span className="absolute bottom-1 right-1 bg-black/70 text-white px-1.5 py-0.5 text-[10px] rounded">
              {formatDuration(file.duration_seconds)}
            </span>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col justify-between flex-1 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium truncate flex-1">{file.original_filename || "Untitled"}</p>
              {/* AI parsed indicator */}
              {file.ai_parsed_at && (
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="AI analyzed" />
              )}
              {/* Confidence indicator */}
              {file.visual_tags?.ai_confidence !== undefined && (
                <Badge 
                  variant={file.visual_tags.ai_confidence >= 0.7 ? "secondary" : "outline"}
                  className={cn(
                    "text-[10px] shrink-0",
                    file.visual_tags.ai_confidence < 0.5 && "border-yellow-500 text-yellow-600"
                  )}
                >
                  {(file.visual_tags.ai_confidence * 100).toFixed(0)}%
                </Badge>
              )}
              {!file.tags?.length && isVideo && (
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground capitalize">{file.content_category || "raw"}</p>
            
            {file.tags && file.tags.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {file.tags.slice(0, 3).map(t => (
                  <Badge key={t} variant="secondary" className="text-[10px]">
                    {TAG_LABELS[t] || t}
                  </Badge>
                ))}
                {file.tags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{file.tags.length - 3}</span>
                )}
              </div>
            )}
            {/* AI DNA Tags in list mode */}
            {file.ai_labels && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {(file.ai_labels.vehicle_make as string) && (
                  <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-400 border-0">
                    {file.ai_labels.vehicle_make as string}{file.ai_labels.vehicle_model ? ` ${file.ai_labels.vehicle_model}` : ""}
                  </Badge>
                )}
                {(file.ai_labels.wrap_type as string) && (
                  <Badge variant="secondary" className="text-[10px] bg-purple-500/10 text-purple-400 border-0">
                    {file.ai_labels.wrap_type as string}
                  </Badge>
                )}
                {(file.ai_labels.wrap_finish as string) && (
                  <Badge variant="secondary" className="text-[10px] bg-pink-500/10 text-pink-400 border-0">
                    {file.ai_labels.wrap_finish as string}
                  </Badge>
                )}
                {(file.ai_labels.mood as string) && (
                  <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-0">
                    {file.ai_labels.mood as string}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-2">
            {onEditTags && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onEditTags(); }}
              >
                <Tag className="w-3 h-3 mr-1" />
                Tags
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Grid Mode Layout
  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden cursor-pointer transition-all group",
        selected ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary/50"
      )}
      onClick={() => onClick(file, "select")}
    >
      {/* THUMBNAIL */}
      <div className="w-full h-32 sm:h-40 bg-muted overflow-hidden">
        {isImage && file.file_url ? (
          <img 
            src={file.thumbnail_url || file.file_url} 
            alt={file.original_filename || "Media"} 
            className="w-full h-full object-cover" 
          />
        ) : isVideo ? (
          <VideoThumbnail 
            videoUrl={file.file_url} 
            thumbnailUrl={file.thumbnail_url}
            alt={file.original_filename || "Video"}
          />
        ) : isAudio ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
            <Music className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* DURATION BADGE */}
      {file.duration_seconds && (
        <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-0.5 text-xs rounded">
          {formatDuration(file.duration_seconds)}
        </div>
      )}

      {/* CATEGORY BADGE */}
      {file.content_category && file.content_category !== "raw" && (
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="text-[10px] capitalize">
            {file.content_category}
          </Badge>
        </div>
      )}

      {/* SELECTED INDICATOR */}
      {selected && (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-4 h-4 text-primary-foreground" />
        </div>
      )}

      {/* HOVER/TAP ACTIONS */}
      {!selectionMode && (
        <div 
          className={cn(
            "absolute inset-0 bg-black/60 flex flex-col justify-center items-center gap-2 p-2 transition-opacity",
            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Button
            size="sm"
            variant="secondary"
            className="w-full max-w-[120px] h-9 text-xs sm:text-sm"
            onClick={(e) => { e.stopPropagation(); onClick(file, "reel"); }}
          >
            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
            Reel
          </Button>

          {isImage && (
            <Button
              size="sm"
              variant="default"
              className="w-full max-w-[120px] h-9 text-xs sm:text-sm bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
              onClick={(e) => { e.stopPropagation(); onClick(file, "static"); }}
            >
              <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              Static Ad
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            className="w-full max-w-[120px] h-9 text-xs sm:text-sm"
            onClick={(e) => { e.stopPropagation(); onClick(file, "hybrid"); }}
          >
            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
            Hybrid
          </Button>

          {isVideo && (
            <Button
              size="sm"
              variant="default"
              className="w-full max-w-[120px] h-9 text-xs sm:text-sm bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
              onClick={(e) => { e.stopPropagation(); onClick(file, "video-ad"); }}
            >
              <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              Video Ad
            </Button>
          )}

          {onEditTags && (
            <Button
              size="sm"
              variant="outline"
              className="w-full max-w-[120px] h-9 text-xs sm:text-sm"
              onClick={(e) => { e.stopPropagation(); onEditTags(); }}
            >
              <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              Tags
            </Button>
          )}
        </div>
      )}

      {/* FILENAME & TAGS & MENU */}
      <div className="p-2 bg-card space-y-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium truncate flex-1">
            {file.original_filename || "Untitled"}
          </p>
          {file.ai_parsed_at && (
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="AI analyzed" />
          )}
          {!file.tags?.length && isVideo && (
            <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
          )}
          {file.visual_tags?.ai_confidence !== undefined && file.visual_tags.ai_confidence < 0.5 && (
            <Badge variant="outline" className="text-[9px] px-1 border-yellow-500 text-yellow-600">
              {(file.visual_tags.ai_confidence * 100).toFixed(0)}%
            </Badge>
          )}

          {/* Category Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={() => handleCategoryChange("raw")}
                disabled={file.content_category === "raw"}
              >
                <Sparkles className="w-3.5 h-3.5 mr-2" />
                Move to Source
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCategoryChange("inspo_reference")}
                disabled={file.content_category === "inspo_reference"}
              >
                <Lightbulb className="w-3.5 h-3.5 mr-2" />
                Move to Inspo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCategoryChange("ai_output")}
                disabled={file.content_category === "ai_output"}
              >
                <Bot className="w-3.5 h-3.5 mr-2" />
                Mark as AI Output
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onEditTags && (
                <DropdownMenuItem onClick={onEditTags}>
                  <Tag className="w-3.5 h-3.5 mr-2" />
                  Edit Tags
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {file.tags && file.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {file.tags.slice(0, 2).map(t => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {TAG_LABELS[t] || t}
              </Badge>
            ))}
            {file.tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{file.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* AI DNA Tags */}
        {file.ai_labels && (
          <div className="flex gap-1 flex-wrap">
            {(file.ai_labels.vehicle_make as string) && (
              <Badge variant="secondary" className="text-[9px] px-1 bg-blue-500/10 text-blue-400 border-0">
                {file.ai_labels.vehicle_make as string}
              </Badge>
            )}
            {(file.ai_labels.wrap_type as string) && (
              <Badge variant="secondary" className="text-[9px] px-1 bg-purple-500/10 text-purple-400 border-0">
                {file.ai_labels.wrap_type as string}
              </Badge>
            )}
            {(file.ai_labels.quality_score as number) >= 8 && (
              <Badge variant="secondary" className="text-[9px] px-1 bg-green-500/10 text-green-400 border-0">
                HQ
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
