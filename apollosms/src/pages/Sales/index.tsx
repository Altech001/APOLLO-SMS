/* eslint-disable @typescript-eslint/no-explicit-any */
import { apollosmsApi, renultApi, SmsMessageResponse, WhatsAppAccountResponse, WhatsAppMessageRecord } from "@/api/apollosms";
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
import { Skeleton } from "@/components/ui/skeleton";
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
    MessageCircle,
    MessageSquare,
    Plus,
    RefreshCcw,
    Send,
    Trash2
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
    channel: "sms" | "whatsapp";
}

interface QueuedSms {
    id: string;
    recipientName: string;
    phone: string;
    message: string;
    senderId: string;
    scheduledFor: string;
    status: "Pending" | "Sending" | "Scheduled" | "Queued";
    cost: number;
    segments: number;
    channel: "sms" | "whatsapp";
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
    channel: "sms",
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
    channel: "sms",
});

// WhatsApp records share the table with SMS; their IDs are prefixed so they never collide.
const WHATSAPP_ID_PREFIX = "wa-";
const WHATSAPP_HISTORY_STATUSES = new Set(["sent", "failed", "cancelled"]);

const whatsAppSender = (accounts: WhatsAppAccountResponse[], accountId: WhatsAppMessageRecord["account_id"]) => {
    const account = accounts.find((item) => String(item.id) === String(accountId));
    return account?.phone_number ? `+${account.phone_number}` : "WhatsApp";
};

const formatWhatsAppRecipient = (recipient: string) => (/^\d+$/.test(recipient) ? `+${recipient}` : recipient);

const toWhatsAppHistoryRecord = (message: WhatsAppMessageRecord, accounts: WhatsAppAccountResponse[]): SmsRecord => ({
    id: `${WHATSAPP_ID_PREFIX}${message.id}`,
    recipientName: "WhatsApp contact",
    phone: formatWhatsAppRecipient(message.recipient),
    message: message.body,
    senderId: whatsAppSender(accounts, message.account_id),
    sentAt: message.sent_at || message.created_at,
    status: message.status === "sent" ? "Sent" : "Failed",
    cost: message.charged_from === "credit" ? 1 : 0,
    segments: 1,
    failReason: message.error || undefined,
    channel: "whatsapp",
});

const toWhatsAppQueuedRecord = (message: WhatsAppMessageRecord, accounts: WhatsAppAccountResponse[]): QueuedSms => ({
    id: `${WHATSAPP_ID_PREFIX}${message.id}`,
    recipientName: "WhatsApp contact",
    phone: formatWhatsAppRecipient(message.recipient),
    message: message.body,
    senderId: whatsAppSender(accounts, message.account_id),
    scheduledFor: message.created_at,
    status: message.status === "sending" ? "Sending" : "Queued",
    cost: message.charged_from === "credit" ? 1 : 0,
    segments: 1,
    channel: "whatsapp",
});

// Shows ISO timestamps as local "YYYY-MM-DD HH:MM"; leaves anything unparseable as-is.
const formatLogTime = (value: string) => {
    const time = Date.parse(value);
    if (!value || Number.isNaN(time)) return value;
    const d = new Date(time);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const recordTime = (value: string) => {
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
};

type SmsLogsCache = {
    history: SmsRecord[];
    queue: QueuedSms[];
    whatsAppQueue: QueuedSms[];
};

type LogsTab = "history" | "whatsapp" | "queue";
const LOGS_TABS: LogsTab[] = ["history", "whatsapp", "queue"];

const SMS_LOGS_CACHE_TIME = 30 * 60 * 1000;
const SMS_LOGS_STALE_TIME = 2 * 60 * 1000;
const PDF_EXPORT_LIMIT = 10000;

const escapeHtml = (value: string | number | null | undefined) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const reportDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "-";
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

const buildSmsLogsReportHtml = (records: SmsRecord[], generatedBy?: string) => {
    const generatedAt = new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date());
    const siteUrl = window.location.origin;
    const logoUrl = new URL("/logo.png", window.location.origin).toString();
    const delivered = records.filter((record) => record.status === "Delivered" || record.status === "Sent").length;
    const failed = records.filter((record) => record.status === "Failed").length;
    const segments = records.reduce((sum, record) => sum + (record.segments || 0), 0);

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Luco-SMS Sent Messages Report</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Inter, Arial, sans-serif; font-size: 11px; line-height: 1.45; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #111827; }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .logo { width: 42px; height: 42px; object-fit: contain; border-radius: 8px; border: 1px solid #e5e7eb; }
    h1 { margin: 0; font-size: 18px; letter-spacing: 0; }
    .muted { color: #6b7280; }
    .refs { text-align: right; font-size: 10px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
    .metric { border: 1px solid #e5e7eb; border-radius: 6px; padding: 9px; }
    .metric span { display: block; color: #6b7280; font-size: 9px; text-transform: uppercase; font-weight: 700; }
    .metric strong { display: block; margin-top: 3px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 7px 6px; text-align: left; font-size: 9px; text-transform: uppercase; }
    td { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; word-wrap: break-word; }
    tr { break-inside: avoid; }
    .num { width: 34px; text-align: center; }
    .phone { width: 98px; }
    .status { width: 70px; font-weight: 700; }
    .date { width: 112px; }
    .units { width: 48px; text-align: center; }
    .message { white-space: pre-wrap; }
    .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; display: flex; justify-content: space-between; gap: 12px; }
    @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img class="logo" src="${logoUrl}" alt="Luco-SMS logo" />
      <div>
        <h1>Luco-SMS Sent Messages Report</h1>
        <div class="muted">All sent-message records exported from the database</div>
      </div>
    </div>
    <div class="refs">
      <div><strong>Site:</strong> ${escapeHtml(siteUrl)}</div>
      <div><strong>API:</strong> ${escapeHtml(renultApi.baseUrl)}</div>
      <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
      <div><strong>By:</strong> ${escapeHtml(generatedBy || "Current user")}</div>
    </div>
  </div>

  <div class="summary">
    <div class="metric"><span>Total messages</span><strong>${records.length.toLocaleString()}</strong></div>
    <div class="metric"><span>Delivered / sent</span><strong>${delivered.toLocaleString()}</strong></div>
    <div class="metric"><span>Failed</span><strong>${failed.toLocaleString()}</strong></div>
    <div class="metric"><span>SMS units</span><strong>${segments.toLocaleString()}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th class="phone">Phone</th>
        <th>Message</th>
        <th class="status">Status</th>
        <th class="units">Units</th>
        <th class="date">Sent at</th>
      </tr>
    </thead>
    <tbody>
      ${records.map((record, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td class="phone">${escapeHtml(record.phone)}</td>
          <td class="message">${escapeHtml(record.message)}</td>
          <td class="status">${escapeHtml(record.status)}</td>
          <td class="units">${escapeHtml(record.segments)}</td>
          <td class="date">${escapeHtml(reportDate(record.sentAt))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="footer">
    <span>Luco-SMS | ${escapeHtml(siteUrl)}</span>
    <span>Reference export from database records</span>
  </div>
</body>
</html>`;
};

export default function SalesIndex() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    // Main UI Tabs, kept in the URL (?tab=whatsapp) so other pages can link straight to a tab.
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get("tab") as LogsTab | null;
    const activeTab: LogsTab = tabParam && LOGS_TABS.includes(tabParam) ? tabParam : "history";
    const setActiveTab = (tab: LogsTab) => {
        setSearchParams(tab === "history" ? {} : { tab }, { replace: true });
    };
    const [channelFilter, setChannelFilter] = useState<"all" | "sms" | "whatsapp">("all");

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
    const [isPrintingLogs, setIsPrintingLogs] = useState(false);

    const smsLogsQueryKey = useMemo(() => ["sms", "logs", user?.id || "anonymous"] as const, [user?.id]);
    const {
        data: smsLogs = { history: [], queue: [], whatsAppQueue: [] },
        error: logsError,
        isLoading: isLoadingLogs,
        isFetching: isFetchingLogs,
        refetch: refetchLogs,
    } = useQuery<SmsLogsCache>({
        queryKey: smsLogsQueryKey,
        queryFn: async () => {
            // WhatsApp is optional here: if it fails, SMS history still loads.
            const [historyData, queueData, whatsAppMessages, whatsAppAccounts] = await Promise.all([
                renultApi.sms.history({ limit: 200 }),
                renultApi.sms.queue({ limit: 200 }),
                apollosmsApi.whatsapp.messages({ limit: 200 }).catch(() => [] as WhatsAppMessageRecord[]),
                apollosmsApi.whatsapp.accounts().catch(() => [] as WhatsAppAccountResponse[]),
            ]);
            const whatsAppHistory = whatsAppMessages
                .filter((message) => WHATSAPP_HISTORY_STATUSES.has(message.status))
                .map((message) => toWhatsAppHistoryRecord(message, whatsAppAccounts));
            const whatsAppQueue = whatsAppMessages
                .filter((message) => message.status === "queued" || message.status === "sending")
                .map((message) => toWhatsAppQueuedRecord(message, whatsAppAccounts))
                .sort((a, b) => recordTime(a.scheduledFor) - recordTime(b.scheduledFor));
            return {
                history: [...historyData.map(toHistoryRecord), ...whatsAppHistory]
                    .sort((a, b) => recordTime(b.sentAt) - recordTime(a.sentAt)),
                queue: queueData.map(toQueuedRecord),
                whatsAppQueue,
            };
        },
        enabled: Boolean(user?.id),
        gcTime: SMS_LOGS_CACHE_TIME,
        staleTime: SMS_LOGS_STALE_TIME,
        placeholderData: (previousData) => previousData,
        refetchOnMount: true,
        // While WhatsApp messages are going out, refresh often so the queue drains visibly.
        refetchInterval: (query) => (query.state.data?.whatsAppQueue.length ? 5000 : SMS_LOGS_STALE_TIME),
        refetchOnReconnect: "always",
        refetchOnWindowFocus: true,
        retry: 1,
    });

    const history = smsLogs.history;
    const queue = smsLogs.queue;
    const whatsAppQueue = smsLogs.whatsAppQueue;
    const loadError = logsError instanceof Error ? logsError.message : "";
    const isRefreshing = isFetchingLogs && !isLoadingLogs;

    const updateSmsLogsCache = (updater: (current: SmsLogsCache) => SmsLogsCache) => {
        queryClient.setQueryData<SmsLogsCache>(smsLogsQueryKey, (current = { history: [], queue: [], whatsAppQueue: [] }) => updater(current));
    };

    const setHistory = (updater: SmsRecord[] | ((current: SmsRecord[]) => SmsRecord[])) => {
        updateSmsLogsCache((current) => ({
            ...current,
            history: typeof updater === "function" ? updater(current.history) : updater,
        }));
    };

    const setQueue = (updater: QueuedSms[] | ((current: QueuedSms[]) => QueuedSms[])) => {
        updateSmsLogsCache((current) => ({
            ...current,
            queue: typeof updater === "function" ? updater(current.queue) : updater,
        }));
    };

    useEffect(() => {
        const invalidateLogs = () => queryClient.invalidateQueries({ queryKey: smsLogsQueryKey });
        window.addEventListener("apollosms-login", invalidateLogs);
        window.addEventListener("apollosms-user-cache-cleared", invalidateLogs);
        return () => {
            window.removeEventListener("apollosms-login", invalidateLogs);
            window.removeEventListener("apollosms-user-cache-cleared", invalidateLogs);
        };
    }, [queryClient, smsLogsQueryKey]);

    const handleRefresh = async () => {
        const result = await refetchLogs();
        if (result.error) {
            toast.error(result.error instanceof Error ? result.error.message : "Unable to load SMS data");
        } else {
            toast.success("SMS and WhatsApp history synchronized successfully.");
        }
    };

    const handleDownloadLogs = async () => {
        const printWindow = window.open("", "_blank", "width=1100,height=800");
        if (!printWindow) {
            toast.error("Allow popups to print the PDF report.");
            return;
        }

        setIsPrintingLogs(true);
        printWindow.document.write(`<!doctype html><html><head><title>Preparing SMS report...</title></head><body style="font-family: Arial, sans-serif; padding: 24px;">Preparing SMS report...</body></html>`);
        printWindow.document.close();

        try {
            const records = (await renultApi.sms.history({ limit: PDF_EXPORT_LIMIT })).map(toHistoryRecord);
            if (records.length === 0) {
                printWindow.close();
                toast.info("No sent messages available to export.");
                return;
            }

            printWindow.document.open();
            printWindow.document.write(buildSmsLogsReportHtml(records, user?.full_name || user?.name || user?.email));
            printWindow.document.close();
            printWindow.focus();
            let printed = false;
            const printReport = () => {
                if (printed) return;
                printed = true;
                printWindow.print();
            };
            printWindow.onload = () => {
                printReport();
            };
            setTimeout(printReport, 500);
        } catch (error) {
            printWindow.close();
            toast.error(error instanceof Error ? error.message : "Unable to generate SMS PDF report");
        } finally {
            setIsPrintingLogs(false);
        }
    };

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
            if (channelFilter !== "all" && record.channel !== channelFilter) {
                return false;
            }
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
    }, [history, channelFilter, statusFilter, senderFilter, dateFilter, searchQuery]);

    // Handle Queue Filtering
    const activeQueue = activeTab === "whatsapp" ? whatsAppQueue : queue;
    const filteredQueue = useMemo(() => {
        return activeQueue.filter(record => {
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
    }, [activeQueue, statusFilter, senderFilter, searchQuery]);

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
    }, [activeTab, channelFilter, searchQuery, statusFilter, senderFilter, dateFilter]);

    // Actions
    const handleResend = (record: SmsRecord | QueuedSms) => {
        navigate("/compose", {
            state: {
                initialRecipient: record.phone,
                initialText: record.message,
                channel: record.channel,
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
            if (cancelId.startsWith(WHATSAPP_ID_PREFIX)) {
                await apollosmsApi.whatsapp.cancelMessage(cancelId.slice(WHATSAPP_ID_PREFIX.length));
                updateSmsLogsCache((current) => ({
                    ...current,
                    whatsAppQueue: current.whatsAppQueue.filter((q) => q.id !== cancelId),
                }));
                setIsCancelDialogOpen(false);
                setCancelId(null);
                toast.success("WhatsApp message cancelled and its credit refunded.");
                window.dispatchEvent(new CustomEvent("renult-wallet-change"));
                refetchLogs();
                return;
            }
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
                return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 ">Delivered</Badge>;
            case "Sent":
                return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 ">Sent</Badge>;
            case "Failed":
                return <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/20 ">Failed</Badge>;
            case "Pending":
                return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 ">Pending</Badge>;
            case "Sending":
                return (
                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20  flex items-center gap-1 w-max">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Sending
                    </Badge>
                );
            case "Scheduled":
                return <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 ">Scheduled</Badge>;
            case "Queued":
                return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 ">Queued</Badge>;
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
                        <h1 className="text-base tracking-tight text-foreground sm:text-base">
                            History - Outbox
                        </h1>
                        <p className="text-xs text-muted-foreground mt-4">
                            SMS and WhatsApp logs, delivery status, and pending broadcasts.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleDownloadLogs}
                            disabled={isPrintingLogs}
                            className="text-xs h-9 rounded flex items-center gap-1.5"
                        >
                            {isPrintingLogs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Download Logs
                        </Button>
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
                                "flex items-center gap-1.5 px-4 py-2.5 text-xs  border-b-2 transition-all duration-150 -mb-px",
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
                            onClick={() => { setActiveTab("whatsapp"); setStatusFilter("all"); }}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-2.5 text-xs  border-b-2 transition-all duration-150 -mb-px",
                                activeTab === "whatsapp"
                                    ? "border-emerald-600 text-emerald-600"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp Queue
                            {whatsAppQueue.length > 0 && (
                                <span className="ml-1 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] text-emerald-600">
                                    {whatsAppQueue.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => { setActiveTab("queue"); setStatusFilter("all"); }}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-2.5 text-xs  border-b-2 transition-all duration-150 -mb-px",
                                activeTab === "queue"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Clock className="w-3.5 h-3.5" />
                            SMS Outbox
                            {queue.length > 0 && (
                                <span className="ml-1 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] text-amber-500  ">
                                    {queue.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Data Display Card */}
                    <Card className="border border-border/10 shadow-none rounded">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm  tracking-tight text-foreground">
                                    {activeTab === "history" ? "Message Records" : activeTab === "whatsapp" ? "WhatsApp Queue" : "SMS Outbound Queue"}
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                                    {activeTab === "history"
                                        ? "Recently processed SMS and WhatsApp messages. Click on any record to view details or resend."
                                        : activeTab === "whatsapp"
                                            ? "WhatsApp messages waiting to go out. They are sent one at a time with pauses to protect your number; cancelling refunds the credit."
                                            : "SMS broadcasts queued for dispatch or scheduled for future delivery."}
                                </CardDescription>
                            </div>
                            {activeTab === "history" && (
                                <div className="flex rounded border border-border overflow-hidden text-xs h-8 shrink-0">
                                    {(["all", "sms", "whatsapp"] as const).map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setChannelFilter(value)}
                                            className={cn(
                                                "px-3",
                                                channelFilter === value
                                                    ? value === "whatsapp" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"
                                                    : "bg-card text-muted-foreground hover:bg-muted/30"
                                            )}
                                        >
                                            {value === "all" ? "All" : value === "sms" ? "SMS" : "WhatsApp"}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6 sm:pt-0">
                            <div className="overflow-x-auto border-y sm:border border-border/10 sm:rounded">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead className="w-[50px]  text-xs  text-foreground">#</TableHead>
                                            <TableHead className=" text-xs  text-foreground">Recipient</TableHead>
                                            <TableHead className=" text-xs truncate  text-foreground">Sender ID</TableHead>
                                            <TableHead className=" text-xs  text-foreground w-[40%]">Message</TableHead>
                                            <TableHead className=" text-xs  text-foreground">
                                                {activeTab === "history" ? "Sent At" : activeTab === "whatsapp" ? "Queued At" : "Scheduled For"}
                                            </TableHead>
                                            <TableHead className=" text-xs  text-foreground text-center">UNIT(S)</TableHead>
                                            <TableHead className=" text-xs  text-foreground text-center">Status</TableHead>
                                            <TableHead className=" text-xs  text-foreground text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoadingLogs ? (
                                            Array.from({ length: 6 }).map((_, index) => (
                                                <TableRow key={index}>
                                                    <TableCell><Skeleton className="h-4 w-5" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-full max-w-[260px]" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-16 mx-auto rounded-full" /></TableCell>
                                                    <TableCell><Skeleton className="h-7 w-24 ml-auto" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : paginatedRecords.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-44 text-center">
                                                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                        <img src="/bg/empty.png" className="w-10 h-10 mb-2 stroke-[1.2] text-muted-foreground/60" />
                                                        <span className="text-sm  text-foreground">
                                                            {loadError ? "Unable to load records" : activeTab === "whatsapp" ? "WhatsApp queue is empty" : "No records found"}
                                                        </span>
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
                                                                {/* <span className="text-xs  text-foreground">{record.recipientName}</span> */}
                                                                <span className="text-xs  text-muted-foreground mt-0.5">{record.phone}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {record.channel === "whatsapp" ? (
                                                                <Badge variant="outline" className="text-[10px] font-semibold py-0 px-2 rounded-full gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 whitespace-nowrap">
                                                                    <MessageCircle className="w-3 h-3" />
                                                                    {record.senderId}
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="destructive" className="text-[10px]  font-semibold py-0 px-2 rounded-full">
                                                                    {record.senderId}
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs font-normal text-foreground max-w-[280px]">
                                                            <div className="truncate" title={record.message}>
                                                                {record.message}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-xs truncate  text-muted-foreground">
                                                            {activeTab === "history"
                                                                ? formatLogTime((record as SmsRecord).sentAt)
                                                                : (record as QueuedSms).scheduledFor === "Immediate"
                                                                    ? "Immediate"
                                                                    : formatLogTime((record as QueuedSms).scheduledFor)}
                                                        </TableCell>
                                                        <TableCell className="text-center truncate  text-xs  text-foreground">
                                                            {record.channel === "whatsapp"
                                                                ? record.cost > 0 ? "1 WhatsApp" : "Free"
                                                                : record.cost > 0 ? `${record.cost} SMS` : "Free"}
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
                                                                ) : record.channel === "whatsapp" ? (
                                                                    record.status === "Queued" ? (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            title="Cancel and refund"
                                                                            onClick={() => triggerCancelQueue(record.id)}
                                                                            className="w-7 h-7 text-rose-500 hover:text-rose-600 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    ) : (
                                                                        <span className="text-[10px] text-muted-foreground pr-2">Sending now</span>
                                                                    )
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
                                                className={cn("w-8 h-8 rounded text-xs ", currentPage === p ? "bg-primary" : "border-border/80")}
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
                        <SheetTitle className="text-base  text-foreground flex items-center gap-2">
                            Message Transmission Audit
                        </SheetTitle>
                    </SheetHeader>

                    {selectedMessage && (
                        <div className="space-y-4 py-3 text-xs">
                            {/* Status and ID */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-muted-foreground block text-[10px]   ">
                                        {selectedMessage.channel === "whatsapp" ? "WhatsApp Message ID" : "SMS Reference ID"}
                                    </span>
                                    <span className="  text-foreground">{selectedMessage.id}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px]    text-right mb-0.5">Status</span>
                                    {getStatusBadge(selectedMessage.status)}
                                </div>
                            </div>

                            {/* Recipient Details */}
                            <div className="p-3 bg-muted/20 border border-border/40 rounded">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-muted-foreground block text-[11px]    mb-0.5">Recipient Name</span>
                                        <span className=" text-foreground">{selectedMessage.recipientName}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]    mb-0.5">Phone Number</span>
                                        <span className="  text-foreground">{selectedMessage.phone}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Message content */}
                            <div className="space-y-1">
                                <span className="text-muted-foreground block text-[10px]   ">
                                    {selectedMessage.channel === "whatsapp" ? "WhatsApp Content" : "SMS Content"}
                                </span>
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
                                    <span className="text-muted-foreground block text-[10px]    mb-0.5">
                                        {selectedMessage.channel === "whatsapp" ? "Sent From" : "Sender ID"}
                                    </span>
                                    <span className=" text-foreground ">{selectedMessage.senderId}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px]    mb-0.5">Billing cost</span>
                                    <span className=" text-foreground ">
                                        {selectedMessage.channel === "whatsapp"
                                            ? selectedMessage.cost > 0 ? "1 WhatsApp credit" : "Free daily message"
                                            : `${selectedMessage.cost} UGX`}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px]    mb-0.5">Channel</span>
                                    <span className=" text-foreground ">
                                        {selectedMessage.channel === "whatsapp" ? "WhatsApp" : `SMS · ${selectedMessage.segments} segment${selectedMessage.segments === 1 ? "" : "s"}`}
                                    </span>
                                </div>
                            </div>

                            {/* Time sent */}
                            <div className="flex items-center justify-between border-t border-border/20 pt-3 text-muted-foreground">
                                <span>Sent Timestamp:</span>
                                <span className="  text-foreground/80">{formatLogTime(selectedMessage.sentAt)}</span>
                            </div>

                            {/* Fail reason if failed */}
                            {selectedMessage.status === "Failed" && selectedMessage.failReason && (
                                <div className="p-3 bg-rose-500/5 border border-rose-500/15 rounded text-rose-500 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="">Transmission Failure Cause:</p>
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
                        <DialogTitle className="text-base  text-foreground">
                            {cancelId?.startsWith(WHATSAPP_ID_PREFIX) ? "Cancel WhatsApp Message" : "Cancel Outbound Message"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-1">
                            {cancelId?.startsWith(WHATSAPP_ID_PREFIX)
                                ? "This message will not be sent, and its WhatsApp credit (or free daily message) is refunded."
                                : "Are you sure you want to cancel this outbound transmission? It will be permanently removed from the gateway queue."}
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
                            {cancelId?.startsWith(WHATSAPP_ID_PREFIX) ? "Yes, Cancel Message" : "Yes, Cancel SMS"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 3. Reschedule Queue Dialog */}
            <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
                <DialogContent className="sm:max-w-md w-full bg-card border border-border/60 rounded p-6">
                    <DialogHeader className="pb-3 border-b border-border/40">
                        <DialogTitle className="text-base  text-foreground">Reschedule Delivery</DialogTitle>
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
