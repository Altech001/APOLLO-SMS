/* eslint-disable @typescript-eslint/no-explicit-any */

import { base44, SmsMessageResponse } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Boxes,
  BrushIcon,
  ExternalLink,
  Inbox,
  MessageSquare,
  RotateCw,
  Settings
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dashboardQueryKeys, type DashboardDateRange, useDashboardForms, useDashboardSmsDashboard } from "@/hooks/use-dashboard-data";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

function generateId() {
  return "q_" + Math.random().toString(36).substring(2, 9);
}

const toDashboardMessage = (message: SmsMessageResponse) => ({
  id: message.id,
  phone: message.phone,
  message: message.message,
  cost: `${message.cost ?? 0} SMS`,
  sentTime: message.sentAt || message.sent_at || "",
  status: message.status,
});

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isFormsVisible, setIsFormsVisible] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [dateRange, setDateRange] = useState<DashboardDateRange>("month");
  const dashboardUserId = user?.id || null;
  const formsQueryKey = dashboardQueryKeys.forms(dashboardUserId);
  const smsDashboardQueryKey = dashboardQueryKeys.sms(dashboardUserId, dateRange);

  const getMessageStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Delivered":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20";
      case "Failed":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20";
      case "Enqueued":
      case "Sent":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20";
      default:
        return "bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-slate-500/20";
    }
  };

  const copyMessageId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success(`Message ID ${id} copied to clipboard!`);
  };

  const { data: forms = [], isLoading } = useDashboardForms(dashboardUserId);
  const { data: smsDashboard, isLoading: isSmsLoading, error: smsError } = useDashboardSmsDashboard(dashboardUserId, dateRange);

  const recentSentMessages = useMemo(
    () => (smsDashboard?.recent || []).map(toDashboardMessage).slice(0, 5),
    [smsDashboard]
  );
  const chartData = smsDashboard?.chart || [];
  const heatmapData = smsDashboard?.heatmap || [];
  const successCount = smsDashboard?.success_count ?? 0;
  const queuedCount = smsDashboard?.queued_count ?? 0;
  const totalSent = smsDashboard?.total_sent ?? 0;
  const failedCount = smsDashboard?.failed_count ?? 0;
  const deliveryRate = smsDashboard?.delivery_rate ?? 0;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => base44.entities.Form.delete(String(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formsQueryKey });
      toast.success("Form deleted");
    },
  });

  const createForm = async () => {
    const form = await base44.entities.Form.create({
      title: "Untitled Form",
      description: "",
      questions: [],
      status: "draft",
      response_count: 0,
    });
    queryClient.invalidateQueries({ queryKey: formsQueryKey });
    navigate(`/forms/${form.id}/edit`);
  };

  const createFromTemplate = async (template) => {
    const questions = template.questions.map((q) => ({
      ...q,
      id: generateId(),
    }));
    const form = await base44.entities.Form.create({
      title: template.title,
      description: template.description,
      questions,
      status: "draft",
      response_count: 0,
      branding: template.branding || {},
    });
    setShowTemplates(false);
    queryClient.invalidateQueries({ queryKey: formsQueryKey });
    toast.success(`Created from "${template.title}" template`);
    navigate(`/forms/${form.id}/edit`);
  };

  const copyLink = (formId) => {
    const url = `${window.location.origin}/f/${formId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: formsQueryKey }),
        queryClient.invalidateQueries({ queryKey: smsDashboardQueryKey }),
      ]);
      toast.success("Dashboard data updated!");
    } catch (err) {
      toast.error("Failed to refresh dashboard data");
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 800);
    }
  };

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const items = Array.from(forms);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    queryClient.setQueryData(formsQueryKey, items);
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  useEffect(() => {
    const handler = (e: any) => {
      setSidebarCollapsed(e.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    const resetDashboardCache = () => {
      queryClient.removeQueries({ queryKey: dashboardQueryKeys.all });
    };
    window.addEventListener("apollosms-user-cache-cleared", resetDashboardCache);
    window.addEventListener("apollosms-login", resetDashboardCache);
    return () => {
      window.removeEventListener("apollosms-user-cache-cleared", resetDashboardCache);
      window.removeEventListener("apollosms-login", resetDashboardCache);
    };
  }, [queryClient]);

  // Listen for sidebar's "open-templates" event
  useEffect(() => {
    const handler = () => setShowTemplates(true);
    window.addEventListener("open-templates", handler);
    return () => window.removeEventListener("open-templates", handler);
  }, []);

  // Auto-cycle chart type every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setChartType((prev) => (prev === "area" ? "bar" : "area"));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
      <SEO title="Dashboard" />
      <AppHeader onCreateForm={createForm} />

      <main className="max-w-screen mx-auto px-4 sm:px-6 py-4">
        {/* form */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">Dashboard</h2>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[130px] h-9 text-xs bg-background">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleRefresh}
                className="gap-1.5 h-9 px-3 flex items-center text-xs"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-card border border-primary/40 rounded p-5 flex flex-col justify-between text-left h-full w-full relative shadow-[0_0_10px_hsl(var(--primary)/0.03)] overflow-hidden">
              {/* Corner circle overlay */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-foreground/5 rounded-full pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-foreground/5 rounded-full pointer-events-none" />

              <div className="flex flex-col gap-4 relative z-10">
                <div className="w-10 h-10 rounded bg-muted/50 border border-border/20 flex items-center justify-center shrink-0">
                  <Boxes className="w-5 h-5 text-foreground/70" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground block">SMS Success</span>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-baseline gap-1.5">
                      <h3 className="text-2xl font-black text-foreground tracking-tight">{successCount.toLocaleString()}</h3>
                      <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-0.5" title="Delivery rate">
                        <ArrowUpRight className="w-3.5 h-3.5" /> {deliveryRate.toFixed(1)}%
                      </span>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-full font-bold text-[10px] px-2.5 py-0 hover:bg-emerald-500/15">
                      Success
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-primary/40 rounded p-5 flex flex-col justify-between text-left h-full w-full relative shadow-[0_0_10px_hsl(var(--primary)/0.03)] overflow-hidden">
              {/* Corner circle overlay */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-foreground/5 rounded-full pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-foreground/5 rounded-full pointer-events-none" />

              <div className="flex flex-col gap-4 relative z-10">
                <div className="w-10 h-10 rounded bg-muted/50 border border-border/20 flex items-center justify-center shrink-0">
                  <Inbox className="w-5 h-5 text-foreground/70" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground block">Enqueued</span>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-baseline gap-1.5">
                      <h3 className="text-2xl font-black text-foreground tracking-tight">{queuedCount.toLocaleString()}</h3>
                      <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-0.5">
                        Stable
                      </span>
                    </div>
                    <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full font-bold text-[10px] px-2.5 py-0 hover:bg-amber-500/15">
                      Enqueued
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-card border border-primary/40 rounded p-6 flex flex-col justify-between text-left h-full w-full relative overflow-hidden shadow-[0_0_10px_hsl(var(--primary)/0.03)]">
              {/* Corner circle overlay */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-foreground/5 rounded-full pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-foreground/5 rounded-full pointer-events-none" />

              <div className="flex flex-col gap-4 relative z-10">
                <div className="w-10 h-10 rounded bg-muted/50 border border-border/20 flex items-center justify-center shrink-0">
                  <BrushIcon className="w-5 h-5 text-foreground/70" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground block">Total Sent SMS</span>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-none">{totalSent.toLocaleString()} messages sent in the selected range</p>
                  <div className="flex justify-end space-x-2 gap-1 mt-3.5">
                    <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/15 rounded-full text-[10px] px-2 py-0">{successCount.toLocaleString()} Successful</Badge>
                    <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/15 rounded-full text-[10px] px-2 py-0 font-bold">{failedCount.toLocaleString()} Failed</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 mt-6">
          {/* Left: Chart Card */}
          <Card className="lg:col-span-2 bg-card border border-rose-200/40 shadow-none rounded">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    SMS Delivery Analytics
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Delivered vs. failed messages over the last 7 days
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-[10px] sm:text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    Delivered
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Failed
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-64 pt-4">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  {smsError ? "Unable to load SMS analytics." : isSmsLoading ? "Loading SMS analytics..." : "No SMS analytics available."}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "area" ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "11px",
                          color: "hsl(var(--foreground))"
                        }}
                      />
                      <Area type="monotone" dataKey="delivered" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorDelivered)" />
                      <Area type="monotone" dataKey="failed" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorFailed)" />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorBarDelivered" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="colorBarFailed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "11px",
                          color: "hsl(var(--foreground))"
                        }}
                      />
                      <Bar dataKey="delivered" fill="url(#colorBarDelivered)" radius={[4, 4, 0, 0]} barSize={18} />
                      <Bar dataKey="failed" fill="url(#colorBarFailed)" radius={[4, 4, 0, 0]} barSize={18} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Right: Heatmap Card */}
          <Card className="bg-card border border-emerald-200/40 shadow-none rounded">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                Track SMS Activity
              </CardTitle>
              <CardDescription className="text-xs">
                Message sending activity over the last 12 weeks (7 days per week)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex flex-col gap-4">
                {/* Heatmap Grid */}
                <div className="grid grid-cols-12 gap-1.5 mt-2 select-none">
                  {heatmapData.length === 0 && (
                    <div className="col-span-12 text-center text-xs text-muted-foreground py-8">
                      {smsError ? "Unable to load activity." : isSmsLoading ? "Loading activity..." : "No activity yet."}
                    </div>
                  )}
                  {heatmapData.map((cell) => {
                    let colorClass = "bg-muted/30";
                    if (cell.level === 1) colorClass = "bg-emerald-500/20 dark:bg-emerald-500/10";
                    else if (cell.level === 2) colorClass = "bg-emerald-500/40 dark:bg-emerald-500/25";
                    else if (cell.level === 3) colorClass = "bg-emerald-500/70 dark:bg-emerald-500/50";
                    else if (cell.level === 4) colorClass = "bg-emerald-500 dark:bg-emerald-500/85";
                    return (
                      <div
                        key={cell.day}
                        className={`aspect-square w-full rounded-[2px] transition-all hover:scale-125 hover:shadow-sm cursor-pointer ${colorClass}`}
                        title={`${cell.count} messages dispatched`}
                      />
                    );
                  })}
                </div>

                {/* Heatmap Legend */}
                <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1">
                  <span>Less active</span>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-muted/30" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500/20" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500/40" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500/70" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500" />
                  </div>
                  <span>More active</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Sent Messages Section */}
        <Card className="bg-card border border-primary/30 shadow-none mb-8 rounded">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                Recent Sent Messages
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time log of sent SMS messages and delivery statuses
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/recents-sms")}
              className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1 p-0 h-auto"
            >
              View Registry <ExternalLink className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-5 flex-1 flex flex-col justify-between">
            <div className="overflow-x-auto rounded border border-border/10">
              <Table>
                <TableHeader className="bg-muted/40 font-semibold">
                  <TableRow>
                    <TableHead className="w-[140px] text-xs">Message ID</TableHead>
                    <TableHead className="text-xs">Recipient</TableHead>
                    <TableHead className="text-xs">Message Content</TableHead>
                    <TableHead className="text-xs">Unit</TableHead>
                    <TableHead className="text-xs">Sent Time</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSentMessages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground truncate">
                        {smsError ? "Unable to load recent messages." : isSmsLoading ? "Loading recent messages..." : "No recent sent messages."}
                      </TableCell>
                    </TableRow>
                  ) : recentSentMessages.map((msg) => (
                    <TableRow
                      key={msg.id}
                      className="cursor-pointer hover:bg-muted/30 group transition-colors truncate"
                      onClick={() => copyMessageId(msg.id)}
                    >
                      <TableCell className="font-mono text-xs font-semibold text-primary">{msg.id}</TableCell>
                      <TableCell className="text-xs font-semibold">
                        <div>{msg.phone}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium max-w-[200px] truncate" title={msg.message}>
                        {msg.message}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-foreground">{msg.cost}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">
                        {new Date(msg.sentTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge className={cn("text-[10px] px-2 py-0 border-none font-semibold rounded-full", getMessageStatusBadgeClass(msg.status))}>
                          {msg.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

    </div>
  );
}
