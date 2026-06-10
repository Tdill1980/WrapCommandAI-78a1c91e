import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileText, ShoppingCart, Search, RefreshCw, Rocket } from "lucide-react";

interface EngineStatus {
  settings: {
    site_url: string;
    auto_blog_enabled: boolean;
    blog_frequency: string;
    auto_apply_product_sweep: boolean;
    product_sweep_batch_size: number;
    wp_username: string | null;
    wp_connected: boolean;
    last_blog_run_at: string | null;
    last_sweep_run_at: string | null;
    last_gsc_sync_at: string | null;
  };
  counts: {
    posts_total: number;
    posts_published: number;
    keywords_queued: number;
    product_rewrites_pending: number;
  };
  gsc_active: boolean;
  recent_runs: { id: string; run_type: string; status: string; stats: Record<string, unknown> | null; error: string | null; started_at: string }[];
  recent_posts: { id: string; title: string; focus_keyword: string; status: string; published_url: string | null; created_at: string }[];
  pending_rewrites: { id: string; woo_product_id: number; old_title: string; new_title: string; new_short_description: string; rationale: string }[];
}

const statusColor = (s: string) =>
  s === "success" || s === "published" || s === "applied"
    ? "bg-green-500/15 text-green-600"
    : s === "failed"
    ? "bg-red-500/15 text-red-600"
    : s === "skipped"
    ? "bg-muted text-muted-foreground"
    : "bg-amber-500/15 text-amber-600";

export default function SEOEngine() {
  const { toast } = useToast();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [wpUser, setWpUser] = useState("");
  const [wpPass, setWpPass] = useState("");

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("seo-engine", { body });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || "Engine error");
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await invoke({ action: "status" });
      setStatus(data);
      if (data?.settings?.wp_username) setWpUser(data.settings.wp_username);
    } catch (e) {
      toast({ title: "Failed to load SEO engine status", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [invoke, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAction = async (action: string, label: string, extra: Record<string, unknown> = {}) => {
    setRunning(action + (extra.audit_id ?? ""));
    try {
      const result = await invoke({ action, ...extra });
      toast({ title: `${label} complete`, description: JSON.stringify(result?.skipped ? result.reason : result?.error ?? "OK").slice(0, 200) });
      await refresh();
    } catch (e) {
      toast({ title: `${label} failed`, description: String(e), variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const saveSettings = async (settings: Record<string, unknown>) => {
    try {
      await invoke({ action: "update_settings", settings });
      toast({ title: "Settings saved" });
      await refresh();
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = status?.settings;
  const c = status?.counts;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Rocket className="h-7 w-7" /> SEO + AEO Engine
          </h1>
          <p className="text-muted-foreground">Automated blog, product SEO, and Search Console loop for {s?.site_url}</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Articles generated</p>
          <p className="text-2xl font-bold">{c?.posts_total ?? 0}</p>
          <p className="text-xs text-muted-foreground">{c?.posts_published ?? 0} published to WordPress</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Keywords queued</p>
          <p className="text-2xl font-bold">{c?.keywords_queued ?? 0}</p>
          <p className="text-xs text-muted-foreground">refills from Search Console</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Product rewrites pending</p>
          <p className="text-2xl font-bold">{c?.product_rewrites_pending ?? 0}</p>
          <p className="text-xs text-muted-foreground">review & apply below</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Search Console loop</p>
          <Badge className={status?.gsc_active ? "bg-green-500/15 text-green-600" : "bg-amber-500/15 text-amber-600"}>
            {status?.gsc_active ? "ACTIVE" : "WAITING ON CREDENTIAL"}
          </Badge>
          <p className="text-xs text-muted-foreground mt-1">
            {status?.gsc_active ? `last sync ${s?.last_gsc_sync_at ?? "never"}` : "set GSC_SERVICE_ACCOUNT_JSON secret"}
          </p>
        </Card>
      </div>

      {/* Run now */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Run now</h2>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!running} onClick={() => runAction("generate_blog", "Blog generation")}>
            {running === "generate_blog" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Generate blog post
          </Button>
          <Button disabled={!!running} variant="secondary" onClick={() => runAction("product_sweep", "Product sweep")}>
            {running === "product_sweep" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
            Product SEO sweep
          </Button>
          <Button disabled={!!running} variant="secondary" onClick={() => runAction("audit", "Site audit")}>
            {running === "audit" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
            Site audit
          </Button>
          <Button disabled={!!running} variant="outline" onClick={() => runAction("gsc_sync", "Search Console sync")}>
            {running === "gsc_sync" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            GSC sync
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Scheduled automatically: daily blog 9am ET · weekly product sweep & audit Mondays · daily GSC sync.
        </p>
      </Card>

      {/* Settings */}
      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Settings</h2>
        <div className="flex items-center justify-between">
          <div>
            <Label>Auto-blog (daily)</Label>
            <p className="text-xs text-muted-foreground">Generate + publish one AEO article per day</p>
          </div>
          <Switch checked={!!s?.auto_blog_enabled} onCheckedChange={(v) => saveSettings({ auto_blog_enabled: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Auto-apply product rewrites</Label>
            <p className="text-xs text-muted-foreground">Off = sweep proposes, you approve below. On = applies straight to the live store.</p>
          </div>
          <Switch checked={!!s?.auto_apply_product_sweep} onCheckedChange={(v) => saveSettings({ auto_apply_product_sweep: v })} />
        </div>
        <div className="space-y-2 pt-2 border-t">
          <Label>WordPress publishing credential</Label>
          <p className="text-xs text-muted-foreground">
            {s?.wp_connected
              ? `Connected as ${s.wp_username} — articles publish live automatically.`
              : "Not connected — articles queue until you add a WordPress application password (WP Admin → Users → Profile → Application Passwords)."}
          </p>
          <div className="flex flex-col md:flex-row gap-2">
            <Input placeholder="WP username (e.g. trish@weprintwraps.com)" value={wpUser} onChange={(e) => setWpUser(e.target.value)} />
            <Input placeholder="Application password" type="password" value={wpPass} onChange={(e) => setWpPass(e.target.value)} />
            <Button
              disabled={!wpUser || !wpPass}
              onClick={() => saveSettings({ wp_username: wpUser, wp_app_password: wpPass })}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>

      {/* Pending product rewrites */}
      {(status?.pending_rewrites?.length ?? 0) > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Pending product rewrites</h2>
          {status!.pending_rewrites.map((r) => (
            <div key={r.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground line-through">{r.old_title}</p>
                  <p className="font-medium">{r.new_title}</p>
                  <p className="text-sm text-muted-foreground">{r.new_short_description}</p>
                  <p className="text-xs italic text-muted-foreground mt-1">{r.rationale}</p>
                </div>
                <Button
                  size="sm"
                  disabled={!!running}
                  onClick={() => runAction("apply_product", "Apply rewrite", { audit_id: r.id })}
                >
                  {running === `apply_product${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Recent posts */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Recent articles</h2>
        {(status?.recent_posts?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No articles yet — hit "Generate blog post".</p>}
        {status?.recent_posts?.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b last:border-0 pb-2">
            <div>
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground">
                {p.focus_keyword} · {new Date(p.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusColor(p.status)}>{p.status}</Badge>
              {p.published_url && (
                <a href={p.published_url} target="_blank" rel="noreferrer" className="text-xs underline">
                  view
                </a>
              )}
            </div>
          </div>
        ))}
      </Card>

      {/* Recent runs */}
      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Engine runs</h2>
        {status?.recent_runs?.map((r) => (
          <div key={r.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-1">
            <span>
              {r.run_type} · {new Date(r.started_at).toLocaleString()}
            </span>
            <span className="flex items-center gap-2">
              {r.error && <span className="text-xs text-red-500 max-w-[300px] truncate">{r.error}</span>}
              <Badge className={statusColor(r.status)}>{r.status}</Badge>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
