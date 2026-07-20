import { renultApi, SmsMessageResponse } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
    AlertCircle,
    ArrowUpRight,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    ExternalLink,
    History,
    Loader2,
    MessageSquare,
    Plus,
    RefreshCcw,
    Send,
    Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// Interfaces
interface SmsRecord {
    id: string;
    recipientName: string;
    phone: string;
    message: string;
    senderId: string;
    sentAt: string;
    status: "Delivered" | "Sent" | "Failed";
    cost: number; // in UGX
    segments: number;
    failReason?: string;
}

interface QueuedSms {
    id: string;
    recipientName: string;
    phone: string;
    message: string;
    senderId: string;
    scheduledFor: string;
    status: "Pending" | "Sending" | "Scheduled";
    cost: number;
    segments: number;
}

// Relative Date Generator Helpers
const getRelativeDateTimeString = (daysAgo: number, hoursAgo: number, minutesAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(date.getHours() - hoursAgo);
    date.setMinutes(date.getMinutes() - minutesAgo);
    return date.toISOString().replace("T", " ").slice(0, 19);
};

// Input DateTime Auto-Formatter (YYYY-MM-DD HH:MM:SS)
const formatDateTimeInput = (value: string) => {
    // Strip all non-digits
    const digits = value.replace(/\D/g, "");
    let formatted = "";
    
    if (digits.length > 0) {
        formatted += digits.substring(0, 4);
    }
    if (digits.length >= 5) {
        formatted += "-" + digits.substring(4, 6);
    }
    if (digits.length >= 7) {
        formatted += "-" + digits.substring(6, 8);
    }
    if (digits.length >= 9) {
        formatted += " " + digits.substring(8, 10);
    }
    if (digits.length >= 11) {
        formatted += ":" + digits.substring(10, 12);
    }
    if (digits.length >= 13) {
        formatted += ":" + digits.substring(12, 14);
    }
    return formatted;
};

const toHistoryRecord = (message: SmsMessageResponse): SmsRecord => ({
    id: message.id,
    recipientName: message.recipientName || message.recipient_name || "Unknown recipient",
    phone: message.phone,
    message: message.message,
    senderId: message.senderId || message.sender_id || "Default",
    sentAt: message.sentAt || message.sent_at || "",
    status: ["Delivered", "Sent", "Failed"].includes(message.status) ? message.status as SmsRecord["status"] : "Sent",
    cost: message.cost ?? 0,
    segments: message.segments ?? 1,
    failReason: message.failReason || message.fail_reason || undefined,
});

const toQueuedRecord = (message: SmsMessageResponse): QueuedSms => ({
    id: message.id,
    recipientName: message.recipientName || message.recipient_name || "Unknown recipient",
    phone: message.phone,
    message: message.message,
    senderId: message.senderId || message.sender_id || "Default",
    scheduledFor: message.scheduledFor || message.scheduled_for || "Immediate",
    status: ["Pending", "Sending", "Scheduled"].includes(message.status) ? message.status as QueuedSms["status"] : "Pending",
    cost: message.cost ?? 0,
    segments: message.segments ?? 1,
});

export default function SalesIndex() {
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    // Main UI Tabs: "history" | "queue"
    const [activeTab, setActiveTab] = useState<"history" | "queue">("history");

    const [history, setHistory] = useState<SmsRecord[]>([]);
    const [queue, setQueue] = useState<QueuedSms[]>([]);
    const [loadError, setLoadError] = useState("");
    const [isLoadingLogs, setIsLoadingLogs] = useState(true);

    // Search and Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [senderFilter, setSenderFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;

    // Interactive Modal States
    const [selectedMessage, setSelectedMessage] = useState<SmsRecord | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    // Cancel Queue states
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [cancelId, setCancelId] = useState<string | null>(null);

    // Reschedule Queue states
    const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
    const [rescheduleId, setRescheduleId] = useState<string | null>(null);
    const [newScheduleTime, setNewScheduleTime] = useState("");

    const [isRefreshing, setIsRefreshing] = useState(false);
    const loadLogs = async (showToast = false) => {
        setLoadError("");
        setIsLoadingLogs(true);
        setIsRefreshing(true);
        try {
            const [historyData, queueData] = await Promise.all([
                renultApi.sms.history({ limit: 200 }),
                renultApi.sms.queue({ limit: 200 }),
            ]);
            setHistory(historyData.map(toHistoryRecord));
            setQueue(queueData.map(toQueuedRecord));
            if (showToast) toast.success("SMS history and outbox data synchronized successfully.");
        } catch (error) {
            setHistory([]);
            setQueue([]);
            const message = error instanceof Error ? error.message : "Unable to load SMS data";
            setLoadError(message);
            if (showToast) toast.error(message);
        } finally {
            setIsLoadingLogs(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, []);

    const handleRefresh = () => loadLogs(true);

    // Calculate dates for matching
    const todayStr = getRelativeDateTimeString(0, 0, 0).slice(0, 10);
    const yesterdayStr = getRelativeDateTimeString(1, 0, 0).slice(0, 10);

    const getMsAgo = (days: number) => days * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    const isDateToday = (dStr: string) => dStr.startsWith(todayStr);
    const isDateYesterday = (dStr: string) => dStr.startsWith(yesterdayStr);
    const isDateThisWeek = (dStr: string) => {
        const d = new Date(dStr).getTime();
        return nowMs - d <= getMsAgo(7);
    };
    const isDateThisMonth = (dStr: string) => {
        const d = new Date(dStr).getTime();
        return nowMs - d <= getMsAgo(30);
    };

    // Dynamic KPI calculations
    const kpis = useMemo(() => {
        const delivered = history.filter(h => h.status === "Delivered" || h.status === "Sent").length;
        const failed = history.filter(h => h.status === "Failed").length;
        const totalAttempted = history.length;
        const rate = totalAttempted > 0 ? ((delivered / totalAttempted) * 100).toFixed(1) : "100.0";

        return {
            totalDispatched: history.filter(h => h.status !== "Failed").length,
            deliveryRate: `${rate}%`,
            failedCount: failed,
            queueCount: queue.length
        };
    }, [history, queue]);

    // Handle History Filtering
    const filteredHistory = useMemo(() => {
        return history.filter(record => {
            // Status Filter
            if (statusFilter !== "all" && record.status.toLowerCase() !== statusFilter.toLowerCase()) {
                return false;
            }
            // Sender ID Filter
            if (senderFilter !== "all" && record.senderId !== senderFilter) {
                return false;
            }
            // Date Filter
            if (dateFilter === "today" && !isDateToday(record.sentAt)) return false;
            if (dateFilter === "yesterday" && !isDateYesterday(record.sentAt)) return false;
            if (dateFilter === "week" && !isDateThisWeek(record.sentAt)) return false;
            if (dateFilter === "month" && !isDateThisMonth(record.sentAt)) return false;

            // Search Query (Name, Phone, Message)
            if (searchQuery.trim() !== "") {
                const q = searchQuery.toLowerCase();
                const nameMatch = record.recipientName.toLowerCase().includes(q);
                const phoneMatch = record.phone.toLowerCase().includes(q);
                const messageMatch = record.message.toLowerCase().includes(q);
                if (!nameMatch && !phoneMatch && !messageMatch) return false;
            }

            return true;
        });
    }, [history, statusFilter, senderFilter, dateFilter, searchQuery]);

    // Handle Queue Filtering
    const filteredQueue = useMemo(() => {
        return queue.filter(record => {
            // Status Filter
            if (statusFilter !== "all" && record.status.toLowerCase() !== statusFilter.toLowerCase()) {
                return false;
            }
            // Sender ID Filter
            if (senderFilter !== "all" && record.senderId !== senderFilter) {
                return false;
            }

            // Search Query
            if (searchQuery.trim() !== "") {
                const q = searchQuery.toLowerCase();
                const nameMatch = record.recipientName.toLowerCase().includes(q);
                const phoneMatch = record.phone.toLowerCase().includes(q);
                const messageMatch = record.message.toLowerCase().includes(q);
                if (!nameMatch && !phoneMatch && !messageMatch) return false;
            }

            return true;
        });
    }, [queue, statusFilter, senderFilter, searchQuery]);

    // Paginated list based on active tab
    const paginatedRecords = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const source = activeTab === "history" ? filteredHistory : filteredQueue;
        return source.slice(startIndex, startIndex + itemsPerPage);
    }, [activeTab, filteredHistory, filteredQueue, currentPage]);

    const totalPages = useMemo(() => {
        const source = activeTab === "history" ? filteredHistory : filteredQueue;
        return Math.max(1, Math.ceil(source.length / itemsPerPage));
    }, [activeTab, filteredHistory, filteredQueue]);

    const senderIds = useMemo(() => {
        return Array.from(new Set([...history, ...queue].map((record) => record.senderId).filter(Boolean))).sort();
    }, [history, queue]);

    // Reset pagination on tab change or filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchQuery, statusFilter, senderFilter, dateFilter]);

    // Actions
    const handleResend = (record: SmsRecord | QueuedSms) => {
        navigate("/compose", {
            state: {
                initialRecipient: record.phone,
                initialText: record.message
            }
        });
        toast.info("Transferred recipient and text to compose page.");
    };

    const triggerCancelQueue = (id: string) => {
        setCancelId(id);
        setIsCancelDialogOpen(true);
    };

    const confirmCancelQueue = async () => {
        if (!cancelId) return;
        try {
            await renultApi.sms.cancelQueued(cancelId);
            setQueue(prev => prev.filter(q => q.id !== cancelId));
            setIsCancelDialogOpen(false);
            setCancelId(null);
            toast.success("Outbox message transmission canceled successfully.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to cancel queued message");
        }
    };

    const triggerReschedule = (id: string) => {
        const target = queue.find(q => q.id === id);
        if (!target) return;
        setRescheduleId(id);
        setNewScheduleTime(target.scheduledFor === "Immediate" ? "" : target.scheduledFor);
        setIsRescheduleOpen(true);
    };

    const confirmReschedule = async () => {
        if (!rescheduleId) return;
        const timeVal = newScheduleTime.trim() || "Immediate";
        try {
            const updated = await renultApi.sms.rescheduleQueued(rescheduleId, timeVal === "Immediate" ? null : timeVal);
            setQueue(prev => prev.map(q => q.id === rescheduleId ? toQueuedRecord(updated) : q));
            setIsRescheduleOpen(false);
            setRescheduleId(null);
            toast.success(`Message scheduled delivery updated to: ${timeVal}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to reschedule message");
        }
    };

    const handleSendNow = async (id: string) => {
        const target = queue.find(q => q.id === id);
        if (!target) return;

        setQueue(prev => prev.map(q => q.id === id ? { ...q, status: "Sending" } : q));
        toast.info("Initiating immediate SMS routing...");
        try {
            const sent = await renultApi.sms.sendQueuedNow(id);
            setQueue(prev => prev.filter(q => q.id !== id));
            setHistory(prev => [toHistoryRecord(sent), ...prev]);
            toast.success(`Message successfully dispatched to ${target.phone}`);
        } catch (error) {
            setQueue(prev => prev.map(q => q.id === id ? { ...q, status: target.status } : q));
            toast.error(error instanceof Error ? error.message : "Unable to dispatch queued message");
        }
    };

    // UI Helpers
    const getStatusBadge = (status: SmsRecord['status'] | QueuedSms['status']) => {
        switch (status) {
            case "Delivered":
                return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-bold">Delivered</Badge>;
            case "Sent":
                return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 font-bold">Sent</Badge>;
            case "Failed":
                return <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/20 font-bold">Failed</Badge>;
            case "Pending":
                return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 font-bold">Pending</Badge>;
            case "Sending":
                return (
                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20 font-bold flex items-center gap-1 w-max">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Sending
                    </Badge>
                );
            case "Scheduled":
                return <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 font-bold">Scheduled</Badge>;
        }
    };

    const handleCopyText = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Message content copied to clipboard.");
    };

    return (
        <div className={cn(
            "min-h-screen bg-background transition-all duration-300",
            sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
        )}>
            <SEO title="SMS History & Outbox" />
            <AppHeader />

            <main className="max-w-8xl mx-auto px-4 sm:px-6 py-6">
                {/* Page Title */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2 pb-2">
                    <div>
                        {/* <h1 className="text-base font-black tracking-tight text-foreground sm:text-base">
                            SMS History & Outbox
                        </h1> */}
                        <p className="text-xs text-muted-foreground mt-1">
                            Review detailed SMS logs, audit delivery rates, and control pending broadcasts.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="text-xs font-semibold h-9 rounded flex items-center gap-1.5 border-border/80"
                        >
                            {isRefreshing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <RefreshCcw className="w-3.5 h-3.5" />
                            )}
                            Sync Logs
                        </Button>
                    </div>
                </div>

                {/* Tabs & Table */}
                <div className="space-y-4">
                    {/* Tab Selection Row */}
                    <div className="flex border-b border-border/50 pb-px">
                        <button
                            onClick={() => { setActiveTab("history"); setStatusFilter("all"); }}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all duration-150 -mb-px",
                                activeTab === "history"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <History className="w-3.5 h-3.5" />
                            Recent History
                            <span className="ml-1 bg-muted px-1.5 py-0.5 rounded text-[10px] text-muted-foreground  font-semibold">
                                {filteredHistory.length}
                            </span>
                        </button>
                        <button
                            onClick={() => { setActiveTab("queue"); setStatusFilter("all"); }}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all duration-150 -mb-px",
                                activeTab === "queue"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Clock className="w-3.5 h-3.5" />
                            Outbox Queue
                            {queue.length > 0 && (
                                <span className="ml-1 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] text-amber-500  font-bold">
                                    {queue.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Data Display Card */}
                    <Card className="border border-border/10 shadow-none rounded">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-bold tracking-tight text-foreground">
                                    {activeTab === "history" ? "SMS Transmission Records" : "Outbound Queue"}
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                                    {activeTab === "history"
                                        ? "List of recently processed transmissions. Click on any record to view details or resend."
                                        : "SMS broadcasts queued for dispatch or scheduled for future delivery."}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6 sm:pt-0">
                            <div className="overflow-x-auto border-y sm:border border-border/10 sm:rounded">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead className="w-[50px] font-bold text-xs  text-foreground">#</TableHead>
                                            <TableHead className="font-bold text-xs  text-foreground">Recipient</TableHead>
                                            <TableHead className="font-bold text-xs truncate  text-foreground">Sender ID</TableHead>
                                            <TableHead className="font-bold text-xs  text-foreground w-[40%]">Message</TableHead>
                                            <TableHead className="font-bold text-xs  text-foreground">
                                                {activeTab === "history" ? "Sent At" : "Scheduled For"}
                                            </TableHead>
                                            <TableHead className="font-bold text-xs  text-foreground text-center">Cost</TableHead>
                                            <TableHead className="font-bold text-xs  text-foreground text-center">Status</TableHead>
                                            <TableHead className="font-bold text-xs  text-foreground text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoadingLogs ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-44 text-center">
                                                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                        <Loader2 className="w-8 h-8 mb-2 animate-spin text-primary/70" />
                                                        <span className="text-sm font-bold text-foreground">Loading SMS records</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : paginatedRecords.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-44 text-center">
                                                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                        <MessageSquare className="w-10 h-10 mb-2 stroke-[1.2] text-muted-foreground/60" />
                                                        <span className="text-sm font-bold text-foreground">{loadError ? "Unable to load SMS records" : "No records found"}</span>
                                                        <span className="text-xs mt-0.5">{loadError || "There are no messages matching the active filter parameters."}</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedRecords.map((record, index) => {
                                                const serialNum = (currentPage - 1) * itemsPerPage + index + 1;
                                                return (
                                                    <TableRow
                                                        key={record.id}
                                                        className="hover:bg-muted/20 transition-colors"
                                                    >
                                                        <TableCell className=" text-xs font-semibold text-muted-foreground">{serialNum}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                {/* <span className="text-xs font-bold text-foreground">{record.recipientName}</span> */}
                                                                <span className="text-xs  text-muted-foreground mt-0.5">{record.phone}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="destructive" className="text-[10px]  font-semibold py-0 px-2 rounded-full">
                                                                {record.senderId}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-xs font-normal text-foreground max-w-[280px]">
                                                            <div className="truncate" title={record.message}>
                                                                {record.message}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-xs truncate  text-muted-foreground">
                                                            {activeTab === "history"
                                                                ? (record as SmsRecord).sentAt
                                                                : (record as QueuedSms).scheduledFor === "Immediate"
                                                                    ? "Immediate"
                                                                    : (record as QueuedSms).scheduledFor}
                                                        </TableCell>
                                                        <TableCell className="text-center truncate  text-xs font-bold text-foreground">
                                                            {record.cost > 0 ? `${record.cost} UGX` : "Free"}
                                                        </TableCell>
                                                        <TableCell className="text-center">{getStatusBadge(record.status)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {activeTab === "history" ? (
                                                                    <>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            title="View details"
                                                                            onClick={() => {
                                                                                setSelectedMessage(record as SmsRecord);
                                                                                setIsDetailsOpen(true);
                                                                            }}
                                                                            className="w-7 h-7 hover:text-primary rounded-full"
                                                                        >
                                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            title="Resend SMS"
                                                                            onClick={() => handleResend(record)}
                                                                            className="w-7 h-7 hover:text-primary rounded-full"
                                                                        >
                                                                            <Send className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        {record.status !== "Sending" && (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                title="Dispatch Now"
                                                                                onClick={() => handleSendNow(record.id)}
                                                                                className="w-7 h-7 text-emerald-300 hover:text-emerald-400 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-normal"
                                                                            >
                                                                                <ArrowUpRight className="w-3.5 h-3.5" />
                                                                            </Button>
                                                                        )}
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            title="Reschedule delivery"
                                                                            onClick={() => triggerReschedule(record.id)}
                                                                            className="w-7 h-7 hover:text-primary rounded-full"
                                                                        >
                                                                            <Calendar className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            title="Cancel message"
                                                                            onClick={() => triggerCancelQueue(record.id)}
                                                                            className="w-7 h-7 text-rose-500 hover:text-rose-600 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-4 px-4 sm:px-0">
                                    <span className="text-xs text-muted-foreground font-medium">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="w-8 h-8 rounded border-border/80"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                            <Button
                                                key={p}
                                                variant={currentPage === p ? "default" : "outline"}
                                                size="icon"
                                                onClick={() => setCurrentPage(p)}
                                                className={cn("w-8 h-8 rounded text-xs font-bold", currentPage === p ? "bg-primary" : "border-border/80")}
                                            >
                                                {p}
                                            </Button>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="w-8 h-8 rounded border-border/80"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>

            {/* --- DIALOG MODALS --- */}

            {/* 1. Message Details Panel */}
            <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <SheetContent className="sm:max-w-md w-full bg-card border-l border-border/60 p-6 overflow-y-auto">
                    <SheetHeader className="pb-3 border-b border-border/40">
                        <SheetTitle className="text-base font-bold text-foreground flex items-center gap-2">
                            Message Transmission Audit
                        </SheetTitle>
                    </SheetHeader>

                    {selectedMessage && (
                        <div className="space-y-4 py-3 text-xs">
                            {/* Status and ID */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-muted-foreground block text-[10px]  font-bold ">SMS Reference ID</span>
                                    <span className=" font-bold text-foreground">{selectedMessage.id}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px]  font-bold  text-right mb-0.5">Status</span>
                                    {getStatusBadge(selectedMessage.status)}
                                </div>
                            </div>

                            {/* Recipient Details */}
                            <div className="p-3 bg-muted/20 border border-border/40 rounded">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-muted-foreground block text-[11px]  font-bold  mb-0.5">Recipient Name</span>
                                        <span className="font-bold text-foreground">{selectedMessage.recipientName}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]  font-bold  mb-0.5">Phone Number</span>
                                        <span className=" font-bold text-foreground">{selectedMessage.phone}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Message content */}
                            <div className="space-y-1">
                                <span className="text-muted-foreground block text-[10px]  font-bold ">SMS Content</span>
                                <div className="p-3 bg-primary/20 border border-primary/60 rounded leading-relaxed break-words relative group">
                                    {selectedMessage.message}
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => handleCopyText(selectedMessage.message)}
                                        className="h-6 w-6 absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity border-border/80"
                                        title="Copy message content"
                                    >
                                        <Copy className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>

                            {/* Audit metrics */}
                            <div className="grid grid-cols-3 gap-3 text-center border-t border-border/20 pt-3">
                                <div>
                                    <span className="text-muted-foreground block text-[10px]  font-bold  mb-0.5">Sender ID</span>
                                    <span className="font-bold text-foreground ">{selectedMessage.senderId}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px]  font-bold  mb-0.5">Billing cost</span>
                                    <span className="font-bold text-foreground ">{selectedMessage.cost} UGX</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px]  font-bold  mb-0.5">Segments</span>
                                    <span className="font-bold text-foreground ">{selectedMessage.segments} SMS</span>
                                </div>
                            </div>

                            {/* Time sent */}
                            <div className="flex items-center justify-between border-t border-border/20 pt-3 text-muted-foreground">
                                <span>Sent Timestamp:</span>
                                <span className=" font-bold text-foreground/80">{selectedMessage.sentAt}</span>
                            </div>

                            {/* Fail reason if failed */}
                            {selectedMessage.status === "Failed" && selectedMessage.failReason && (
                                <div className="p-3 bg-rose-500/5 border border-rose-500/15 rounded text-rose-500 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Transmission Failure Cause:</p>
                                        <p className="mt-0.5 leading-normal">{selectedMessage.failReason}</p>
                                    </div>
                                </div>
                            )}

                            {/* Panel actions */}
                            <SheetFooter className="pt-4 border-t border-border/40 gap-2 sm:gap-0">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsDetailsOpen(false)}
                                    className="font-semibold text-xs h-9 rounded"
                                >
                                    Close
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        setIsDetailsOpen(false);
                                        handleResend(selectedMessage);
                                    }}
                                    className="font-semibold text-xs h-9 rounded shadow-sm flex items-center gap-1"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Resend Message
                                </Button>
                            </SheetFooter>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* 2. Cancel Queue Dialog */}
            <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <DialogContent className="sm:max-w-md w-full bg-card border border-border/60 rounded p-6">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-foreground">Cancel Outbound Message</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-1">
                            Are you sure you want to cancel this outbound transmission? It will be permanently removed from the gateway queue.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="pt-4 gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsCancelDialogOpen(false)}
                            className="font-semibold text-xs h-9 rounded"
                        >
                            No, Keep
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmCancelQueue}
                            className="font-semibold text-xs h-9 rounded shadow-sm"
                        >
                            Yes, Cancel SMS
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 3. Reschedule Queue Dialog */}
            <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
                <DialogContent className="sm:max-w-md w-full bg-card border border-border/60 rounded p-6">
                    <DialogHeader className="pb-3 border-b border-border/40">
                        <DialogTitle className="text-base font-bold text-foreground">Reschedule Delivery</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-3 text-xs">
                        <div className="space-y-1.5">
                            <Label htmlFor="reschedTime" className="text-xs font-semibold text-foreground">Scheduled Date & Time</Label>
                            <Input
                                id="reschedTime"
                                type="text"
                                placeholder="YYYY-MM-DD HH:MM:SS (or empty for Immediate)"
                                value={newScheduleTime}
                                onChange={(e) => {
                                    const formatted = formatDateTimeInput(e.target.value);
                                    setNewScheduleTime(formatted);
                                }}
                                className="h-9 text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                                Input format must follow <b>YYYY-MM-DD HH:MM:SS</b>. Leaving it blank sets the dispatch priority to immediate.
                            </p>
                        </div>

                        <DialogFooter className="pt-4 border-t border-border/40 gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsRescheduleOpen(false)}
                                className="font-semibold text-xs h-9 rounded"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={confirmReschedule}
                                className="font-semibold text-xs h-9 rounded shadow-sm"
                            >
                                Save Schedule
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
