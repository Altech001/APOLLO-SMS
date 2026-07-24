import React, { useEffect, useState } from "react";

import { base44 } from "@/api/apollosms";
import SEO from "@/components/SEO";
import { ArrowRight, Loader2, CheckCircle2, ExternalLink, Unplug, CloudUpload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AppHeader from "@/components/Header/AppHeader";
import { useAuth } from "@/lib/auth";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ── Integration status type ─────────────────────────────────
interface IntegrationInfo {
    provider: string;
    is_connected: boolean;
    connected_email?: string;
    connected_at?: string;
}

// ── SVG Icons ───────────────────────────────────────────────
const SheetsIcon = () => (
    <svg className="w-10 h-10 flex-shrink-0" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path fill="#21A366" d="M28 2H10c-2.2 0-4 1.8-4 4v36c0 2.2 1.8 4 4 4h28c2.2 0 4-1.8 4-4V14L28 2z" />
        <path fill="#185C37" d="M42 14H32c-2.2 0-4-1.8-4-4V2l14 12z" />
        <path fill="#FFF" d="M12 22h24v2H12zm0 6h24v2H12zm0 6h24v2H12zm0-18h11v2H12z" />
    </svg>
);

const DriveIcon = () => (
    <svg className="w-10 h-10 flex-shrink-0" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path fill="#FFC107" d="M30.3 32.5l-6-10.4l8.2-14.1h12l-6 10.4z" />
        <path fill="#1976D2" d="M17.5 32.5l-6.2-10.7l6.2-10.7l12.4 21.4z" />
        <path fill="#4CAF50" d="M30.3 32.5H4.7l6-10.4l25.6 0z" />
    </svg>
);

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // ── Integration state ───────────────────────────────────
    const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
    const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    // ── Fetch integration status on mount ───────────────────
    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        setLoadingStatus(true);
        try {
            const data = await base44.integrations.Google.status();
            setIntegrations(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Failed to fetch integration status:", err);
        } finally {
            setLoadingStatus(false);
        }
    };

    // ── Connect handler ─────────────────────────────────────
    const handleConnect = async (provider: string) => {
        setConnectingProvider(provider);
        try {
            const { auth_url } = await base44.integrations.Google.getAuthUrl(provider);
            window.location.href = auth_url;
        } catch (err: any) {
            toast.error(err?.message || "Failed to start Google connection");
            setConnectingProvider(null);
        }
    };

    // ── Disconnect handler ──────────────────────────────────
    const handleDisconnect = async (provider: string) => {
        setDisconnectingProvider(provider);
        try {
            await base44.integrations.Google.disconnect(provider);
            toast.success(
                provider === "google_sheets"
                    ? "Google Sheets disconnected"
                    : "Google Drive disconnected"
            );
            await fetchStatus();
        } catch (err: any) {
            toast.error(err?.message || "Failed to disconnect");
        } finally {
            setDisconnectingProvider(null);
        }
    };

    // ── Helpers ─────────────────────────────────────────────
    const getIntegration = (provider: string) =>
        integrations.find((i) => i.provider === provider);

    if (!user) return null;

    const initials = user.full_name
        ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : user.email[0].toUpperCase();

    const driveInfo = getIntegration("google_drive");
    const sheetsInfo = getIntegration("google_sheets");

    return (
        <div className={`min-h-screen bg-white text-slate-900 selection:bg-slate-200 transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
            <SEO title="Settings &amp; Profile" path="/profile" />
            <AppHeader />
            {/* Main Z-Pattern Flow */}
            <main className="max-w-6xl mx-auto px-4 sm:px-8 md:px-12 mt-4 md:mt-12 mb-20 md:mb-32 grid grid-cols-1 lg:grid-cols-[1fr_2.5fr] gap-12 lg:gap-20 items-start">

                {/* Left Column: Core Identity */}
                <motion.aside
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-8 md:space-y-12 lg:sticky top-20"
                >
                    <div className="space-y-4 md:space-y-6">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-white border border-slate-100 flex items-center justify-center text-lg md:text-xl font-light text-slate-500 rounded-full">
                            {initials}
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-4xl lg:text-5xl font-light mb-1 md:mb-2 text-slate-800 break-words">
                                {user.full_name || 'User'}
                            </h1>
                            <p className="text-slate-400 tracking-wide font-medium text-sm">
                                {user.email}
                            </p>
                        </div>
                    </div>

                    <div className="pt-8">
                        <div className="flex flex-wrap gap-2 mb-6">
                            <button onClick={() => navigate("/settings")} className="px-3 py-2 border border-slate-200 rounded text-[11px] font-bold uppercase text-slate-500 hover:text-primary hover:border-primary transition-colors">
                                Edit Profile
                            </button>
                            <button onClick={() => navigate("/settings/api-keys")} className="px-3 py-2 border border-slate-200 rounded text-[11px] font-bold uppercase text-slate-500 hover:text-primary hover:border-primary transition-colors">
                                API Settings
                            </button>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <button className="group p-4 border border-rose-400 rounded-xl flex items-center gap-4 text-[11px] font-bold uppercase  text-rose-400 hover:text-rose-500 transition-colors">
                                    Sign Out
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-none border-slate-200">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-xl font-light">Sign Out</AlertDialogTitle>
                                    <AlertDialogDescription className="text-slate-500">
                                        Are you sure you want to end your session?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="mt-8 gap-4">
                                    <AlertDialogCancel className="rounded-none border-slate-200 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 hover:text-slate-900">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => {
                                            logout();
                                            navigate("/login", { replace: true });
                                        }}
                                        className="rounded-none bg-rose-500 hover:bg-rose-600 text-white font-bold uppercase tracking-widest text-[10px] border-none"
                                    >
                                        Proceed
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </motion.aside>

                {/* Right Column: Configurations (Z-Pattern End) */}
                <div className="space-y-16 md:space-y-24">

                    {/* section: custom api keys */}
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >

                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8 group">
                            <div className="space-y-2 max-w-sm">
                                <h3 className="text-lg md:text-xl font-light text-slate-800 ">Gemini AI Key</h3>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    Link your personal Gemini API key to override the system defaults and unlock advanced generation models.
                                </p>
                            </div>
                            <div className="flex w-full md:w-auto items-center gap-4 md:gap-6 mt-2 md:mt-0">
                                <Input
                                    type="password"
                                    placeholder="Enter isolated API key"
                                    className="bg-transparent border-b border-slate-300 py-2 focus:border-slate-800 transition-colors text-sm text-slate-700 placeholder:text-slate-300 flex-1 md:flex-none md:w-64"
                                />
                                <button className="text-[11px] font-bold uppercase  text-slate-400 hover:text-indigo-500 transition-colors pb-2 border-b border-transparent hover:text-primary shrink-0">
                                    Save
                                </button>
                            </div>
                        </div>
                    </motion.section>

                    {/* section: integrations */}
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <h2 className="text-[11px] font-bold uppercase  text-slate-600 mb-8 border-b border-slate-200 pb-4">
                            Integrations &amp; Storage
                        </h2>

                        <div className="space-y-8 md:space-y-16">

                            {/* ── Google Sheets Integration ─────────────── */}
                            <IntegrationCard
                                icon={<SheetsIcon />}
                                title="Google Sheets"
                                titleColor="text-green-600"
                                description="Establish a connection to sync all respondent submissions to a live external spreadsheet automatically."
                                provider="google_sheets"
                                info={sheetsInfo}
                                isLoading={loadingStatus}
                                isConnecting={connectingProvider === "google_sheets"}
                                isDisconnecting={disconnectingProvider === "google_sheets"}
                                onConnect={() => handleConnect("google_sheets")}
                                onDisconnect={() => handleDisconnect("google_sheets")}
                                connectedAccentColor="text-emerald-500"
                                hoverAccentColor="hover:text-emerald-500"
                            />

                            {/* ── Google Drive Integration ──────────────── */}
                            <IntegrationCard
                                icon={<DriveIcon />}
                                title="Google Drive"
                                titleColor="text-blue-600"
                                description="Map a drive directory for automatic cold backup of heavy user-uploaded file attachments."
                                provider="google_drive"
                                info={driveInfo}
                                isLoading={loadingStatus}
                                isConnecting={connectingProvider === "google_drive"}
                                isDisconnecting={disconnectingProvider === "google_drive"}
                                onConnect={() => handleConnect("google_drive")}
                                onDisconnect={() => handleDisconnect("google_drive")}
                                connectedAccentColor="text-blue-500"
                                hoverAccentColor="hover:text-blue-500"
                            />

                        </div>
                    </motion.section>
                </div>
            </main>
        </div>
    );
}


// ── Integration Card Component ─────────────────────────────
interface IntegrationCardProps {
    icon: React.ReactNode;
    title: string;
    titleColor: string;
    description: string;
    provider: string;
    info?: IntegrationInfo;
    isLoading: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    connectedAccentColor: string;
    hoverAccentColor: string;
}

function IntegrationCard({
    icon,
    title,
    titleColor,
    description,
    provider,
    info,
    isLoading,
    isConnecting,
    isDisconnecting,
    onConnect,
    onDisconnect,
    connectedAccentColor,
    hoverAccentColor,
}: IntegrationCardProps) {
    const isConnected = info?.is_connected ?? false;

    return (
        <div className="group border border-slate-200 md:border-transparent p-5 md:p-0 rounded-2xl md:rounded-none">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-8">
                <div className="flex items-start gap-4 md:gap-6">
                    <div className="shrink-0 transform scale-90 md:scale-100 origin-top-left">
                        {icon}
                    </div>
                    <div className="space-y-2 max-w-sm">
                        <div className="flex flex-wrap items-center gap-2 md:gap-3">
                            <h3 className={`text-lg md:text-xl font-light ${titleColor}`}>{title}</h3>
                            {isConnected && (
                                <motion.span
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full"
                                >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Connected</span>
                                </motion.span>
                            )}
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            {description}
                        </p>
                        {/* Connected account info */}
                        <AnimatePresence>
                            {isConnected && info?.connected_email && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pt-2"
                                >
                                    <p className="text-xs text-slate-400">
                                        Linked to <span className="font-semibold text-slate-600">{info.connected_email}</span>
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="flex items-center gap-4 mt-2 md:mt-0 pt-4 md:pt-0 border-t border-slate-100 md:border-transparent">
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                    ) : isConnected ? (
                        <>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <button
                                        disabled={isDisconnecting}
                                        className="group/btn flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-50"
                                    >
                                        {isDisconnecting ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Unplug className="w-3.5 h-3.5 group-hover/btn:rotate-12 transition-transform" />
                                        )}
                                        Disconnect
                                    </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-none border-slate-200">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-xl font-light">Disconnect {title}?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-500">
                                            This will revoke LUCOSMS's access to your {title} account
                                            {info?.connected_email ? ` (${info.connected_email})` : ""}.
                                            You can reconnect at any time.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="mt-8 gap-4">
                                        <AlertDialogCancel className="rounded-none border-slate-200 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 hover:text-slate-900">
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => onDisconnect()}
                                            className="rounded-none bg-rose-500 hover:bg-rose-600 text-white font-bold uppercase tracking-widest text-[10px] border-none"
                                        >
                                            Disconnect
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </>
                    ) : (
                        <button
                            onClick={onConnect}
                            disabled={isConnecting}
                            className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 ${hoverAccentColor} transition-colors disabled:opacity-50`}
                        >
                            {isConnecting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <CloudUpload className="w-3.5 h-3.5" />
                            )}
                            Connect
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
