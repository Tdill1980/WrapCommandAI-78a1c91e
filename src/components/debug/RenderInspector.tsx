import { useEffect, useState } from "react";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface QueueRow {
  id: string;
  ai_creative_id: string | null;
  ai_edit_suggestions: any;
  final_render_url: string | null;
  created_at: string;
}

interface CreativeRow {
  id: string;
  status: string;
  output_url: string | null;
  blueprint: any;
  created_at: string;
}

export function RenderInspector() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);

    const { data: queueData } = await contentDB
      .from("video_edit_queue")
      .select("id, ai_creative_id, ai_edit_suggestions, final_render_url, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: creativeData } = await supabase
      .from("ai_creatives")
      .select("id, status, output_url, blueprint, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    setQueue((queueData as QueueRow[]) ?? []);
    setCreatives((creativeData as CreativeRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const getSceneCount = (obj: any): number => {
    if (!obj) return 0;
    if (Array.isArray(obj?.scenes)) return obj.scenes.length;
    if (typeof obj === 'object' && obj.scenes) return obj.scenes.length;
    return 0;
  };

  return (
    <div className="p-4 space-y-4 text-xs bg-black/60 rounded-lg border border-white/10">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-white text-sm">🔍 Render Inspector</h3>
        <Button
          onClick={refresh}
          variant="ghost"
          size="sm"
          disabled={loading}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-white/80">video_edit_queue (latest 5)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-white/70">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-1 px-2">ID</th>
                <th className="py-1 px-2">ai_creative_id</th>
                <th className="py-1 px-2">scenes</th>
                <th className="py-1 px-2">render_url</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-1 px-2 font-mono">{row.id.slice(0, 8)}...</td>
                  <td className={`py-1 px-2 ${row.ai_creative_id ? 'text-green-400' : 'text-red-400'}`}>
                    {row.ai_creative_id ? row.ai_creative_id.slice(0, 8) + '...' : 'NULL'}
                  </td>
                  <td className={`py-1 px-2 ${getSceneCount(row.ai_edit_suggestions) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {getSceneCount(row.ai_edit_suggestions)}
                  </td>
                  <td className={`py-1 px-2 ${row.final_render_url ? 'text-green-400' : 'text-yellow-400'}`}>
                    {row.final_render_url ? '✓ URL' : 'pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-white/80">ai_creatives (latest 5)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-white/70">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-1 px-2">ID</th>
                <th className="py-1 px-2">status</th>
                <th className="py-1 px-2">blueprint scenes</th>
                <th className="py-1 px-2">output_url</th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-1 px-2 font-mono">{row.id.slice(0, 8)}...</td>
                  <td className={`py-1 px-2 ${row.status === 'complete' ? 'text-green-400' : row.status === 'rendering' ? 'text-yellow-400' : 'text-white/50'}`}>
                    {row.status}
                  </td>
                  <td className={`py-1 px-2 ${getSceneCount(row.blueprint) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {getSceneCount(row.blueprint)}
                  </td>
                  <td className={`py-1 px-2 ${row.output_url ? 'text-green-400' : 'text-yellow-400'}`}>
                    {row.output_url ? '✓ URL' : 'pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <p className="text-white/60 text-center">Refreshing…</p>}
    </div>
  );
}
