import { AITemplateResponse, AIWriteMode, MessageChannel, renultApi, TemplateResponse } from "@/api/apollosms";
import HelpMeWrite from "@/components/ai/HelpMeWrite";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePaidFeatures } from "@/hooks/use-billing-summary";
import { cn } from "@/lib/utils";
import {
    Activity,
    Clock,
    Edit,
    FileText,
    MessageCircle,
    Plus,
    Search,
    Share2,
    Trash2,
    X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface SMSTemplate {
    id: string;
    name: string;
    category: "Authentication" | "Marketing" | "Transactional" | "Alert";
    channel: MessageChannel;
    content: string;
    variables: string[];
    lastUsed: string;
    usageCount: number;
}

const SUGGESTED_VARIABLES = ["code", "name", "promo_code", "expiry_date", "date_time", "doctor", "balance", "threshold", "currency", "link"];
const templatesQueryKey = ["apollosms", "sms-templates"] as const;
const TEMPLATE_CACHE_TIME = 30 * 60 * 1000;
const TEMPLATE_STALE_TIME = 5 * 60 * 1000;

const toTemplate = (template: TemplateResponse): SMSTemplate => ({
    id: template.id,
    name: template.name,
    category: (template.category as SMSTemplate["category"]) || "Transactional",
    channel: template.channel === "whatsapp" ? "whatsapp" : "sms",
    content: template.content,
    variables: template.variables || [],
    lastUsed: template.lastUsed || template.last_used || "Never",
    usageCount: template.usageCount ?? template.usage_count ?? 0,
});

function TemplateGridSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index} className="bg-card border border-border/40 rounded shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-start gap-2">
                            <Skeleton className="h-5 w-24 rounded-full" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                        <Skeleton className="h-5 w-2/3 mt-3" />
                    </CardHeader>
                    <CardContent className="pb-4 space-y-2">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-11/12" />
                        <Skeleton className="h-3 w-3/5" />
                    </CardContent>
                    <div className="px-6 py-3 border-t border-border/10 flex items-center justify-between">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-5 w-14" />
                    </div>
                </Card>
            ))}
        </div>
    );
}

export default function TemplatesIndex() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const [filterChannel, setFilterChannel] = useState<"all" | MessageChannel>("all");
    const { whatsappTemplates } = usePaidFeatures();

    // Right Panel State
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [panelMode, setPanelMode] = useState<"view" | "edit" | "create">("view");
    const [activeTemplate, setActiveTemplate] = useState<SMSTemplate | null>(null);

    // Form State
    const [formName, setFormName] = useState("");
    const [formCategory, setFormCategory] = useState<SMSTemplate["category"]>("Authentication");
    const [formContent, setFormContent] = useState("");
    const [formChannel, setFormChannel] = useState<MessageChannel>("sms");
    const textareaRef = useRef<HTMLTextAreaElement>(null);


    const {
        data: templates = [],
        error: loadError,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: templatesQueryKey,
        queryFn: async () => (await renultApi.templates.list()).map(toTemplate),
        gcTime: TEMPLATE_CACHE_TIME,
        staleTime: TEMPLATE_STALE_TIME,
        placeholderData: (previousData) => previousData,
        refetchOnMount: true,
        refetchInterval: TEMPLATE_STALE_TIME,
        refetchOnReconnect: "always",
        refetchOnWindowFocus: true,
        retry: 1,
    });

    useEffect(() => {
        if (loadError && templates.length === 0) {
            toast.error("Unable to load templates from the API.");
        }
    }, [loadError, templates.length]);

    const updateTemplatesCache = (updater: (current: SMSTemplate[]) => SMSTemplate[]) => {
        queryClient.setQueryData<SMSTemplate[]>(templatesQueryKey, (current = []) => updater(current));
    };

    // Open panel helper
    const openViewPanel = (template: SMSTemplate) => {
        setActiveTemplate(template);
        setPanelMode("view");
        setIsPanelOpen(true);
    };

    const openEditPanel = (template: SMSTemplate) => {
        setActiveTemplate(template);
        setFormName(template.name);
        setFormCategory(template.category);
        setFormContent(template.content);
        setFormChannel(template.channel);
        setPanelMode("edit");
        setIsPanelOpen(true);
    };

    const openCreatePanel = () => {
        setActiveTemplate(null);
        setFormName("");
        setFormCategory("Authentication");
        setFormContent("");
        setFormChannel(filterChannel === "whatsapp" ? "whatsapp" : "sms");
        setPanelMode("create");
        setIsPanelOpen(true);
    };

    const closePanel = () => {
        setIsPanelOpen(false);
        setTimeout(() => {
            setActiveTemplate(null);
            setFormName("");
            setFormContent("");
        }, 300);
    };

    // Insert variable into content
    const insertVariable = (variable: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const placeholder = `{${variable}}`;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = formContent;
        const newContent = text.substring(0, start) + placeholder + text.substring(end);

        setFormContent(newContent);

        // Focus back and reset cursor
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
        }, 0);
    };

    // Character / Segment Math
    const charCount = formContent.length;
    const maxCharsSingle = 160;
    const segments = charCount === 0 ? 0 : charCount <= maxCharsSingle ? 1 : Math.ceil(charCount / 153);
    const charsRemaining = charCount <= maxCharsSingle ? maxCharsSingle - charCount : 153 - (charCount % 153 || 153);
    const isWhatsAppForm = formChannel === "whatsapp";

    const handleAIResult = (draft: AITemplateResponse, mode: AIWriteMode, previous: string) => {
        setFormContent(draft.content);
        if (mode === "create") {
            if (!formName.trim()) setFormName(draft.name);
            setFormCategory((draft.category as SMSTemplate["category"]) || formCategory);
        }
        toast.success(mode === "create" ? "Draft written. Review it before saving." : "Text rewritten", {
            action: previous ? { label: "Undo", onClick: () => setFormContent(previous) } : undefined,
        });
    };

    const sendWithTemplate = (template: SMSTemplate, channel: MessageChannel) => {
        navigate("/compose", { state: { initialText: template.content, channel, extras: (template as { extras?: unknown }).extras } });
    };

    // Parse variables in template content on save
    const extractVariables = (text: string): string[] => {
        const regex = /\{([^}]+)\}/g;
        const matches: string[] = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (!matches.includes(match[1])) {
                matches.push(match[1]);
            }
        }
        return matches;
    };

    // Save Template Action
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim()) {
            toast.error("Please provide a template name");
            return;
        }
        if (!formContent.trim()) {
            toast.error("Template content cannot be empty");
            return;
        }

        const detectedVars = extractVariables(formContent);

        try {
            if (panelMode === "create") {
                const created = await renultApi.templates.create({
                    name: formName.trim(),
                    category: formCategory,
                    channel: formChannel,
                    content: formContent.trim(),
                    variables: detectedVars,
                });
                updateTemplatesCache((current) => [toTemplate(created), ...current]);
                toast.success("Template created successfully");
            } else if (panelMode === "edit" && activeTemplate) {
                const updated = await renultApi.templates.update(activeTemplate.id, {
                    name: formName.trim(),
                    category: formCategory,
                    channel: formChannel,
                    content: formContent.trim(),
                    variables: detectedVars,
                });
                const nextTemplate = toTemplate(updated);
                updateTemplatesCache((current) => current.map((t) => t.id === activeTemplate.id ? nextTemplate : t));
                setActiveTemplate(nextTemplate);
                toast.success("Template updated successfully");
            }
            closePanel();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save template");
        }
    };

    // Delete Template Action
    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this template?")) {
            try {
                await renultApi.templates.delete(id);
                updateTemplatesCache((current) => current.filter((t) => t.id !== id));
                toast.success("Template deleted successfully");
                closePanel();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to delete template");
            }
        }
    };

    // Search and filter list
    const filteredTemplates = useMemo(() => {
        return templates.filter((t) => {
            const matchesSearch =
                t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.content.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = filterCategory === "all" || t.category === filterCategory;
            const matchesChannel = filterChannel === "all" || t.channel === filterChannel;
            const allowed = whatsappTemplates || t.channel !== "whatsapp";
            return matchesSearch && matchesCategory && matchesChannel && allowed;
        });
    }, [templates, searchQuery, filterCategory, filterChannel, whatsappTemplates]);

    const getCategoryBadgeClass = (category: SMSTemplate["category"]) => {
        switch (category) {
            case "Authentication":
                return "bg-blue-500/10 text-blue-500 border-blue-500/20";
            case "Marketing":
                return "bg-pink-500/10 text-pink-500 border-pink-500/20";
            case "Transactional":
                return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
            case "Alert":
                return "bg-amber-500/10 text-amber-500 border-amber-500/20";
        }
    };

    return (
        <div
            className={cn(
                "min-h-screen bg-background transition-all duration-300",
                sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
            )}
        >
            <SEO title="SMS Templates" />
            <AppHeader onCreateForm={() => { }} />

            <main className="max-w-screen mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        
                        <p className="text-xs text-muted-foreground mt-1">
                            Create, edit, and organize reusable content snippets with dynamic placeholders.
                            {isFetching && templates.length > 0 ? (
                                <span className="ml-2 text-primary">Refreshing cache...</span>
                            ) : null}
                        </p>
                    </div>
                    <Button onClick={openCreatePanel} size="sm" className="gap-1.5 h-9 font-semibold text-xs shrink-0">
                        <Plus className="w-4 h-4" />
                        Create Template
                    </Button>
                </div>

                {/* Filter Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search templates by name or content..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-10 text-xs bg-card"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="flex rounded border border-border overflow-hidden text-xs h-10 shrink-0">
                        {(["all", "sms", "whatsapp"] as const).filter((value) => value !== "whatsapp" || whatsappTemplates).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setFilterChannel(value)}
                                className={cn(
                                    "px-3",
                                    filterChannel === value
                                        ? value === "whatsapp" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"
                                        : "bg-card text-muted-foreground hover:bg-muted/30"
                                )}
                            >
                                {value === "all" ? "All" : value === "sms" ? "SMS" : "WhatsApp"}
                            </button>
                        ))}
                    </div>
                    <div className="w-full sm:w-[200px]">
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                            <SelectTrigger className="h-10 text-xs bg-card">
                                <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                <SelectItem value="Authentication">Authentication</SelectItem>
                                <SelectItem value="Marketing">Marketing</SelectItem>
                                <SelectItem value="Transactional">Transactional</SelectItem>
                                <SelectItem value="Alert">Alert</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Grid List */}
                {isLoading ? (
                    <TemplateGridSkeleton />
                ) : filteredTemplates.length === 0 ? (
                    <div className="text-center py-20 bg-card border border-border/30 rounded">
                        <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                        <h3 className="text-sm  text-foreground">{loadError ? "Unable to load templates" : "No templates found"}</h3>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                            {loadError instanceof Error ? loadError.message : "Create a new template or adjust your search filters to get started."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredTemplates.map((template) => (
                            <Card
                                key={template.id}
                                onClick={() => openViewPanel(template)}
                                className="bg-card border border-border/40 hover:border-border/80 transition-all rounded duration-150 cursor-pointer shadow-sm flex flex-col justify-between group"
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex gap-1">
                                            <Badge className={cn("text-[10px] px-2 py-0 border-none font-semibold rounded-full", getCategoryBadgeClass(template.category))}>
                                                {template.category}
                                            </Badge>
                                            {template.channel === "whatsapp" && (
                                                <Badge className="text-[10px] px-2 py-0 border-none font-semibold rounded-full bg-emerald-500/10 text-emerald-600">
                                                    WhatsApp
                                                </Badge>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                                            <Activity className="w-3 h-3 text-primary/70" />
                                            {template.usageCount} uses
                                        </span>
                                    </div>
                                    <CardTitle className="text-sm  mt-2 text-foreground group-hover:text-primary transition-colors">
                                        {template.name}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pb-4">
                                    <p className="text-xs text-muted-foreground line-clamp-3 font-medium min-h-[48px]">
                                        {template.content}
                                    </p>
                                </CardContent>
                                <div className="px-6 py-3 border-t border-border/10 flex items-center justify-between text-[11px] text-muted-foreground font-medium bg-muted/10">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground/75" />
                                        Last used: {template.lastUsed.split(" ")[0]}
                                    </span>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEditPanel(template);
                                            }}
                                            className="text-muted-foreground hover:text-primary p-1 rounded hover:bg-muted"
                                            title="Edit"
                                        >
                                            <Edit className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(template.id);
                                            }}
                                            className="text-muted-foreground hover:text-rose-500 p-1 rounded hover:bg-muted"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </main>

            {/* Right Drawer Slide-out Panel */}
            <div
                className={cn(
                    "fixed inset-0 z-50 transition-opacity duration-300",
                    isPanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            >
                {/* Backdrop Overlay */}
                <div
                    onClick={closePanel}
                    className={cn(
                        "absolute inset-0 bg-black/45 backdrop-blur-[1.5px] transition-opacity duration-300",
                        isPanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                />

                {/* Sliding Panel */}
                <div
                    className={cn(
                        "absolute inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-card border-l border-border/80 shadow-2xl flex flex-col h-full transition-transform duration-300 ease-in-out transform",
                        isPanelOpen ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
                    )}
                >
                    {/* Panel Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
                        <div>
                            <h2 className="text-sm  text-foreground">
                                {panelMode === "view" && "Template Details"}
                                {panelMode === "edit" && "Edit Template"}
                                {panelMode === "create" && "Create Template"}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                                {panelMode === "view" && "Preview your SMS template and delivery segments"}
                                {(panelMode === "edit" || panelMode === "create") && "Draft text content using curly brace variables"}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={closePanel}
                            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Panel Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {panelMode === "view" && activeTemplate && (
                            <>
                                {/* View Details Mode */}
                                <div className="space-y-1">
                                    <span className="text-[10px]  text-muted-foreground uppercase tracking-widest block">Template Name</span>
                                    <h3 className="text-base font-black text-foreground">{activeTemplate.name}</h3>
                                    <div className="flex gap-2 mt-2">
                                        <Badge className={cn("text-[10px] px-2 py-0 border-none font-semibold rounded-full", getCategoryBadgeClass(activeTemplate.category))}>
                                            {activeTemplate.category}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px]  text-muted-foreground uppercase tracking-widest block">Original Content</span>
                                    <div className="bg-muted/30 border border-border/30 rounded p-4 text-xs font-medium font-sans text-foreground leading-relaxed whitespace-pre-wrap select-all">
                                        {activeTemplate.content}
                                    </div>
                                </div>

                                {activeTemplate.variables.length > 0 && (
                                    <div className="space-y-2">
                                        <span className="text-[10px]  text-muted-foreground uppercase tracking-widest block">Dynamic Placeholders</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {activeTemplate.variables.map((v) => (
                                                <Badge key={v} variant="outline" className="font-mono text-[10px] py-0 border-primary/20 text-primary bg-primary/5">
                                                    {`{${v}}`}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}


                                {/* Info List */}
                                <div className="grid grid-cols-2 gap-4 border-t border-border/10 pt-4">
                                    <div className="bg-muted/10 border border-border/0 p-3 text-center">
                                        <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Total Usage</span>
                                        <span className="text-lg font-black text-foreground">{activeTemplate.usageCount}</span>
                                    </div>
                                    <div className="bg-muted/10 border border-border/0 p-3 text-center">
                                        <span className="text-[10px] text-muted-foreground font-semibold block uppercase">
                                            {activeTemplate.channel === "whatsapp" ? "Characters" : "SMS Segments"}
                                        </span>
                                        <span className="text-lg font-black text-foreground">
                                            {activeTemplate.channel === "whatsapp"
                                                ? activeTemplate.content.length
                                                : activeTemplate.content.length <= 160 ? 1 : Math.ceil(activeTemplate.content.length / 153)}
                                        </span>
                                    </div>
                                </div>

                                {/* Action Footer */}
                                <div className="flex gap-2 pt-4 border-t border-border/10">
                                    <Button
                                        onClick={() => openEditPanel(activeTemplate)}
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 gap-1.5 text-xs font-semibold h-10"
                                    >
                                        <Edit className="w-3.5 h-3.5 text-primary" />
                                        Edit Template
                                    </Button>
                                    <Button
                                        onClick={() => sendWithTemplate(activeTemplate, "sms")}
                                        size="sm"
                                        variant={activeTemplate.channel === "sms" ? "default" : "outline"}
                                        className="flex-1 gap-1.5 text-xs font-semibold h-10"
                                    >
                                        <Share2 className="w-3.5 h-3.5" />
                                        Send as SMS
                                    </Button>
                                </div>
                                <Button
                                    onClick={() => sendWithTemplate(activeTemplate, "whatsapp")}
                                    size="sm"
                                    className={cn(
                                        "w-full gap-1.5 text-xs font-semibold h-10",
                                        activeTemplate.channel === "whatsapp"
                                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                            : "bg-card text-emerald-700 border border-emerald-500/40 hover:bg-emerald-500/10"
                                    )}
                                >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    Send on WhatsApp
                                </Button>
                            </>
                        )}

                        {(panelMode === "edit" || panelMode === "create") && (
                            <form onSubmit={handleSave} className="space-y-5">
                                {/* Channel */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">Channel</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(["sms", "whatsapp"] as const).filter((value) => value !== "whatsapp" || whatsappTemplates).map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setFormChannel(value)}
                                                className={cn(
                                                    "h-10 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors",
                                                    formChannel === value
                                                        ? value === "whatsapp" ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-primary bg-primary/5 text-primary"
                                                        : "border-border/60 text-muted-foreground hover:bg-muted/20"
                                                )}
                                            >
                                                {value === "whatsapp" ? <MessageCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                                {value === "sms" ? "SMS" : "WhatsApp"}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Form fields */}
                                <div className="space-y-2">
                                    <Label htmlFor="tpl-form-name" className="text-xs font-semibold">
                                        Template Name <span className="text-rose-500">*</span>
                                    </Label>
                                    <Input
                                        id="tpl-form-name"
                                        placeholder="e.g. OTP Verification"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        className="h-10 text-xs bg-card"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="tpl-form-category" className="text-xs font-semibold">
                                        Category
                                    </Label>
                                    <Select
                                        value={formCategory}
                                        onValueChange={(val: any) => setFormCategory(val)}
                                    >
                                        <SelectTrigger className="h-10 text-xs bg-card">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Authentication">Authentication</SelectItem>
                                            <SelectItem value="Marketing">Marketing</SelectItem>
                                            <SelectItem value="Transactional">Transactional</SelectItem>
                                            <SelectItem value="Alert">Alert</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="tpl-form-content" className="text-xs font-semibold">
                                            Template Body Content <span className="text-rose-500">*</span>
                                        </Label>
                                        <span className="text-[10px] text-muted-foreground font-semibold">
                                            {isWhatsAppForm
                                                ? `${charCount} / 4096 chars`
                                                : `${charCount} chars | ${segments} segment${segments > 1 ? "s" : ""}`}
                                        </span>
                                    </div>
                                    <div className="relative">
                                        <Textarea
                                            id="tpl-form-content"
                                            ref={textareaRef}
                                            placeholder="Compose your message template body here. Wrap variables in curly braces like {code} or {name}. Or tap Help me write."
                                            value={formContent}
                                            onChange={(e) => setFormContent(e.target.value)}
                                            className="min-h-40 text-xs bg-card leading-relaxed resize-none pb-11"
                                            required
                                        />
                                        <HelpMeWrite
                                            content={formContent}
                                            channel={formChannel}
                                            category={formCategory}
                                            onResult={handleAIResult}
                                            className="absolute bottom-2.5 right-2.5 shadow-sm"
                                        />
                                    </div>

                                    {/* Suggestions Row */}
                                    <div className="space-y-1.5 pt-1">
                                        <span className="text-[9px]  text-muted-foreground uppercase block">Insert Dynamic Placeholder:</span>
                                        <div className="flex flex-wrap gap-1">
                                            {SUGGESTED_VARIABLES.map((v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => insertVariable(v)}
                                                    className="font-mono text-[9px] px-2 py-0.5 rounded border border-border/50 bg-muted/40 hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground"
                                                >
                                                    +{v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={cn("flex justify-between items-center text-[10px] text-muted-foreground font-medium pt-1", isWhatsAppForm && "hidden")}>
                                        <span>
                                            {charsRemaining} chars left in current segment
                                        </span>
                                        {segments > 1 && (
                                            <span className="text-amber-500 font-semibold">
                                                Multi-segment rates will apply
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Form Action Buttons */}
                                <div className="flex gap-2 pt-4 border-t border-border/10">
                                    <Button
                                        type="button"
                                        onClick={closePanel}
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 text-xs font-semibold h-10"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        className="flex-1 text-xs font-semibold h-10"
                                    >
                                        Save Template
                                    </Button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
