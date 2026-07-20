/* eslint-disable @typescript-eslint/no-explicit-any */
import { renultApi, SecurityLogResponse, SessionResponse } from "@/api/apollosms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AlertTriangle,
    Check,
    Clock,
    Globe,
    KeyRound,
    Laptop,
    Loader2,
    LogIn,
    LogOut,
    Monitor,
    RefreshCcw,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Smartphone,
    Trash2,
    Unlock
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

/* ─── Types ─── */
type LogAction =
    | "login"
    | "logout"
    | "password_change"
    | "api_key_created"
    | "api_key_deleted"
    | "failed_login"
    | "2fa_enabled"
    | "2fa_disabled";

interface SecurityLog {
    id: string;
    action: LogAction;
    label: string;
    ip: string;
    userAgent: string;
    location: string;
    timestamp: string;
    status: "success" | "warning" | "danger";
}

interface ActiveSession {
    id: string;
    device: string;
    browser: string;
    os: string;
    ip: string;
    location: string;
    lastActive: string;
    isCurrent: boolean;
}

/* ─── Mock Data ─── */
function generateMockLogs(): SecurityLog[] {
    return [
        {
            id: "log-1",
            action: "login",
            label: "Signed in successfully",
            ip: "197.239.8.142",
            userAgent: "Chrome 126 on Windows",
            location: "Kampala, Uganda",
            timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
            status: "success",
        },
        {
            id: "log-2",
            action: "password_change",
            label: "Password changed",
            ip: "197.239.8.142",
            userAgent: "Chrome 126 on Windows",
            location: "Kampala, Uganda",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
            status: "success",
        },
        {
            id: "log-3",
            action: "failed_login",
            label: "Failed login attempt",
            ip: "41.210.145.33",
            userAgent: "Firefox 128 on Linux",
            location: "Nairobi, Kenya",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
            status: "danger",
        },
        {
            id: "log-4",
            action: "api_key_created",
            label: "API key created: Gemini API Key",
            ip: "197.239.8.142",
            userAgent: "Chrome 126 on Windows",
            location: "Kampala, Uganda",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            status: "success",
        },
        {
            id: "log-5",
            action: "login",
            label: "Signed in via Google",
            ip: "197.239.8.142",
            userAgent: "Chrome 126 on macOS",
            location: "Kampala, Uganda",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
            status: "success",
        },
        {
            id: "log-6",
            action: "logout",
            label: "Signed out",
            ip: "197.239.8.142",
            userAgent: "Chrome 126 on macOS",
            location: "Kampala, Uganda",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
            status: "success",
        },
        {
            id: "log-7",
            action: "failed_login",
            label: "Failed login attempt (wrong password)",
            ip: "102.89.47.201",
            userAgent: "Safari 17 on iPhone",
            location: "Lagos, Nigeria",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
            status: "danger",
        },
        {
            id: "log-8",
            action: "api_key_deleted",
            label: "API key deleted: Old Test Key",
            ip: "197.239.8.142",
            userAgent: "Chrome 126 on Windows",
            location: "Kampala, Uganda",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
            status: "warning",
        },
    ];
}

function generateMockSessions(): ActiveSession[] {
    return [
        {
            id: "sess-1",
            device: "Desktop",
            browser: "Chrome 126",
            os: "Windows 11",
            ip: "197.239.8.142",
            location: "Kampala, Uganda",
            lastActive: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
            isCurrent: true,
        },
        {
            id: "sess-2",
            device: "Mobile",
            browser: "Safari 17",
            os: "iOS 18",
            ip: "197.239.8.150",
            location: "Kampala, Uganda",
            lastActive: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
            isCurrent: false,
        },
        {
            id: "sess-3",
            device: "Desktop",
            browser: "Firefox 128",
            os: "macOS Sequoia",
            ip: "197.239.8.142",
            location: "Kampala, Uganda",
            lastActive: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
            isCurrent: false,
        },
    ];
}

/* ─── Helpers ─── */
function normalizeAction(action: string): LogAction {
    const value = action.toLowerCase().replace(/\s+/g, "_");
    if (value.includes("failed")) return "failed_login";
    if (value.includes("password")) return "password_change";
    if (value.includes("api") && value.includes("delete")) return "api_key_deleted";
    if (value.includes("api") && value.includes("create")) return "api_key_created";
    if (value.includes("logout") || value.includes("sign_out")) return "logout";
    return "login";
}

function toSecurityLog(log: SecurityLogResponse): SecurityLog {
    const action = normalizeAction(log.action || "login");
    return {
        id: String(log.id),
        action,
        label: log.action || "Security event",
        ip: log.ip_address || "-",
        userAgent: log.device || "Unknown device",
        location: log.location || "Unknown location",
        timestamp: log.created_at,
        status: action === "failed_login" ? "danger" : action === "api_key_deleted" ? "warning" : "success",
    };
}

function toActiveSession(session: SessionResponse): ActiveSession {
    const device = session.device || "Unknown device";
    return {
        id: String(session.id),
        device: /mobile|iphone|android/i.test(device) ? "Mobile" : "Desktop",
        browser: device,
        os: session.is_current ? "Current session" : "Active session",
        ip: session.ip_address || "-",
        location: session.location || "Unknown location",
        lastActive: session.created_at,
        isCurrent: session.is_current,
    };
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

const actionConfig: Record<
    LogAction,
    { icon: React.ReactNode; color: string }
> = {
    login: {
        icon: <LogIn className="w-3.5 h-3.5" />,
        color: "text-emerald-500",
    },
    logout: {
        icon: <LogOut className="w-3.5 h-3.5" />,
        color: "text-muted-foreground",
    },
    password_change: {
        icon: <Unlock className="w-3.5 h-3.5" />,
        color: "text-amber-500",
    },
    api_key_created: {
        icon: <KeyRound className="w-3.5 h-3.5" />,
        color: "text-primary",
    },
    api_key_deleted: {
        icon: <Trash2 className="w-3.5 h-3.5" />,
        color: "text-amber-500",
    },
    failed_login: {
        icon: <ShieldAlert className="w-3.5 h-3.5" />,
        color: "text-red-500",
    },
    "2fa_enabled": {
        icon: <ShieldCheck className="w-3.5 h-3.5" />,
        color: "text-emerald-500",
    },
    "2fa_disabled": {
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        color: "text-red-500",
    },
};

const statusBadge: Record<
    SecurityLog["status"],
    { bg: string; text: string; label: string }
> = {
    success: {
        bg: "bg-emerald-500/10",
        text: "text-emerald-500",
        label: "Success",
    },
    warning: {
        bg: "bg-amber-500/10",
        text: "text-amber-600",
        label: "Warning",
    },
    danger: {
        bg: "bg-red-500/10",
        text: "text-red-500",
        label: "Suspicious",
    },
};

/* ─── Component ─── */
type TabId = "logs" | "sessions";

export default function SecurityLogsPage() {
    const [activeTab, setActiveTab] = useState<TabId>("logs");
    const [logs, setLogs] = useState<SecurityLog[]>([]);
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadSecurityData = async (showToast = false) => {
        setIsLoading(true);
        try {
            const [logsData, sessionsData] = await Promise.all([
                renultApi.security.logs(),
                renultApi.security.sessions(),
            ]);
            setLogs(logsData.map(toSecurityLog));
            setSessions(sessionsData.map(toActiveSession));
            if (showToast) toast.success("Security data refreshed");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load security data");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSecurityData();
    }, []);

    const handleRefresh = () => {
        loadSecurityData(true);
    };

    const handleRevokeSession = async (sessionId: string) => {
        try {
            await renultApi.security.revokeSession(sessionId);
            setSessions((prev) => prev.filter((s) => s.id !== sessionId));
            toast.success("Session revoked successfully");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to revoke session");
        }
    };

    const handleRevokeAllOther = async () => {
        try {
            await renultApi.security.revokeOtherSessions();
            setSessions((prev) => prev.filter((s) => s.isCurrent));
            toast.success("All other sessions revoked");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to revoke sessions");
        }
    };

    return (
        <SettingsLayout title="Security Logs">
            <div className="text-foreground min-h-[calc(100vh-57px)] w-full p-6 sm:p-10 font-sans flex flex-col justify-between selection:bg-primary/20 selection:text-primary">
                <div className="space-y-8 flex-1">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-lg font-bold text-foreground tracking-tight">
                                Security & Sessions
                            </h1>
                            <p className="text-xs text-muted-foreground mt-1">
                                Review login activity, monitor active sessions, and keep your
                                account secure.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleRefresh}
                            disabled={isLoading}
                            className="h-9 text-xs font-semibold rounded px-4 gap-2 border-border"
                        >
                            {isLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <RefreshCcw className="w-3.5 h-3.5" />
                            )}
                            Refresh
                        </Button>
                    </div>

                    {/* Tab Bar */}
                    <div className="flex items-center gap-1 bg-muted p-1 rounded border border-border w-fit">
                        <button
                            onClick={() => setActiveTab("logs")}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all ${activeTab === "logs"
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {activeTab === "logs" && (
                                <Check className="w-3 h-3 stroke-[3]" />
                            )}
                            <Shield className="w-3.5 h-3.5" />
                            Security Logs
                            <span className="ml-1 bg-background/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                {logs.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab("sessions")}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all ${activeTab === "sessions"
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {activeTab === "sessions" && (
                                <Check className="w-3 h-3 stroke-[3]" />
                            )}
                            <Monitor className="w-3.5 h-3.5" />
                            Active Sessions
                            <span className="ml-1 bg-background/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                {sessions.length}
                            </span>
                        </button>
                    </div>

                    {/* Content */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            <span className="ml-3 text-sm text-muted-foreground">
                                Loading security data...
                            </span>
                        </div>
                    ) : activeTab === "logs" ? (
                        /* ─── SECURITY LOGS TAB ─── */
                        <div className="relative bg-card overflow-hidden rounded">
                            {logs.length === 0 ? (
                                <div className="py-16 text-center text-muted-foreground">
                                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-30 text-primary" />
                                    <p className="text-sm font-medium">
                                        No security events recorded yet.
                                    </p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="w-[35%] text-xs text-muted-foreground font-semibold">
                                                Event
                                            </TableHead>
                                            <TableHead className="w-[15%] text-xs text-muted-foreground font-semibold">
                                                Status
                                            </TableHead>
                                            <TableHead className="w-[20%] text-xs text-muted-foreground font-semibold">
                                                IP / Location
                                            </TableHead>
                                            <TableHead className="w-[15%] text-xs text-muted-foreground font-semibold">
                                                Device
                                            </TableHead>
                                            <TableHead className="w-[15%] text-right text-xs text-muted-foreground font-semibold pr-6">
                                                When
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {logs.map((log) => {
                                            const config = actionConfig[log.action];
                                            const badge = statusBadge[log.status];
                                            return (
                                                <TableRow
                                                    key={log.id}
                                                    className="hover:bg-muted/40 transition-all duration-200"
                                                >
                                                    <TableCell className="py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${config.color} bg-current/10`}
                                                                style={{
                                                                    backgroundColor: `color-mix(in srgb, currentColor 10%, transparent)`,
                                                                }}
                                                            >
                                                                <span className={config.color}>
                                                                    {config.icon}
                                                                </span>
                                                            </div>
                                                            <span className="text-sm font-semibold text-foreground">
                                                                {log.label}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 px-2.5 rounded-full text-[11px] font-semibold ${badge.bg} ${badge.text}`}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-xs font-mono text-foreground">
                                                                {log.ip}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                                <Globe className="w-3 h-3" /> {log.location}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span className="text-xs text-muted-foreground">
                                                            {log.userAgent}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-4 text-right pr-6">
                                                        <div className="flex flex-col items-end gap-0.5">
                                                            <span className="text-xs font-medium text-foreground">
                                                                {timeAgo(log.timestamp)}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {formatDate(log.timestamp)}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    ) : (
                        /* ─── ACTIVE SESSIONS TAB ─── */
                        <div className="space-y-4">
                            {/* Revoke all button */}
                            {sessions.filter((s) => !s.isCurrent).length > 0 && (
                                <div className="flex justify-end">
                                    <Button
                                        variant="outline"
                                        onClick={handleRevokeAllOther}
                                        className="h-9 text-xs font-semibold rounded px-4 gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
                                        Revoke all other sessions
                                    </Button>
                                </div>
                            )}

                            <div className="space-y-3">
                                {sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={`flex items-center justify-between p-5 rounded border transition-all duration-200 ${session.isCurrent
                                                ? "bg-primary/5 border-primary/30"
                                                : "bg-card border-border/50 hover:border-border hover:bg-muted/20"
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Device icon */}
                                            <div
                                                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${session.isCurrent
                                                        ? "bg-primary/10 text-primary"
                                                        : "bg-muted/50 text-muted-foreground"
                                                    }`}
                                            >
                                                {session.device === "Mobile" ? (
                                                    <Smartphone className="w-5 h-5" />
                                                ) : (
                                                    <Laptop className="w-5 h-5" />
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-foreground">
                                                        {session.browser} — {session.os}
                                                    </span>
                                                    {session.isCurrent && (
                                                        <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-[10px] px-2 py-0 font-bold hover:bg-emerald-500/15">
                                                            This device
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1 font-mono">
                                                        <Globe className="w-3 h-3" /> {session.ip}
                                                    </span>
                                                    <span>{session.location}</span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />{" "}
                                                        {timeAgo(session.lastActive)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {!session.isCurrent && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRevokeSession(session.id)}
                                                className="h-8 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5 rounded"
                                            >
                                                <LogOut className="w-3.5 h-3.5" />
                                                Revoke
                                            </Button>
                                        )}
                                    </div>
                                ))}

                                {sessions.length === 0 && (
                                    <div className="py-16 text-center text-muted-foreground">
                                        <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30 text-primary" />
                                        <p className="text-sm font-medium">
                                            No active sessions found.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </SettingsLayout>
    );
}
