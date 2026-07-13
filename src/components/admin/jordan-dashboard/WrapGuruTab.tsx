import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSearch, AlertTriangle, CheckCircle, Car, ExternalLink, RefreshCw } from "lucide-react";

// WrapGuru = the AI artwork/file-analysis feature. The "Check my file" chat flow
// calls the check-artwork-file edge function, which scores each upload (1-10) and
// writes an ai_actions row (action_type='artwork_review'). This tab reports on
// that real data instead of the old hardcoded mockup.

interface Precheck {
  preliminary_score?: number;
  quick_issues?: string[];
  file_type_label?: string;
  size_assessment?: string;
}
interface AnalysisPayload {
  file_url?: string;
  file_name?: string;
  file_size_formatted?: string;
  customer_email?: string | null;
  vehicle_info?: string | null;
  geo_data?: { city?: string; region?: string; country_name?: string } | null;
  submitted_at?: string;
  ai_precheck?: Precheck;
}
interface AnalysisRow {
  id: string;
  created_at: string;
  resolved: boolean | null;
  action_payload: AnalysisPayload | null;
}

function scoreOf(r: AnalysisRow): number | null {
  const s = r.action_payload?.ai_precheck?.preliminary_score;
  return typeof s === "number" ? s : null;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">—</Badge>;
  const cls =
    score >= 7 ? "bg-green-500/15 text-green-500 border-green-500/30"
    : score >= 5 ? "bg-yellow-500/15 text-yellow-500 border-yellow-500/30"
    : "bg-red-500/15 text-red-500 border-red-500/30";
  return <Badge variant="outline" className={cls}>{score}/10</Badge>;
}

export function WrapGuruTab() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["wrapguru-artwork-analyses"],
    queryFn: async (): Promise<AnalysisRow[]> => {
      const { data, error } = await supabase
        .from("ai_actions")
        .select("id, created_at, resolved, action_payload")
        .eq("action_type", "artwork_review")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AnalysisRow[];
    },
    refetchInterval: 60000,
  });

  const rows = data ?? [];
  const scores = rows.map(scoreOf).filter((s): s is number => s !== null);
  const total = rows.length;
  const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const lowScore = rows.filter((r) => (scoreOf(r) ?? 10) <= 4).length;
  const followUps = rows.filter((r) => r.resolved === true).length;

  const stat = (label: string, value: ReactNode, Icon: typeof FileSearch, color: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{isLoading ? "…" : value}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {stat("Total Analyses", total, FileSearch, "text-blue-500")}
        {stat("Average Score", avgScore === null ? "—" : `${avgScore}/10`, CheckCircle, "text-green-500")}
        {stat("Follow-ups Resolved", followUps, Car, "text-purple-500")}
        {stat("Low Score Files (≤4)", lowScore, AlertTriangle, "text-yellow-500")}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />
            WrapGuru File Analysis
          </CardTitle>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading analyses…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSearch className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No file analyses yet.</p>
              <p className="text-sm">When a visitor uses “Check my file” in the Wrap Guru chat, the analysis appears here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 px-3 font-medium">Score</th>
                    <th className="py-2 px-3 font-medium">Customer</th>
                    <th className="py-2 px-3 font-medium">Vehicle</th>
                    <th className="py-2 px-3 font-medium">Location</th>
                    <th className="py-2 px-3 font-medium">Issues</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const p = r.action_payload ?? {};
                    const geo = p.geo_data;
                    const loc = geo ? [geo.city, geo.region].filter(Boolean).join(", ") : "—";
                    const issues = p.ai_precheck?.quick_issues ?? [];
                    return (
                      <tr key={r.id} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-3">
                          {p.file_url ? (
                            <a href={p.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              {p.file_name || "file"} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (p.file_name || "file")}
                          <div className="text-xs text-muted-foreground">{p.file_size_formatted}</div>
                        </td>
                        <td className="py-2 px-3"><ScoreBadge score={scoreOf(r)} /></td>
                        <td className="py-2 px-3">{p.customer_email || "—"}</td>
                        <td className="py-2 px-3">{p.vehicle_info || "—"}</td>
                        <td className="py-2 px-3">{loc}</td>
                        <td className="py-2 px-3 max-w-[220px]">
                          {issues.length ? (
                            <span className="text-yellow-500 text-xs">{issues.slice(0, 2).join("; ")}{issues.length > 2 ? "…" : ""}</span>
                          ) : <span className="text-green-500 text-xs">None flagged</span>}
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant={r.resolved ? "outline" : "secondary"}>{r.resolved ? "resolved" : "pending"}</Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
