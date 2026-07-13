import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Image, 
  X, 
  Loader2, 
  Palette, 
  Type, 
  CheckCircle,
  Car
} from "lucide-react";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExtractedStyle {
  font_headline?: string;
  font_body?: string;
  primary_text_color?: string;
  accent_color?: string;
  background_style?: string;
  text_position?: string;
  text_animation?: string;
  layout?: string;
}

interface StyleReferenceUploadProps {
  type: "style" | "vehicle";
  onStyleExtracted?: (style: ExtractedStyle, imageUrl: string) => void;
  onVehicleUploaded?: (imageUrl: string) => void;
  organizationId?: string;
}

export function StyleReferenceUpload({
  type,
  onStyleExtracted,
  onVehicleUploaded,
  organizationId,
}: StyleReferenceUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [extractedStyle, setExtractedStyle] = useState<ExtractedStyle | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUploading(true);

    try {
      // Upload to Supabase storage
      const fileName = `${type}-ref-${Date.now()}-${file.name}`;
      const filePath = `static-creator/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("media-library")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("media-library")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      setUploadedUrl(publicUrl);

      if (type === "vehicle") {
        // For vehicle photos, just pass the URL back
        onVehicleUploaded?.(publicUrl);
        toast.success("Vehicle photo uploaded!");
      } else {
        // For style references, analyze the image
        setAnalyzing(true);
        
        const { data: analysisData, error: analysisError } = await lovableFunctions.functions.invoke(
          "analyze-inspo-image",
          {
            body: {
              imageUrl: publicUrl,
              organizationId,
            },
          }
        );

        if (analysisError) throw analysisError;

        // analyze-inspo-image nests the style spec under analysis.rendering.*
        // (not at the top level), and uses hook_position / text_alignment.
        const rendering = analysisData?.analysis?.rendering;
        if (rendering) {
          const style: ExtractedStyle = {
            font_headline: rendering.font_headline,
            font_body: rendering.font_body,
            primary_text_color: rendering.primary_text_color,
            accent_color: rendering.accent_color,
            background_style: rendering.background_style,
            text_position: rendering.hook_position,
            text_animation: rendering.text_animation,
            layout: rendering.text_alignment,
          };
          setExtractedStyle(style);
          onStyleExtracted?.(style, publicUrl);
          toast.success("Style extracted from reference!");
        }
      }
    } catch (err) {
      console.error("Upload/analysis failed:", err);
      toast.error("Failed to process image. Please try again.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  }, [type, organizationId, onStyleExtracted, onVehicleUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    maxFiles: 1,
    disabled: uploading || analyzing,
  });

  const handleClear = () => {
    setPreviewUrl(null);
    setUploadedUrl(null);
    setExtractedStyle(null);
  };

  const isStyle = type === "style";
  const Icon = isStyle ? Palette : Car;
  const title = isStyle ? "Style Reference" : "Wrapped Vehicle Photo";
  const description = isStyle
    ? "Upload a Canva template or ad example to match this style"
    : "Upload a photo of an actual wrapped vehicle to feature";

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        {!previewUrl ? (
          <div
            {...getRootProps()}
            className={`
              flex flex-col items-center justify-center p-6 rounded-lg cursor-pointer
              transition-all border-2 border-dashed
              ${isDragActive 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }
            `}
          >
            <input {...getInputProps()} />
            <Icon className="w-8 h-8 text-muted-foreground mb-2" />
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground text-center mt-1">
              {isDragActive ? "Drop image here..." : description}
            </div>
            <Badge variant="outline" className="mt-3 text-xs">
              <Upload className="w-3 h-3 mr-1" />
              Optional
            </Badge>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Preview */}
            <div className="relative">
              <img
                src={previewUrl}
                alt={title}
                className="w-full h-32 object-cover rounded-lg"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={handleClear}
                disabled={uploading || analyzing}
              >
                <X className="w-3 h-3" />
              </Button>
              
              {/* Status overlay */}
              {(uploading || analyzing) && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploading ? "Uploading..." : "Analyzing style..."}
                  </div>
                </div>
              )}
            </div>

            {/* Extracted style preview */}
            {isStyle && extractedStyle && (
              <div className="flex flex-wrap gap-1.5">
                {extractedStyle.font_headline && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Type className="w-3 h-3" />
                    {extractedStyle.font_headline}
                  </Badge>
                )}
                {extractedStyle.primary_text_color && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <div 
                      className="w-3 h-3 rounded-full border"
                      style={{ backgroundColor: extractedStyle.primary_text_color }}
                    />
                    Text Color
                  </Badge>
                )}
                {extractedStyle.accent_color && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <div 
                      className="w-3 h-3 rounded-full border"
                      style={{ backgroundColor: extractedStyle.accent_color }}
                    />
                    Accent
                  </Badge>
                )}
                {extractedStyle.text_position && (
                  <Badge variant="secondary" className="text-xs">
                    {extractedStyle.text_position}
                  </Badge>
                )}
              </div>
            )}

            {/* Success indicator */}
            {uploadedUrl && !analyzing && (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <CheckCircle className="w-3.5 h-3.5" />
                {isStyle ? "Style extracted and ready" : "Vehicle photo ready"}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
