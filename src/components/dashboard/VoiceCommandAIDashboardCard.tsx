import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Zap,
  ArrowRight,
  MessageSquare,
  Phone,
  Instagram,
  Flame,
  FileText
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function VoiceCommandAIDashboardCard({ className }: { className?: string }) {
  const navigate = useNavigate();

  // Fetch VoiceCommandAI activity stats across all channels
  const { data: vcaiStats } = useQuery({
    queryKey: ["voicecommandai-dashboard-stats"],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [
        websiteChatResult,
        phoneCallsResult,
        instagramResult,
        autoQuotesResult,
        hotLeadsResult
      ] = await Promise.all([
        // Website chat conversations (last 24h)
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("channel", "website")
          .gte("created_at", twentyFourHoursAgo),

        // Phone calls (last 24h)
        supabase
          .from("phone_calls")
          .select("id", { count: "exact", head: true })
          .gte("created_at", twentyFourHoursAgo),

        // Instagram conversations (last 24h)
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("channel", "instagram")
          .gte("created_at", twentyFourHoursAgo),

        // Auto-generated quotes from website chat (last 24h)
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("source", "website_chat")
          .gte("created_at", twentyFourHoursAgo),

        // Hot leads detected (last 24h)
        supabase
          .from("ai_actions")
          .select("id", { count: "exact", head: true })
          .in("action_type", ["create_quote", "auto_quote_generated", "quote_created_from_chat"])
          .gte("created_at", twentyFourHoursAgo),
      ]);

      return {
        websiteChat: websiteChatResult.count || 0,
        phoneCalls: phoneCallsResult.count || 0,
        instagram: instagramResult.count || 0,
        autoQuotes: autoQuotesResult.count || 0,
        hotLeads: hotLeadsResult.count || 0,
        totalProcessed:
          (websiteChatResult.count || 0) +
          (phoneCallsResult.count || 0) +
          (instagramResult.count || 0),
      };
    },
    refetchInterval: 30000,
  });

  const channels = [
    {
      name: "Website",
      icon: MessageSquare,
      count: vcaiStats?.websiteChat || 0,
      color: "text-blue-400",
      bgColor: "bg-blue-500/20",
      path: "/website-admin"
    },
    {
      name: "Phone",
      icon: Phone,
      count: vcaiStats?.phoneCalls || 0,
      color: "text-amber-400",
      bgColor: "bg-amber-500/20",
      path: "/phone-calls"
    },
    {
      name: "Instagram",
      icon: Instagram,
      count: vcaiStats?.instagram || 0,
      color: "text-pink-400",
      bgColor: "bg-pink-500/20",
      path: "/website-admin?channel=instagram"
    },
  ];

  return (
    <Card className={`border-border bg-card overflow-hidden ${className}`}>
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border-b border-violet-500/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold">VoiceCommandAI</span>
              <Zap className="w-3 h-3 text-violet-400" />
            </CardTitle>
            <Badge className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px]">
              ACTIVE
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Unified AI parsing across all channels
          </p>
        </CardHeader>
      </div>

      <CardContent className="pt-4 space-y-4">
        {/* Total processed today */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-violet-600/10 to-indigo-600/10">
          <div>
            <p className="text-2xl font-bold text-foreground">
              {vcaiStats?.totalProcessed || 0}
            </p>
            <p className="text-[10px] text-muted-foreground">Messages processed today</p>
          </div>
          <div className="flex items-center gap-2">
            {(vcaiStats?.hotLeads || 0) > 0 && (
              <Badge className="bg-red-500 text-white animate-pulse flex items-center gap-1">
                <Flame className="w-3 h-3" />
                {vcaiStats?.hotLeads} Hot
              </Badge>
            )}
          </div>
        </div>

        {/* Channel breakdown */}
        <div className="grid grid-cols-3 gap-2">
          {channels.map((channel) => {
            const Icon = channel.icon;
            return (
              <div
                key={channel.name}
                onClick={() => navigate(channel.path)}
                className="p-2 rounded-lg bg-background/50 text-center cursor-pointer hover:bg-background/80 transition-colors"
              >
                <div className={`w-6 h-6 mx-auto rounded-full ${channel.bgColor} flex items-center justify-center mb-1`}>
                  <Icon className={`w-3 h-3 ${channel.color}`} />
                </div>
                <p className="text-lg font-semibold text-foreground">{channel.count}</p>
                <p className="text-[9px] text-muted-foreground">{channel.name}</p>
              </div>
            );
          })}
        </div>

        {/* Auto-quotes generated */}
        <div
          onClick={() => navigate("/admin/website-quotes")}
          className="flex items-center justify-between p-2 rounded-lg bg-green-500/10 border border-green-500/30 cursor-pointer hover:bg-green-500/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-400" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {vcaiStats?.autoQuotes || 0} Auto-Quotes
              </p>
              <p className="text-[10px] text-muted-foreground">Generated today</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-green-400" />
        </div>

        {/* View all button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs border-violet-500/30 hover:bg-violet-500/10"
          onClick={() => navigate("/website-admin")}
        >
          View All Activity
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
