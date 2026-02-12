/**
 * AOV Metrics Header
 *
 * Top-level KPI cards showing current vs target AOV,
 * revenue impact projections, and competitive positioning.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, Target, TrendingUp, Users, Truck, BarChart3,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { AOV_TARGET, AOV_CURRENT, formatCurrency } from "@/lib/aovEngine";

const MAGENTA = "#E91E8C";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  accent?: string;
}

function MetricCard({ title, value, subtitle, icon, trend, accent }: MetricCardProps) {
  return (
    <Card className="bg-[#111318] border-white/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: (accent || MAGENTA) + '20' }}
          >
            {icon}
          </div>
          {trend && (
            <div className={`flex items-center gap-0.5 text-xs ${
              trend.positive ? 'text-green-400' : 'text-red-400'
            }`}>
              {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trend.value}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-400 mb-1">{title}</div>
        <div className="text-xl font-bold text-white">{value}</div>
        <div className="text-[10px] text-gray-500 mt-0.5">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

export function AOVMetrics() {
  // These would be dynamic in production (from Supabase / WooCommerce)
  const currentAOV = AOV_CURRENT;
  const targetAOV = AOV_TARGET;
  const monthlyOrders = 400; // ~$200K / $500 AOV
  const monthlyRevenue = 200000;
  const progressToTarget = (currentAOV / targetAOV) * 100;

  // Revenue impact if we hit target
  const revenueAtTarget = monthlyOrders * targetAOV;
  const revenueGain = revenueAtTarget - monthlyRevenue;

  return (
    <div className="space-y-4">
      {/* AOV Progress Banner */}
      <Card className="bg-gradient-to-r from-[#111318] to-[#1a1020] border-white/10">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ background: MAGENTA + '30' }}
              >
                <Target className="h-5 w-5" style={{ color: MAGENTA }} />
              </div>
              <div>
                <h2 className="text-white font-semibold">AOV Target: {formatCurrency(targetAOV)}</h2>
                <p className="text-xs text-gray-400">
                  Current: {formatCurrency(currentAOV)} | Gap: {formatCurrency(targetAOV - currentAOV)}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-yellow-400 border-yellow-400/30"
            >
              {Math.round(progressToTarget)}% to target
            </Badge>
          </div>
          <Progress value={progressToTarget} className="h-2 mb-2" />
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>{formatCurrency(currentAOV)}</span>
            <span>{formatCurrency(targetAOV)}</span>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Current AOV"
          value={formatCurrency(currentAOV)}
          subtitle={`${monthlyOrders} orders/mo`}
          icon={<DollarSign className="h-4 w-4" style={{ color: MAGENTA }} />}
          trend={{ value: '+3.2%', positive: true }}
        />
        <MetricCard
          title="Monthly Revenue"
          value={formatCurrency(monthlyRevenue)}
          subtitle="20% margin ($40K profit)"
          icon={<BarChart3 className="h-4 w-4 text-blue-400" />}
          accent="#3B82F6"
        />
        <MetricCard
          title="Revenue at $1K AOV"
          value={formatCurrency(revenueAtTarget)}
          subtitle={`+${formatCurrency(revenueGain)}/mo potential`}
          icon={<TrendingUp className="h-4 w-4 text-green-400" />}
          accent="#10B981"
        />
        <MetricCard
          title="Daily Traffic"
          value="~300"
          subtitle="Meta + Google Ads ($290/day)"
          icon={<Users className="h-4 w-4 text-purple-400" />}
          accent="#8B5CF6"
        />
      </div>

      {/* Impact Projection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-[#111318] border-white/10">
          <CardContent className="p-4">
            <div className="text-xs text-gray-400 mb-1">If AOV hits $750</div>
            <div className="text-lg font-bold text-white">{formatCurrency(monthlyOrders * 750)}/mo</div>
            <div className="text-xs text-green-400">+{formatCurrency(monthlyOrders * 750 - monthlyRevenue)} revenue</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111318] border-white/10">
          <CardContent className="p-4">
            <div className="text-xs text-gray-400 mb-1">If AOV hits $1,000</div>
            <div className="text-lg font-bold text-white">{formatCurrency(monthlyOrders * 1000)}/mo</div>
            <div className="text-xs text-green-400">+{formatCurrency(monthlyOrders * 1000 - monthlyRevenue)} revenue ({Math.round(((monthlyOrders * 1000 - monthlyRevenue) / monthlyRevenue) * 100)}%)</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111318] border-white/10">
          <CardContent className="p-4">
            <div className="text-xs text-gray-400 mb-1">If AOV hits $1,500</div>
            <div className="text-lg font-bold text-white">{formatCurrency(monthlyOrders * 1500)}/mo</div>
            <div className="text-xs text-green-400">+{formatCurrency(monthlyOrders * 1500 - monthlyRevenue)} revenue ({Math.round(((monthlyOrders * 1500 - monthlyRevenue) / monthlyRevenue) * 100)}%)</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
