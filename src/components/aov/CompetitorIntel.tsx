/**
 * Competitor Intelligence Panel
 *
 * Quick-reference panel showing key competitor positioning
 * to inform pricing and bundling strategy decisions.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Shield, AlertTriangle, Eye } from "lucide-react";

const MAGENTA = "#E91E8C";

interface Competitor {
  name: string;
  url: string;
  location: string;
  strengths: string[];
  weaknesses: string[];
  differentiator: string;
  threatLevel: 'high' | 'medium' | 'low';
}

const COMPETITORS: Competitor[] = [
  {
    name: 'WrapMate',
    url: 'wrapmate.com',
    location: 'Nationwide',
    strengths: ['Strong brand', 'Nationwide installer network', 'Consumer-friendly UX', 'Heavy digital marketing'],
    weaknesses: ['Higher consumer pricing', 'Not B2B focused', 'Installation middleman model'],
    differentiator: 'Consumer marketplace connecting buyers with installers',
    threatLevel: 'high',
  },
  {
    name: 'Alwan Wraps',
    url: 'alwanwraps.com',
    location: 'Michigan',
    strengths: ['Strong SEO', 'Custom color wraps', 'Good content marketing'],
    weaknesses: ['Regional focus', 'Slower shipping', 'Less product variety'],
    differentiator: 'Custom color wrap specialization',
    threatLevel: 'medium',
  },
  {
    name: 'Designer Wraps',
    url: 'designerwraps.com',
    location: 'Nationwide',
    strengths: ['Print & ship nationwide', 'Design services', 'Professional branding'],
    weaknesses: ['Less aggressive pricing', 'Slower turnaround'],
    differentiator: 'Design-first approach',
    threatLevel: 'medium',
  },
  {
    name: 'Foxy Wraps',
    url: 'foxywraps.com',
    location: 'Georgia/Tennessee',
    strengths: ['Fleet focus', 'Regional reputation', 'Quick turnaround'],
    weaknesses: ['Regional only', 'Limited online presence'],
    differentiator: 'Fleet specialization in Southeast',
    threatLevel: 'low',
  },
  {
    name: 'Wraphx',
    url: 'wraphx.com',
    location: 'Bradenton, FL',
    strengths: ['Wholesale fleet wraps', 'B2B pricing'],
    weaknesses: ['Limited geographic reach', 'Smaller operation'],
    differentiator: 'Wholesale fleet wrap printing',
    threatLevel: 'medium',
  },
  {
    name: 'RoadRunner Wraps',
    url: 'roadrunnerwraps.com',
    location: 'Nationwide',
    strengths: ['Wholesale wraps page', 'B2B focus'],
    weaknesses: ['Less established brand', 'Limited product range'],
    differentiator: 'Dedicated wholesale channel',
    threatLevel: 'low',
  },
];

const THREAT_COLORS = {
  high: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  low: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
};

export function CompetitorIntel() {
  return (
    <Card className="bg-[#111318] border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Eye className="h-5 w-5" style={{ color: MAGENTA }} />
          Competitor Intelligence
        </CardTitle>
        <p className="text-sm text-gray-400">
          Know the landscape to price and position bundles competitively
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {COMPETITORS.map(comp => {
            const colors = THREAT_COLORS[comp.threatLevel];
            return (
              <div
                key={comp.name}
                className={`rounded-lg p-3 border ${colors.border} ${colors.bg}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{comp.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${colors.text} border-current`}>
                      {comp.threatLevel} threat
                    </Badge>
                  </div>
                  <span className="text-[10px] text-gray-500">{comp.location}</span>
                </div>
                <p className="text-xs text-gray-300 mb-2">{comp.differentiator}</p>
                <div className="flex flex-wrap gap-1">
                  {comp.strengths.slice(0, 3).map(s => (
                    <Badge key={s} variant="secondary" className="text-[10px] bg-white/5 text-gray-400 border-0">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* WPW Competitive Advantages */}
        <div className="mt-4 bg-green-500/5 border border-green-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold text-green-400">WePrintWraps Advantages</span>
          </div>
          <ul className="space-y-1">
            {[
              'B2B wholesale pricing (not marked up for consumers)',
              '1-2 day shipping nationwide from Phoenix',
              'Free shipping over $750',
              'No minimums - order 1 panel or 100',
              'Volume discounts up to 20% (5,000+ sqft)',
              'HP Latex + Epson Resin = premium print quality',
              'Avery Dennison & 3M certified materials only',
              'Contour-cut install-ready panels available',
              'Real-time order tracking (ShopFlow)',
              'AI-powered instant quoting (24/7)',
            ].map(adv => (
              <li key={adv} className="text-xs text-gray-300 flex items-start gap-1.5">
                <span className="text-green-400 mt-0.5">+</span>
                {adv}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
