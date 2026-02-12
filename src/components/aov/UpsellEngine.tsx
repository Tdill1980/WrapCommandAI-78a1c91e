/**
 * Upsell Engine Component
 *
 * Displays intelligent upsell recommendations based on context.
 * Used on the AOV dashboard and embeddable in quote flows.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight, Zap, Target, TrendingUp, Copy, CheckCircle2
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  UPSELL_RULES,
  formatCurrency,
  type UpsellRecommendation,
} from "@/lib/aovEngine";

const MAGENTA = "#E91E8C";

const PRIORITY_COLORS = {
  high: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  low: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
};

function UpsellCard({ rule }: { rule: UpsellRecommendation }) {
  const [copied, setCopied] = useState(false);
  const colors = PRIORITY_COLORS[rule.priority];

  const handleCopy = () => {
    const text = `${rule.upsell}: ${rule.reason}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Upsell script copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-lg p-3 border ${colors.border} ${colors.bg}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <ArrowUpRight className={`h-4 w-4 ${colors.text}`} />
          <span className="text-sm font-semibold text-white">{rule.upsell}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${colors.text} border-current`}>
            +{formatCurrency(rule.additionalValue)}
          </Badge>
          <button
            onClick={handleCopy}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{rule.reason}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-gray-500">When customer has:</span>
        <Badge variant="secondary" className="text-[10px] bg-white/5 text-gray-400 border-0">
          {rule.trigger}
        </Badge>
      </div>
    </div>
  );
}

export function UpsellEngine() {
  const highPriority = UPSELL_RULES.filter(r => r.priority === 'high');
  const mediumPriority = UPSELL_RULES.filter(r => r.priority === 'medium');
  const lowPriority = UPSELL_RULES.filter(r => r.priority === 'low');

  return (
    <Card className="bg-[#111318] border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Target className="h-5 w-5" style={{ color: MAGENTA }} />
          Upsell Playbook
        </CardTitle>
        <p className="text-sm text-gray-400">
          Context-triggered scripts to increase every order. Copy and paste into quotes or chat.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* High Priority */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">High Impact</span>
          </div>
          <div className="space-y-2">
            {highPriority.map((rule, i) => (
              <UpsellCard key={i} rule={rule} />
            ))}
          </div>
        </div>

        {/* Medium Priority */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-yellow-400" />
            <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Medium Impact</span>
          </div>
          <div className="space-y-2">
            {mediumPriority.map((rule, i) => (
              <UpsellCard key={i} rule={rule} />
            ))}
          </div>
        </div>

        {/* Low Priority */}
        {lowPriority.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Nice-to-Have</span>
            </div>
            <div className="space-y-2">
              {lowPriority.map((rule, i) => (
                <UpsellCard key={i} rule={rule} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
