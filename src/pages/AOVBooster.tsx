/**
 * AOV Booster Dashboard
 *
 * Central command center for driving Average Order Value from ~$500 to $1,000+.
 * Combines metrics, bundle builder, volume calculator, fleet quoting,
 * upsell playbook, and competitor intelligence.
 *
 * Target: B2B wholesale wrap installers and sign shops.
 */

import { useState } from "react";
import { MainLayout } from "@/layouts/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target, Package, Calculator, Truck, Crosshair, Eye,
  TrendingUp, Zap, DollarSign, BarChart3
} from "lucide-react";
import { AOVMetrics } from "@/components/aov/AOVMetrics";
import { BundleCards } from "@/components/aov/BundleCards";
import { VolumeCalculator } from "@/components/aov/VolumeCalculator";
import { FleetQuoteBuilder } from "@/components/aov/FleetQuoteBuilder";
import { UpsellEngine } from "@/components/aov/UpsellEngine";
import { ShippingProgress } from "@/components/aov/ShippingProgress";
import { CompetitorIntel } from "@/components/aov/CompetitorIntel";

const MAGENTA = "#E91E8C";

// AOV Strategy checklist - actionable tactics
const AOV_STRATEGIES = [
  {
    category: 'Bundling',
    icon: Package,
    tactics: [
      { name: 'Full Wrap + Contour-Cut bundle', impact: 'high', status: 'active', aovLift: '+$400-600' },
      { name: 'Design + Print bundle ($750 design + printing)', impact: 'high', status: 'active', aovLift: '+$750' },
      { name: 'Wrap + Window Perf combo', impact: 'medium', status: 'active', aovLift: '+$180' },
      { name: 'Wall Wrap + Vehicle combo for businesses', impact: 'medium', status: 'active', aovLift: '+$325' },
    ],
  },
  {
    category: 'Volume Incentives',
    icon: TrendingUp,
    tactics: [
      { name: 'Tiered volume discounts (5-20%)', impact: 'high', status: 'active', aovLift: '2-3x order' },
      { name: 'Free shipping at $750 threshold', impact: 'high', status: 'active', aovLift: '+$50-250' },
      { name: '"Add X sqft to hit next tier" nudges in chat', impact: 'high', status: 'active', aovLift: '+$200-500' },
      { name: 'Fleet starter packs (3, 5, 10 vehicles)', impact: 'high', status: 'active', aovLift: '5-10x order' },
    ],
  },
  {
    category: 'Upselling',
    icon: Zap,
    tactics: [
      { name: 'Contour-cut upgrade on every wrap quote', impact: 'high', status: 'active', aovLift: '+$200-400' },
      { name: 'Window perf add-on suggestion', impact: 'medium', status: 'active', aovLift: '+$120-180' },
      { name: 'Second vehicle tier-bump nudge', impact: 'high', status: 'active', aovLift: '2x order' },
      { name: 'Post-purchase upsell emails (24hr)', impact: 'medium', status: 'active', aovLift: '+$300-500' },
    ],
  },
  {
    category: 'Cross-Selling',
    icon: Crosshair,
    tactics: [
      { name: 'Swatch book add-on ($26.50)', impact: 'low', status: 'active', aovLift: '+$26' },
      { name: 'Pantone chart upsell ($42)', impact: 'low', status: 'active', aovLift: '+$42' },
      { name: 'FadeWraps add-on with full wraps', impact: 'medium', status: 'active', aovLift: '+$600-990' },
      { name: 'WBTY pattern yards for accent panels', impact: 'low', status: 'active', aovLift: '+$95-475' },
    ],
  },
];

const IMPACT_COLORS = {
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  low: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

export default function AOVBooster() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <MainLayout>
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: MAGENTA + '30' }}
            >
              <Target className="h-5 w-5" style={{ color: MAGENTA }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AOV Booster</h1>
              <p className="text-sm text-gray-400">
                Drive average order value from $500 to $1,000+
              </p>
            </div>
          </div>
          <Badge
            className="text-xs px-3 py-1 text-white border-0"
            style={{ background: MAGENTA }}
          >
            Target: $1,000+ AOV
          </Badge>
        </div>

        {/* KPI Metrics */}
        <AOVMetrics />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="overview" className="text-xs data-[state=active]:text-white">
              <BarChart3 className="h-3 w-3 mr-1" />
              Strategy
            </TabsTrigger>
            <TabsTrigger value="bundles" className="text-xs data-[state=active]:text-white">
              <Package className="h-3 w-3 mr-1" />
              Bundles
            </TabsTrigger>
            <TabsTrigger value="calculator" className="text-xs data-[state=active]:text-white">
              <Calculator className="h-3 w-3 mr-1" />
              Calculator
            </TabsTrigger>
            <TabsTrigger value="fleet" className="text-xs data-[state=active]:text-white">
              <Truck className="h-3 w-3 mr-1" />
              Fleet Builder
            </TabsTrigger>
            <TabsTrigger value="upsells" className="text-xs data-[state=active]:text-white">
              <Zap className="h-3 w-3 mr-1" />
              Upsell Playbook
            </TabsTrigger>
            <TabsTrigger value="competitors" className="text-xs data-[state=active]:text-white">
              <Eye className="h-3 w-3 mr-1" />
              Competitors
            </TabsTrigger>
          </TabsList>

          {/* Strategy Overview */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {AOV_STRATEGIES.map(strategy => {
                const Icon = strategy.icon;
                return (
                  <Card key={strategy.category} className="bg-[#111318] border-white/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: MAGENTA }} />
                        {strategy.category}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {strategy.tactics.map(tactic => (
                        <div
                          key={tactic.name}
                          className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`h-1.5 w-1.5 rounded-full ${
                              tactic.status === 'active' ? 'bg-green-400' : 'bg-gray-500'
                            }`} />
                            <span className="text-xs text-gray-300 truncate">{tactic.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className={`text-[10px] border ${IMPACT_COLORS[tactic.impact]}`}
                            >
                              {tactic.impact}
                            </Badge>
                            <span className="text-[10px] text-green-400 font-mono">{tactic.aovLift}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Quick Shipping Progress Demo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ShippingProgress orderTotal={450} />
              <ShippingProgress orderTotal={680} />
              <ShippingProgress orderTotal={900} />
            </div>
          </TabsContent>

          {/* Bundles Tab */}
          <TabsContent value="bundles">
            <BundleCards />
          </TabsContent>

          {/* Calculator Tab */}
          <TabsContent value="calculator">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <VolumeCalculator />
              <div className="space-y-4">
                <ShippingProgress orderTotal={500} />
                <Card className="bg-[#111318] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4" style={{ color: MAGENTA }} />
                      Quick Pricing Reference
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { name: 'Avery MPI 1105 + DOL 1460Z', price: '$5.27/sqft' },
                        { name: '3M IJ180Cv3 + 8518', price: '$5.27/sqft' },
                        { name: 'Avery Contour-Cut', price: '$6.32/sqft' },
                        { name: '3M Contour-Cut', price: '$6.92/sqft' },
                        { name: 'Window Perf 50/50', price: '$5.95/sqft' },
                        { name: 'Wall Wrap Vinyl', price: '$3.25/sqft' },
                        { name: 'Custom Wrap Design', price: '$750 flat' },
                        { name: 'Design Copy/Draft', price: '$500 flat' },
                        { name: 'InkFusion Roll', price: '$2,075/roll' },
                        { name: 'WBTY (all patterns)', price: '$95.50/yard' },
                        { name: 'FadeWraps', price: '$600-$990' },
                      ].map(item => (
                        <div key={item.name} className="flex justify-between text-xs">
                          <span className="text-gray-300">{item.name}</span>
                          <span className="text-white font-mono">{item.price}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Fleet Tab */}
          <TabsContent value="fleet">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <FleetQuoteBuilder />
              </div>
              <div className="space-y-4">
                <Card className="bg-[#111318] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Fleet Sales Tips</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      'Always quote 3+ vehicles to show volume savings',
                      'Lead with per-vehicle cost, not total project cost',
                      'Mention 1-2 day shipping - faster than local shops',
                      'Highlight contour-cut to save install labor cost',
                      'Offer phased rollout (5 now, 5 next month)',
                      'Ask about wall wraps for their office/shop',
                      'Fleet orders route to Jackson (602-772-6003)',
                      'Reference our Avery & 3M certifications',
                    ].map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-green-400 mt-0.5">{i + 1}.</span>
                        <span className="text-gray-300">{tip}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-[#111318] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Volume Tier Reference</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { range: '0-499 sqft', discount: '0%', vehicles: '~1-2 vehicles' },
                      { range: '500-999 sqft', discount: '5%', vehicles: '~2-4 vehicles' },
                      { range: '1,000-2,499 sqft', discount: '10%', vehicles: '~5-12 vehicles' },
                      { range: '2,500-4,999 sqft', discount: '15%', vehicles: '~12-25 vehicles' },
                      { range: '5,000+ sqft', discount: '20%', vehicles: '25+ vehicles' },
                    ].map(tier => (
                      <div key={tier.range} className="flex items-center justify-between bg-white/5 rounded px-2 py-1.5">
                        <span className="text-xs text-gray-300">{tier.range}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500">{tier.vehicles}</span>
                          <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">
                            {tier.discount} off
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Upsells Tab */}
          <TabsContent value="upsells">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <UpsellEngine />
              <div className="space-y-4">
                <Card className="bg-[#111318] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4" style={{ color: MAGENTA }} />
                      Quick-Fire Upsell Scripts
                    </CardTitle>
                    <p className="text-xs text-gray-400">Copy-paste ready for chat, email, or phone</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      {
                        trigger: 'Customer orders standard wrap',
                        script: '"Want us to contour-cut the panels too? It saves your installer 2-3 hours per vehicle - adds about $1/sqft but saves way more in labor."',
                      },
                      {
                        trigger: 'Customer gets quote for 1 vehicle',
                        script: '"Got any other vehicles in mind? Adding a second vehicle would bump you into our 5% volume tier, saving on BOTH vehicles."',
                      },
                      {
                        trigger: 'Order is under $750',
                        script: '"You\'re only $X away from free shipping - that\'ll save about $65. Want to add a swatch book or bump up the quantity?"',
                      },
                      {
                        trigger: 'Customer mentions fleet/multiple',
                        script: '"For fleet orders, we do volume pricing up to 20% off. Let me connect you with Jackson on our commercial team - he can build a custom fleet quote."',
                      },
                      {
                        trigger: 'Customer orders design only',
                        script: '"If you bundle the design with printing, you save 5% on the print. One invoice, one project, and we guarantee the files are print-ready."',
                      },
                    ].map((item, i) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3">
                        <div className="text-[10px] text-gray-500 mb-1">When: {item.trigger}</div>
                        <p className="text-xs text-gray-300 italic">{item.script}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Competitors Tab */}
          <TabsContent value="competitors">
            <CompetitorIntel />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
