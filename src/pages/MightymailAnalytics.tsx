import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, Mail, DollarSign, Clock, Users,
  FileText, AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay } from 'date-fns';

interface Stats {
  totalEmails: number;
  unread: number;
  quoteRequests: number;
  quotesGenerated: number;
  quotesConverted: number;
  conversionRate: number;
  escalations: number;
  fileSubmissions: number;
  avgResponseTime: number;
  emailsByCategory: Record<string, number>;
  emailsByMailbox: Record<string, number>;
  dailyVolume: { date: string; count: number }[];
}

export default function MightymailAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 1;
      const startDate = startOfDay(subDays(new Date(), days)).toISOString();

      // Get all emails in period
      const { data: emails } = await supabase
        .from('mightymail_inbox')
        .select('id, category, mailbox, is_read, quote_status, received_at')
        .gte('received_at', startDate);

      // Get analytics events
      const { data: events } = await supabase
        .from('mightymail_analytics')
        .select('event_type, created_at')
        .gte('created_at', startDate);

      if (!emails) {
        setStats(null);
        return;
      }

      // Calculate stats
      const totalEmails = emails.length;
      const unread = emails.filter(e => !e.is_read).length;
      const quoteRequests = emails.filter(e => e.category === 'quote_request').length;
      const quotesGenerated = emails.filter(e => e.quote_status === 'pending' || e.quote_status === 'sent').length;
      const quotesConverted = emails.filter(e => e.quote_status === 'converted').length;
      const escalations = emails.filter(e => e.category === 'escalation').length;
      const fileSubmissions = emails.filter(e => e.category === 'file_submission').length;

      // Category breakdown
      const emailsByCategory: Record<string, number> = {};
      emails.forEach(e => {
        const cat = e.category || 'unclassified';
        emailsByCategory[cat] = (emailsByCategory[cat] || 0) + 1;
      });

      // Mailbox breakdown
      const emailsByMailbox: Record<string, number> = {};
      emails.forEach(e => {
        const mb = e.mailbox?.split('@')[0] || 'unknown';
        emailsByMailbox[mb] = (emailsByMailbox[mb] || 0) + 1;
      });

      // Daily volume
      const dailyMap: Record<string, number> = {};
      emails.forEach(e => {
        const day = format(new Date(e.received_at), 'yyyy-MM-dd');
        dailyMap[day] = (dailyMap[day] || 0) + 1;
      });
      const dailyVolume = Object.entries(dailyMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setStats({
        totalEmails,
        unread,
        quoteRequests,
        quotesGenerated,
        quotesConverted,
        conversionRate: quoteRequests > 0 ? (quotesConverted / quoteRequests) * 100 : 0,
        escalations,
        fileSubmissions,
        avgResponseTime: 0, // TODO: Calculate from events
        emailsByCategory,
        emailsByMailbox,
        dailyVolume,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading analytics...</div>;
  }

  if (!stats) {
    return <div className="p-8 text-center">No data available</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Mightymail Analytics
        </h1>
        <div className="flex gap-2">
          {['1d', '7d', '30d'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded text-sm ${
                period === p ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {p === '1d' ? 'Today' : p === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Emails</p>
                <p className="text-3xl font-bold">{stats.totalEmails}</p>
              </div>
              <Mail className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Quote Requests</p>
                <p className="text-3xl font-bold">{stats.quoteRequests}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-3xl font-bold">{stats.conversionRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Escalations</p>
                <p className="text-3xl font-bold">{stats.escalations}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Quotes Generated</div>
          <div className="text-2xl font-bold">{stats.quotesGenerated}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Quotes Converted</div>
          <div className="text-2xl font-bold text-green-600">{stats.quotesConverted}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">File Submissions</div>
          <div className="text-2xl font-bold">{stats.fileSubmissions}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Unread</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.unread}</div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.emailsByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{category}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${(count / stats.totalEmails) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Mailbox Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By Mailbox</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.emailsByMailbox)
                .sort((a, b) => b[1] - a[1])
                .map(([mailbox, count]) => (
                  <div key={mailbox} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{mailbox}@</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500" 
                          style={{ width: `${(count / stats.totalEmails) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Volume Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {stats.dailyVolume.map((day, i) => {
              const maxCount = Math.max(...stats.dailyVolume.map(d => d.count));
              const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div 
                    className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
                    style={{ height: `${height}%`, minHeight: day.count > 0 ? '4px' : '0' }}
                    title={`${day.date}: ${day.count} emails`}
                  />
                  <span className="text-xs text-muted-foreground rotate-45 origin-left">
                    {format(new Date(day.date), 'M/d')}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
