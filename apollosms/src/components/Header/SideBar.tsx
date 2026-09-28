import { renultApi } from "@/api/apollosms";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsIcon } from "@/constants/Icons";
import { useAuth } from "@/lib/auth";
import {
    Check,
    ChevronsUpDown,
    EqualApproximatelyIcon,
    History,
    MenuSquareIcon,
    MessageCircle,
    MoreVerticalIcon,
    PersonStanding,
    Send,
    Sparkles,
    Share2Icon,
    Ticket,
    TrendingUp,
    UserCog,
    Users,
    Wallet2Icon
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface SideBarProps {
    isOpen: boolean;
    onClose: () => void;
}

interface NavItem {
    label: string;
    icon: React.ReactNode;
    path: string;
    iconColor?: string;
    hasSubmenu?: boolean;
}

const primaryNavItems: NavItem[] = [
    {
        label: "Dashboard",
        icon: <MenuSquareIcon className="w-5 h-5" />,
        path: "/",
    },
    {
        label: "Compose Message",
        icon: <Send className="w-5 h-5" />,
        path: "/compose",
    },
    {
        label: "AI Assistant",
        icon: <img src="/icons/ai.webp" className="w-5 h-5" />,
        path: "/chat",
    },
    {
        label: "Recent History",
        icon: <History className="w-5 h-5" />,
        path: "/recents-sms",
    },

];

const supportNavItems: NavItem[] = [
    {
        label: "Topups Credits",
        icon: <Wallet2Icon className="w-5 h-5" />,
        path: "/sms-tp",
    },
    {
        label: "Connect WhatsApp",
        icon: <MessageCircle className="w-5 h-5" />,
        path: "/whatsapp",
    },
];

const secondaryNavItems: NavItem[] = [
    {
        label: "My Settings",
        icon: <SettingsIcon className="w-5 h-5" />,
        path: "/settings",
        hasSubmenu: true,
    },
];

const adminNavItems: NavItem[] = [
    {
        label: "Profit",
        icon: <TrendingUp className="w-5 h-5" />,
        path: "/admin/profit",
    },
    {
        label: "Manage Users",
        icon: <UserCog className="w-5 h-5" />,
        path: "/settings/users",
    },
];

interface Workspace {
    id: string;
    name: string;
    iconColor: string;
}

const workspaceIconColors = [
    "from-emerald-400 via-teal-500 to-blue-600",
    "from-purple-400 via-pink-500 to-red-500",
    "from-amber-400 via-orange-500 to-yellow-600",
    "from-blue-400 via-indigo-500 to-purple-600",
];

export default function SideBar({ isOpen, onClose }: SideBarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
    const [smsBalance, setSmsBalance] = useState(0);
    const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
    const selectedName = selectedWorkspace?.name || "Workspace";
    const selectedIconColor = selectedWorkspace?.iconColor || workspaceIconColors[0];

    const handleSelectWorkspace = (workspace: Workspace) => {
        setSelectedWorkspace(workspace);
        localStorage.setItem("selected-workspace", workspace.id);
    };

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ collapsed: boolean }>).detail;
            setIsCollapsed(detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    useEffect(() => {
        let mounted = true;
        renultApi.branches.list()
            .then((branches) => {
                if (!mounted || branches.length === 0) return;
                const nextWorkspaces = branches.map((branch, index) => ({
                    id: branch.id,
                    name: branch.name,
                    iconColor: workspaceIconColors[index % workspaceIconColors.length],
                }));
                setWorkspaces(nextWorkspaces);
                const saved = localStorage.getItem("selected-workspace");
                setSelectedWorkspace(nextWorkspaces.find((workspace) => workspace.id === saved) || nextWorkspaces[0]);
            })
            .catch(() => undefined);
        const loadWallet = () => renultApi.wallet.get()
            .then((wallet) => {
                if (mounted) setSmsBalance(wallet.sms_balance);
            })
            .catch(() => undefined);
        loadWallet();
        window.addEventListener("renult-wallet-change", loadWallet);
        const branchHandler = (event: Event) => {
            const branch = (event as CustomEvent<{ id?: string; name?: string }>).detail;
            if (!branch?.id) return;
            const workspace = {
                id: branch.id,
                name: branch.name || "Branch",
                iconColor: workspaceIconColors[0],
            };
            setWorkspaces((prev) => {
                const exists = prev.some((item) => item.id === workspace.id);
                return exists ? prev.map((item) => (item.id === workspace.id ? { ...item, ...workspace } : item)) : [workspace, ...prev];
            });
            setSelectedWorkspace(workspace);
        };
        window.addEventListener("renult-branch-change", branchHandler);
        return () => {
            mounted = false;
            window.removeEventListener("renult-wallet-change", loadWallet);
            window.removeEventListener("renult-branch-change", branchHandler);
        };
    }, []);

    const toggleCollapse = () => {
        const next = !isCollapsed;
        setIsCollapsed(next);
        localStorage.setItem("sidebar-collapsed", String(next));
        window.dispatchEvent(new CustomEvent("sidebar-collapse-change", { detail: { collapsed: next } }));
    };

    const handleNavigate = (path: string) => {
        if (path === "/#templates") {
            navigate("/");
            // Trigger templates open via a custom event
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent("open-templates"));
            }, 100);
        } else {
            navigate(path);
        }
        onClose();
    };

    const isActive = (path: string) => {
        if (path === "/") return location.pathname === "/";
        if (path === "/settings" && location.pathname.startsWith("/settings/users")) return false;
        return location.pathname.startsWith(path);
    };

    const renderNavItem = (item: NavItem) => {
        const active = isActive(item.path);
        const buttonContent = (
            <button
                key={item.label}
                onClick={() => handleNavigate(item.path)}
                className={`
          flex items-center rounded text-sm font-normal text-foreground 
          transition-all duration-150 ease-in-out group
          ${isCollapsed ? "justify-center w-10 h-10 mx-auto" : "w-full justify-between px-4 py-2.5"}
          ${active
                        ? "bg-primary/10 text-primary  border-l-4 border-primary rounded-none"
                        : "text-muted-foreground text-base hover:bg-muted/60"
                    }
        `}
            >
                {isCollapsed ? (
                    <span className={`shrink-0 font-normal ${active ? "text-primary" : item.iconColor || "text-foreground/70"}`}>
                        {item.icon}
                    </span>
                ) : (
                    <>
                        <div className="flex items-center gap-4 overflow-hidden">
                            <span className={`shrink-0 ${active ? "text-primary font-normal" : item.iconColor || "text-foreground/80 font-normal"}`}>
                                {item.icon}
                            </span>
                            <span className={`${active ? "truncate text-primary" : "truncate text-foreground/80"}`}>{item.label}</span>
                        </div>
                        {item.hasSubmenu && (
                            <MoreVerticalIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
                        )}
                    </>
                )}
            </button>
        );

        if (isCollapsed) {
            return (
                <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                        {buttonContent}
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-semibold text-xs bg-slate-900 text-white border-slate-900 rounded py-1 px-2.5">
                        {item.label}
                    </TooltipContent>
                </Tooltip>
            );
        }

        return buttonContent;
    };

    return (
        <TooltipProvider>
            {/* Backdrop overlay */}
            <div
                className={`
          fixed inset-0 z-40 bg-black/30 backdrop-blur-[5px]
          transition-opacity duration-300 shadow-md md:hidden
          ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
                onClick={onClose}
            />

            {/* Sidebar panel */}
            <aside
                className={`
          fixed top-0 left-0 z-50 h-full bg-card text-foreground
          border-r border-border/30 shadow-2xl md:shadow-none md:z-20
          flex flex-col custom-scrollbar
          transition-all duration-300 ease-&lsqb;cubic-bezier(0.4,0,0.2,1)&rsqb;
          md:translate-x-0
          ${isCollapsed ? "w-[72px]" : "w-[280px]"}
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
            >
                <div className="flex items-center p-[10px] border-b border-border/30 space-x-4 ">
                    <div className="p-1">
                        <img src="/bg/logo.png" alt="Logo" className="w-10 h-7" />
                    </div>
                    <span className={`text-lg font-bold tracking-tight text-foreground ${isCollapsed ? "hidden" : ""}`}>
                        CHRIS-SMS
                    </span>
                </div>

                {/* Sidebar header (Workspace Selector) */}
                <div className={`p-3 ${isCollapsed ? "flex justify-center" : ""}`}>
                    <Popover open={workspaceMenuOpen} onOpenChange={setWorkspaceMenuOpen}>
                        <PopoverTrigger asChild>
                            <button
                                className={`flex items-center border border-border/60 rounded bg-card/50 transition-all duration-150 hover:bg-muted/40 ${isCollapsed ? "justify-center w-10 h-10 mx-auto" : "w-full justify-between px-3 py-2"}`}
                                aria-label="Select workspace"
                            >
                                {isCollapsed ? (
                                    <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${selectedIconColor} shrink-0`} />
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2.5 overflow-hidden">
                                            {/* Circular color gradient icon */}
                                            <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${selectedIconColor} shrink-0`} />
                                            <span className="text-sm font-semibold text-foreground tracking-tight whitespace-nowrap">
                                                {selectedName}
                                            </span>
                                        </div>
                                        <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
                                    </>
                                )}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            side={isCollapsed ? "right" : "bottom"}
                            align="start"
                            className="w-64 p-2 bg-popover border border-border/60 shadow rounded"
                        >
                            <div className="px-2 py-1.5 text-xs font-mono text-muted-foreground">

                            </div>
                            <div className="space-y-1">
                                {[
                                    { label: "Share Credits", path: "/share-sms", icon: <Share2Icon className="w-4 h-4" /> },
                                    { label: "PhoneBook", path: "/my-contacts", icon: <PersonStanding className="w-4 h-4" /> },
                                    {
                                        label: "Templates & Artworks",
                                        icon: <Ticket className="w-5 h-5" />,
                                        path: "/templates",
                                    },
                                ].map((action) => (
                                    <button
                                        key={action.path}
                                        onClick={() => {
                                            setWorkspaceMenuOpen(false);
                                            handleNavigate(action.path);
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors text-left ${isActive(action.path)
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-foreground/80 hover:bg-muted/60"
                                            }`}
                                    >
                                        <span className={isActive(action.path) ? "text-primary" : "text-muted-foreground"}>{action.icon}</span>
                                        <span className="font-medium">{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Navigation Groups Container */}
                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                    {/* Primary nav */}
                    <nav className="py-3 px-2 text-foreground font-bold">
                        <div className="space-y-0.5 text-foreground">
                            {primaryNavItems.map(renderNavItem)}
                        </div>
                    </nav>

                    <nav className="border-t border-border/40 py-3 px-2">
                        <div className="space-y-0.5">
                            {supportNavItems.map(renderNavItem)}
                        </div>
                    </nav>

                    {user?.role === "admin" && (
                        <nav className="py-3 px-2 border-t border-border/40">
                            <div className="space-y-0.5">
                                {adminNavItems.map(renderNavItem)}
                            </div>
                        </nav>
                    )}

                    <nav className="py-3 px-2 border-t border-border/40">
                        <div className="space-y-0.5">
                            {secondaryNavItems.map(renderNavItem)}
                        </div>
                    </nav>
                </div>


                {/* Minimal Balance View */}
                <div className={`border-t border-border/30 p-3 ${isCollapsed ? "flex justify-center" : ""}`}>
                    {isCollapsed ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => handleNavigate("/settings/billing")}
                                    className="w-10 h-10 flex items-center justify-center rounded border border-border/60 hover:bg-muted/60 text-primary transition-all cursor-pointer"
                                    aria-label="View Balance and Plan"
                                >
                                    <Wallet2Icon className="w-5 h-5 text-primary" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="font-semibold text-xs bg-slate-900 text-white border-slate-900 rounded py-1 px-2.5">
                                Bal: {smsBalance.toLocaleString()} SMS
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <div
                            onClick={() => handleNavigate("/settings/billing")}
                            className="flex items-center gap-3 border border-primary/40 rounded bg-card/50 p-2.5 hover:bg-muted/45 transition-all cursor-pointer group"
                        >
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-primary group-hover:bg-primary/15 transition-all shrink-0">
                                <Wallet2Icon className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-xs">BALANCE: </span>
                            <div className="flex flex-row min-w-0">
                                <span className="text-sm font-bold text-foreground leading-none">
                                    {smsBalance.toLocaleString()} SMS
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Collapse / Expand Toggle at the bottom */}
                {/* <div className="hidden md:flex border-t border-border/30 p-3 justify-center">
                    <button
                        onClick={toggleCollapse}
                        className={`flex items-center rounded text-sm font-medium text-foreground/80 hover:bg-muted/60 transition-all duration-150 ${isCollapsed ? "justify-center w-10 h-10 mx-auto" : "w-full gap-3 px-3 py-2"}`}
                        aria-label="Toggle sidebar collapse"
                    >
                        <PanelLeft className="w-5 h-5 text-foreground/70 shrink-0" />
                        {!isCollapsed && <span className="truncate">Collapse Menu</span>}
                    </button>
                </div> */}

            </aside>
        </TooltipProvider>
    );
}
