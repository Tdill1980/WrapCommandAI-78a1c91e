import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  XCircle,
  Edit,
  Calendar,
  Play,
  Filter,
  Loader2,
  ArrowLeft,
  Users,
  Layout,
  Palette,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

interface ContentQueueItem {
  id: string;
  title: string | null;
  content_type: string | null;
  caption: string | null;
  script: string | null;
  hashtags: string[] | null;
  cta_text: string | null;
  status: string | null;
  ai_metadata: {
    agent?: string;
    style?: string;
    bulk_id?: string;
    variation_index?: number;
  } | null;
  media_urls: string[] | null;
  created_at: string | null;
}

const AGENT_LABELS: Record<string, string> = {
  noah_bennett: "Noah Bennett",
  emily_carter: "Emily Carter",
  ryan_mitchell: "Ryan Mitchell"
};

const STYLE_LABELS: Record<string, string> = {
  sabri: "Sabri Suby",
  dara: "Dara Denney",
  clean: "Clean Pro"
};

export default function BulkVariationReview() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bulkId = searchParams.get("bulk_id");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [filterStyle, setFilterStyle] = useState<string>("all");

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["bulk-variations", bulkId],
    queryFn: async () => {
      let query = contentDB
        .from("content_queue")
        .select("*")
        .eq("mode", "bulk")
        .order("created_at", { ascending: false });

      if (bulkId) {
        query = query.eq("ai_metadata->>bulk_id", bulkId);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data as ContentQueueItem[];
    }
  });

  // Extract unique filter options
  const agents = [...new Set(items.map(i => i.ai_metadata?.agent).filter(Boolean))];
  const formats = [...new Set(items.map(i => i.content_type).filter(Boolean))];
  const styles = [...new Set(items.map(i => i.ai_metadata?.style).filter(Boolean))];

  // Apply filters
  const filteredItems = items.filter(item => {
    if (filterAgent !== "all" && item.ai_metadata?.agent !== filterAgent) return false;
    if (filterFormat !== "all" && item.content_type !== filterFormat) return false;
    if (filterStyle !== "all" && item.ai_metadata?.style !== filterStyle) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(i => i.id));
    }
  };

  const handleBulkAction = async (action: "approve" | "reject" | "schedule") => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one variation");
      return;
    }

    try {
      if (action === "approve") {
        await contentDB
          .from("content_queue")
          .update({ status: "approved" })
          .in("id", selectedIds);
        toast.success(`Approved ${selectedIds.length} variations`);
      } else if (action === "reject") {
        await contentDB
          .from("content_queue")
          .update({ status: "rejected" })
          .in("id", selectedIds);
        toast.success(`Rejected ${selectedIds.length} variations`);
      } else if (action === "schedule") {
        toast.info("Scheduling feature coming soon!");
      }

      setSelectedIds([]);
      refetch();
    } catch (error) {
      toast.error("Action failed");
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/20 text-green-500">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-500">Rejected</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500/20 text-blue-500">Scheduled</Badge>;
      default:
        return <Badge variant="secondary">Draft</Badge>;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                Bulk Variation Review
              </h1>
              <p className="text-muted-foreground">
                {filteredItems.length} variations • {selectedIds.length} selected
              </p>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction("reject")}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction("schedule")}
              >
                <Calendar className="w-4 h-4 mr-1" />
                Schedule
              </Button>
              <Button
                size="sm"
                onClick={() => handleBulkAction("approve")}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Approve
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <Tabs value={filterAgent} onValueChange={setFilterAgent}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs">All Agents</TabsTrigger>
                  {agents.map(agent => (
                    <TabsTrigger key={agent} value={agent!} className="text-xs">
                      {AGENT_LABELS[agent!] || agent}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex items-center gap-2">
              <Layout className="w-4 h-4 text-muted-foreground" />
              <Tabs value={filterFormat} onValueChange={setFilterFormat}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs">All Formats</TabsTrigger>
                  {formats.map(format => (
                    <TabsTrigger key={format} value={format!} className="text-xs capitalize">
                      {format}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <Tabs value={filterStyle} onValueChange={setFilterStyle}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs">All Styles</TabsTrigger>
                  {styles.map(style => (
                    <TabsTrigger key={style} value={style!} className="text-xs">
                      {STYLE_LABELS[style!] || style}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="ml-auto"
            >
              {selectedIds.length === filteredItems.length ? "Deselect All" : "Select All"}
            </Button>
          </CardContent>
        </Card>

        {/* Variations Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No bulk variations found</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => navigate("/content-box")}
              >
                Go to ContentBox
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map(item => (
              <Card 
                key={item.id}
                className={`cursor-pointer transition-all ${
                  selectedIds.includes(item.id) 
                    ? "ring-2 ring-primary" 
                    : "hover:ring-1 hover:ring-primary/50"
                }`}
                onClick={() => toggleSelect(item.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        checked={selectedIds.includes(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                      <div>
                        <CardTitle className="text-sm">
                          {AGENT_LABELS[item.ai_metadata?.agent || ""] || "Unknown Agent"}
                        </CardTitle>
                        <div className="flex gap-1 mt-1">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {item.content_type}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {STYLE_LABELS[item.ai_metadata?.style || ""] || item.ai_metadata?.style}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(item.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Script/Caption Preview */}
                  <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-hidden">
                    <p className="text-xs text-muted-foreground mb-1">Hook/Script:</p>
                    <p className="text-sm line-clamp-4">
                      {item.script || item.caption || "No content"}
                    </p>
                  </div>

                  {/* Hashtags */}
                  {item.hashtags && item.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.hashtags.slice(0, 5).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* CTA */}
                  {item.cta_text && (
                    <p className="text-xs text-primary font-medium">
                      CTA: {item.cta_text}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.info("Edit feature coming soon!");
                      }}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/organic/reel-builder", {
                          state: { scriptContent: item.script, caption: item.caption }
                        });
                      }}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Build
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
