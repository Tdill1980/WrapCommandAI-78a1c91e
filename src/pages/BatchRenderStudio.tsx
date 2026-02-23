import { useEffect, useState } from "react";
import { MainLayout } from "@/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Eye,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Car,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Zap,
  RefreshCw,
  Info,
  Palette,
  MessageSquare,
} from "lucide-react";
import { useApproveFlowBatchRender, type BatchProject, type PromptOverrides } from "@/hooks/useApproveFlowBatchRender";

// Status color mapping
const STATUS_COLORS: Record<string, string> = {
  design_requested: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  proof_delivered: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  revision_sent: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  awaiting_feedback: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Project row component with expand/collapse for prompt details
function ProjectRow({
  project,
  isSelected,
  onToggle,
  renderResult,
}: {
  project: BatchProject;
  isSelected: boolean;
  onToggle: () => void;
  renderResult?: { success: boolean; generatedViews?: number; error?: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const hasInspo = project.customerInspoImages.length > 0;
  const hasInstructions = !!project.designInstructions;
  const hasProof = !!project.latestVersionUrl;
  const hasVehicle = !!(project.vehicleInfo?.year || project.vehicleInfo?.make);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Main row */}
      <div
        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
          isSelected ? "bg-primary/5" : "hover:bg-muted/30"
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggle()}
          onClick={(e) => e.stopPropagation()}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">#{project.orderNumber}</span>
            <span className="text-xs text-muted-foreground truncate">
              {project.customerName}
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] ${STATUS_COLORS[project.status] || ""}`}
            >
              {formatStatus(project.status)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">
              {project.productType}
            </span>
          </div>
        </div>

        {/* Data indicators */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasInstructions && (
            <Badge
              variant="secondary"
              className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20"
            >
              <MessageSquare className="w-2.5 h-2.5 mr-0.5" />
              Instructions
            </Badge>
          )}
          {hasInspo && (
            <Badge
              variant="secondary"
              className="text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/20"
            >
              <ImageIcon className="w-2.5 h-2.5 mr-0.5" />
              {project.customerInspoImages.length} Inspo
            </Badge>
          )}
          {hasVehicle && (
            <Badge
              variant="secondary"
              className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20"
            >
              <Car className="w-2.5 h-2.5 mr-0.5" />
              Vehicle
            </Badge>
          )}
          {hasProof && (
            <Badge
              variant="secondary"
              className="text-[9px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
            >
              <FileText className="w-2.5 h-2.5 mr-0.5" />
              2D Proof
            </Badge>
          )}
          {!hasProof && (
            <Badge
              variant="secondary"
              className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20"
            >
              No Proof
            </Badge>
          )}
        </div>

        {/* Render result indicator */}
        {renderResult && (
          <div className="flex-shrink-0">
            {renderResult.success ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[9px]">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {renderResult.generatedViews}/6 views
              </Badge>
            ) : (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px]">
                <XCircle className="w-3 h-3 mr-1" />
                Failed
              </Badge>
            )}
          </div>
        )}

        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 p-4 space-y-4">
          {/* Customer Instructions */}
          {hasInstructions && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Customer Design Instructions
              </h4>
              <div className="bg-muted/30 rounded p-3 border border-border">
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {project.designInstructions}
                </p>
              </div>
            </div>
          )}

          {/* Vehicle + Color Info */}
          <div className="grid grid-cols-2 gap-3">
            {hasVehicle && (
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Vehicle
                </h4>
                <p className="text-xs text-foreground">
                  {[
                    project.vehicleInfo?.year,
                    project.vehicleInfo?.make,
                    project.vehicleInfo?.model,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  {project.vehicleInfo?.type && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({project.vehicleInfo.type})
                    </span>
                  )}
                </p>
              </div>
            )}
            {project.colorInfo && (
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Color / Finish
                </h4>
                <p className="text-xs text-foreground">
                  {[
                    project.colorInfo.color,
                    project.colorInfo.finish,
                    project.colorInfo.color_hex,
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </p>
              </div>
            )}
          </div>

          {/* Inspiration Images Grid */}
          {hasInspo && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Customer Inspiration Images
              </h4>
              <div className="grid grid-cols-4 gap-2">
                {project.customerInspoImages.map((url, i) => (
                  <Dialog key={i}>
                    <DialogTrigger asChild>
                      <div className="aspect-square bg-muted rounded overflow-hidden border border-border hover:border-primary cursor-pointer transition-colors">
                        <img
                          src={url}
                          alt={`Inspo ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-[80vw] max-h-[80vh] p-2">
                      <img
                        src={url}
                        alt={`Inspo ${i + 1}`}
                        className="w-full h-full object-contain"
                      />
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            </div>
          )}

          {/* All Uploaded Files */}
          {project.customerUploadedFiles.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                All Customer Files ({project.customerUploadedFiles.length})
              </h4>
              <div className="space-y-1">
                {project.customerUploadedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/20"
                  >
                    <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate flex-1">{f.filename}</span>
                    <Badge variant="outline" className="text-[8px]">
                      {f.fileType}
                    </Badge>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-[10px] hover:underline flex-shrink-0"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2D Proof Preview */}
          {hasProof && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Latest 2D Proof
              </h4>
              <Dialog>
                <DialogTrigger asChild>
                  <div className="w-48 aspect-video bg-muted rounded overflow-hidden border border-border hover:border-primary cursor-pointer transition-colors">
                    <img
                      src={project.latestVersionUrl!}
                      alt="2D Proof"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-[80vw] max-h-[80vh] p-2">
                  <img
                    src={project.latestVersionUrl!}
                    alt="2D Proof"
                    className="w-full h-full object-contain"
                  />
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Injected Prompt Preview */}
          {project.injectedPrompt && (
            <div>
              <h4 className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-1">
                Injected Prompt (Preview)
              </h4>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded p-3">
                <pre className="text-[10px] text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {project.injectedPrompt}
                </pre>
              </div>
            </div>
          )}

          {/* Render error */}
          {renderResult && !renderResult.success && renderResult.error && (
            <div className="bg-red-500/5 border border-red-500/20 rounded p-3">
              <p className="text-xs text-red-400">{renderResult.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BatchRenderStudio() {
  const {
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
  } = useApproveFlowBatchRender();

  const [overrides, setOverrides] = useState<PromptOverrides>({});
  const [showOverrides, setShowOverrides] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const renderResultMap = new Map(
    renderResults.map((r) => [r.projectId, r])
  );

  // Filter projects that have design products (not yet approved or already have 2D proof)
  const renderableProjects = projects.filter(
    (p) => p.status !== "approved" || p.latestVersionUrl
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              <span className="text-white">Batch Render</span>{" "}
              <span className="bg-gradient-to-r from-[#2F81F7] to-[#15D1FF] bg-clip-text text-transparent">
                Studio
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pull real WPW WooCommerce orders into ApproveFlow, view instructions + inspo, inject into prompts, and bulk render
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchProjects}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Orders
          </Button>
        </div>

        {/* Stats Banner */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <Card className="p-3 text-center">
              <div className="text-lg font-bold">{stats.total}</div>
              <p className="text-[10px] text-muted-foreground">Total Selected</p>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-green-400">{stats.withInstructions}</div>
              <p className="text-[10px] text-muted-foreground">Has Instructions</p>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-purple-400">{stats.withInspo}</div>
              <p className="text-[10px] text-muted-foreground">Has Inspo Images</p>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-cyan-400">{stats.withProof}</div>
              <p className="text-[10px] text-muted-foreground">Has 2D Proof</p>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-blue-400">{stats.enriched}</div>
              <p className="text-[10px] text-muted-foreground">Enriched</p>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-lg font-bold text-red-400">{stats.failed}</div>
              <p className="text-[10px] text-muted-foreground">Failed</p>
            </Card>
          </div>
        )}

        {/* Controls */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  className="text-xs"
                >
                  Select All ({projects.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deselectAll}
                  className="text-xs"
                >
                  Deselect All
                </Button>
                <Separator orientation="vertical" className="h-6" />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size} selected
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOverrides(!showOverrides)}
                  className="text-xs"
                >
                  <Palette className="w-3 h-3 mr-1" />
                  Prompt Overrides
                  {showOverrides ? (
                    <ChevronUp className="w-3 h-3 ml-1" />
                  ) : (
                    <ChevronDown className="w-3 h-3 ml-1" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => previewBatch(overrides)}
                  disabled={previewing || selectedIds.size === 0}
                  className="text-xs"
                >
                  {previewing ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Preview Prompts
                </Button>
                <Button
                  onClick={() => executeBatchRender(overrides)}
                  disabled={rendering || selectedIds.size === 0}
                  className="bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs"
                >
                  {rendering ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Batch Render ({selectedIds.size})
                </Button>
              </div>
            </div>

            {/* Prompt Overrides Panel */}
            {showOverrides && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-muted-foreground">
                    These overrides are injected into every render prompt in this batch.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                      Style Directive
                    </label>
                    <Input
                      placeholder="e.g., Make it aggressive and sporty"
                      value={overrides.styleDirective || ""}
                      onChange={(e) =>
                        setOverrides((p) => ({ ...p, styleDirective: e.target.value }))
                      }
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                      Color Override
                    </label>
                    <Input
                      placeholder="e.g., Satin Black with chrome accents"
                      value={overrides.colorOverride || ""}
                      onChange={(e) =>
                        setOverrides((p) => ({ ...p, colorOverride: e.target.value }))
                      }
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                      Additional Context
                    </label>
                    <Textarea
                      placeholder="Free-form instructions appended to all prompts..."
                      value={overrides.additionalContext || ""}
                      onChange={(e) =>
                        setOverrides((p) => ({ ...p, additionalContext: e.target.value }))
                      }
                      className="text-xs mt-1 min-h-[60px]"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How it works info */}
        <Card className="bg-gradient-to-r from-[#2F81F7]/5 to-[#15D1FF]/5 border-[#2F81F7]/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-[#2F81F7] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  WooCommerce → Prompt Injector → Batch Render Pipeline
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  1. Select WPW WooCommerce orders below{" "}
                  2. Click <strong>Preview Prompts</strong> to fetch full order data (instructions, inspo images, vehicle info) and see the injected prompt{" "}
                  3. Click <strong>Batch Render</strong> to generate 6-view studio renders for all selected orders using the enriched prompts.
                  Customer-uploaded inspiration images and design instructions are injected directly into the render prompt.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              ApproveFlow Orders from WooCommerce
              <Badge variant="secondary" className="ml-2">
                {projects.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Real WPW WooCommerce orders synced into ApproveFlow. Select orders to preview prompt injection and batch render.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">
                  No ApproveFlow projects found. Sync orders from WooCommerce first.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[600px]">
                <div className="space-y-2">
                  {renderableProjects.map((project) => (
                    <ProjectRow
                      key={project.projectId}
                      project={project}
                      isSelected={selectedIds.has(project.projectId)}
                      onToggle={() => toggleSelect(project.projectId)}
                      renderResult={renderResultMap.get(project.projectId)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Render Results Summary */}
        {renderResults.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Batch Render Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {renderResults.map((result) => (
                  <div
                    key={result.projectId}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      result.success ? "bg-green-500/5 border border-green-500/20" : "bg-red-500/5 border border-red-500/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="text-sm font-medium">
                        Order #{result.orderNumber}
                      </span>
                    </div>
                    <div>
                      {result.success ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                          {result.generatedViews}/6 views generated
                        </Badge>
                      ) : (
                        <span className="text-xs text-red-400">
                          {result.error}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
