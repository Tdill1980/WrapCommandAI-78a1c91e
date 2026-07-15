import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, RefreshCw, FileText, Clock, CheckCircle, XCircle, Zap, Mail, Eye } from "lucide-react";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";
import { format } from "date-fns";

interface Quote {
  id: string;
  quote_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  customer_price: number | null;
  status: string | null;
  auto_retarget: boolean | null;
  followup_count?: number | null;
  follow_up_count?: number | null;
  created_at: string | null;
  woocommerce_synced?: boolean | null;
  email_sent?: boolean | null;
  source?: string | null;
}

interface Stats {
  total: number;
  pending: number;
  completed: number;
  expired: number;
  autoFollow: number;
  emailsSent: number;
}

export function QuotesTab() {
  const { organizationId } = useOrganization();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, completed: 0, expired: 0, autoFollow: 0, emailsSent: 0 });
  const [emailFilter, setEmailFilter] = useState<string>("all");
  const [runningRetargeting, setRunningRetargeting] = useState(false);

  const runRetargeting = async () => {
    setRunningRetargeting(true);
    try {
      const { data, error } = await lovableFunctions.functions.invoke('run-quote-followups');
      if (error) throw error;
      
      const processed = data?.processed || 0;
      toast.success(`Retargeting complete: ${processed} follow-up${processed !== 1 ? 's' : ''} sent`);
      fetchQuotes();
    } catch (error: any) {
      console.error("Retargeting error:", error);
      toast.error(error.message || "Failed to run retargeting");
    } finally {
      setRunningRetargeting(false);
    }
  };

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("quotes")
        .select("*")
        // Website Page Chat only (never include Instagram/email sourced quotes here)
        .or("source.eq.website_chat,source.eq.website");
      // Tenant isolation (SaaS): only this org's quotes.
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(100);


      if (error) throw error;

      const quotesData = data || [];
      setQuotes(quotesData as Quote[]);

      // Calculate stats
      setStats({
        total: quotesData.length,
        pending: quotesData.filter(q => q.status === "pending" || q.status === "lead" || q.status === "pending_approval").length,
        completed: quotesData.filter(q => q.status === "completed" || q.status === "converted").length,
        expired: quotesData.filter(q => q.status === "expired").length,
        autoFollow: quotesData.filter(q => q.auto_retarget).length,
        emailsSent: quotesData.filter(q => q.email_sent).length,
      });
    } catch (error) {
      console.error("Error fetching quotes:", error);
      toast.error("Failed to load quotes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
    // Re-fetch when the tenant org resolves so quotes are correctly scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const toggleAutoRetarget = async (quoteId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ auto_retarget: !currentValue })
        .eq("id", quoteId);

      if (error) throw error;

      setQuotes(quotes.map(q => 
        q.id === quoteId ? { ...q, auto_retarget: !currentValue } : q
      ));
      toast.success(`Auto-retarget ${!currentValue ? "enabled" : "disabled"}`);
    } catch (error) {
      toast.error("Failed to update");
    }
  };

  const sendFollowUp = async (quote: Quote) => {
    toast.info(`Sending follow-up to ${quote.customer_email}...`);
    // Implementation would call edge function
  };

  const filteredQuotes = quotes.filter(q => {
    // Email filter
    if (emailFilter === "sent" && !q.email_sent) return false;
    if (emailFilter === "not_sent" && q.email_sent) return false;
    
    // Search filter
    return (
      q.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.quote_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.vehicle_make?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.vehicle_model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.source?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "pending":
      case "lead":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Pending</Badge>;
      case "pending_approval":
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30">Needs Approval</Badge>;
      case "completed":
      case "converted":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Completed</Badge>;
      case "expired":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/30">Expired</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Quotes</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setEmailFilter(emailFilter === "sent" ? "all" : "sent")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Emails Sent</CardTitle>
            <Mail className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${emailFilter === "sent" ? "text-emerald-500" : ""}`}>{stats.emailsSent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.expired}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Auto-Follow</CardTitle>
            <Zap className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">{stats.autoFollow}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Actions */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer, email, vehicle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={fetchQuotes} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button 
          onClick={runRetargeting} 
          disabled={runningRetargeting || loading}
          className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] hover:opacity-90 text-white"
        >
          <Zap className={`h-4 w-4 mr-2 ${runningRetargeting ? "animate-pulse" : ""}`} />
          {runningRetargeting ? "Running..." : "Run Retargeting"}
        </Button>
      </div>

      {/* Quotes Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Email Sent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Follow-ups</TableHead>
                <TableHead>Auto-Retarget</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Loading quotes...
                  </TableCell>
                </TableRow>
              ) : filteredQuotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No quotes found
                  </TableCell>
                </TableRow>
              ) : (
                filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-mono text-sm">{quote.quote_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {quote.source || "manual"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{quote.customer_name || "Unknown"}</div>
                        <div className="text-sm text-muted-foreground">{quote.customer_email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {quote.vehicle_year && quote.vehicle_make && quote.vehicle_model
                        ? `${quote.vehicle_year} ${quote.vehicle_make} ${quote.vehicle_model}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {quote.customer_price 
                        ? `$${quote.customer_price.toLocaleString()}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {quote.email_sent ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                          <Mail className="h-3 w-3 mr-1" /> Sent
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Not Sent</Badge>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{quote.follow_up_count || quote.followup_count || 0}</span>
                      <span className="text-muted-foreground">/3</span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={quote.auto_retarget || false}
                        onCheckedChange={() => toggleAutoRetarget(quote.id, quote.auto_retarget || false)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {quote.created_at ? format(new Date(quote.created_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" title="Preview">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          title="Send Follow-up"
                          onClick={() => sendFollowUp(quote)}
                          disabled={!quote.customer_email}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
