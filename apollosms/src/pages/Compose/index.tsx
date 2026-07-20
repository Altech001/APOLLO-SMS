import { ContactGroupResponse, ContactResponse, renultApi, TemplateResponse } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
    Check,
    Coins,
    FileText,
    Layers,
    Loader2,
    Plus,
    RefreshCw,
    Send,
    Trash2,
    Users,
    X
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Contact {
    id: string;
    name: string;
    phone: string;
    email: string;
    groups: string[];
}

const toContact = (contact: ContactResponse): Contact => ({
    id: contact.id,
    name: contact.name || contact.full_name || "Unnamed Contact",
    phone: contact.phone || contact.phone_number || "",
    email: contact.email || "",
    groups: contact.groups || contact.group_ids || [],
});

const toGroup = (group: ContactGroupResponse, contacts: Contact[]) => ({
    id: group.id,
    name: group.name,
    count: group.contact_count ?? contacts.filter((contact) => contact.groups.includes(group.id)).length,
});

const toTemplate = (template: TemplateResponse) => ({
    id: template.id,
    name: template.name,
    category: template.category,
    content: template.content,
});

export default function ComposeIndex() {
    const location = useLocation();
    const navigate = useNavigate();
    const consumedNavigationState = useRef<string | null>(null);

    // Sidebar state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    // Form States
    const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
    const [messageText, setMessageText] = useState("LUCOSMS: ");
    const [senderId, setSenderId] = useState("ATInfo");
    const [batchSize, setBatchSize] = useState("100");
    const [walletBalance, setWalletBalance] = useState(0);
    const [smsBalance, setSmsBalance] = useState(0);
    const [costPerSms, setCostPerSms] = useState(31);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Array<{ id: string; name: string; count: number }>>([]);
    const [templates, setTemplates] = useState<Array<{ id: string; name: string; category: string; content: string }>>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Sliding Panel State
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [panelType, setPanelType] = useState<"numbers" | "groups" | "templates">("numbers");

    // Bulk / Use Numbers state
    const [bulkNumbersText, setBulkNumbersText] = useState("");

    // Template custom variables state
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
    const [tempVarName, setTempVarName] = useState("John");
    const [tempVarCode, setTempVarCode] = useState("9812");
    const [tempVarAmount, setTempVarAmount] = useState("15,000");
    const [tempVarDate, setTempVarDate] = useState("15th June");

    // Sending Progress Simulation
    const [isSending, setIsSending] = useState(false);
    const [sendStage, setSendStage] = useState("");
    const [sendProgress, setSendProgress] = useState(0);

    useEffect(() => {
        let mounted = true;
        setIsLoadingData(true);
        Promise.all([
            renultApi.wallet.get(),
            renultApi.contacts.list(),
            renultApi.contactGroups.list(),
            renultApi.templates.list(),
            renultApi.apiSettings.smsProviders(),
        ])
            .then(([wallet, contactsData, groupsData, templatesData, apiSettings]) => {
                if (!mounted) return;
                const nextContacts = contactsData.map(toContact);
                setWalletBalance(wallet.cash_balance);
                setSmsBalance(wallet.sms_balance);
                setCostPerSms(apiSettings.cost_per_sms || 31);
                setContacts(nextContacts);
                setGroups(groupsData.map((group) => toGroup(group, nextContacts)));
                setTemplates(templatesData.map(toTemplate));
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Unable to load compose data");
            })
            .finally(() => {
                if (mounted) setIsLoadingData(false);
            });
        return () => { mounted = false; };
    }, []);

    // Auto-adjust Batch Size according to selected contacts count
    useEffect(() => {
        if (selectedContacts.length > 0) {
            setBatchSize(selectedContacts.length.toString());
        } else {
            setBatchSize("100");
        }
    }, [selectedContacts.length]);

    // Load initial values from navigation state if present
    useEffect(() => {
        const state = location.state as { initialRecipient?: string; initialText?: string } | null;
        if (!state?.initialRecipient && !state?.initialText) return;
        if (isLoadingData && state.initialRecipient) return;

        const stateKey = `${location.key}:${state.initialRecipient || ""}:${state.initialText || ""}`;
        if (consumedNavigationState.current === stateKey) return;
        consumedNavigationState.current = stateKey;

        if (state.initialRecipient) {
            const found = contacts.find(c => c.phone === state.initialRecipient);
            const nextContact: Contact = found || {
                id: `manual-${Date.now()}`,
                name: "Quick Recipient",
                phone: state.initialRecipient,
                email: "",
                groups: []
            };

            setSelectedContacts(prev => {
                const exists = prev.some(c => c.id === nextContact.id || c.phone === nextContact.phone);
                return exists ? prev : [...prev, nextContact];
            });
            toast.success(`Loaded recipient: ${state.initialRecipient}`);
        }
        if (state.initialText) {
            setMessageText(state.initialText);
            toast.success("Loaded SMS template text");
        }
        navigate("/compose", { replace: true, state: null });
    }, [contacts, isLoadingData, location.key, location.state, navigate]);

    // SMS segments / length calculations
    const smsDetails = useMemo(() => {
        const text = messageText;
        const len = text.length;
        if (len === 0) return { segments: 0, remaining: 160 };
        if (len <= 160) {
            return { segments: 1, remaining: 160 - len };
        }
        const segments = Math.ceil(len / 153);
        const remaining = (segments * 153) - len;
        return { segments, remaining };
    }, [messageText]);

    const totalCost = selectedContacts.length * smsDetails.segments * costPerSms;
    const totalSmsUnits = selectedContacts.length * smsDetails.segments;
    const requiredCash = Math.max(0, totalSmsUnits - smsBalance) * costPerSms;

    // Auto formatter function for bulk inputs
    const formatPhoneNumber = (num: string): string => {
        let cleaned = num.trim().replace(/[^\d+]/g, ""); // Keep only digits and '+'
        if (!cleaned) return "";

        // If it already starts with '+', keep it
        if (cleaned.startsWith("+")) return cleaned;

        // If it starts with '0' (e.g. 0700 -> +256700)
        if (cleaned.startsWith("0")) {
            return "+256" + cleaned.substring(1);
        }

        // If it starts with '7' and is relatively short or normal
        if (cleaned.startsWith("7")) {
            return "+256" + cleaned;
        }

        // If it starts with '256'
        if (cleaned.startsWith("256")) {
            return "+" + cleaned;
        }

        // General fallback
        return "+" + cleaned;
    };

    // Bulk numbers import handler
    const handleBulkNumbersImport = (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkNumbersText.trim()) {
            toast.error("Please enter at least one phone number");
            return;
        }

        // Split by comma, newline, spaces, or semicolon
        const rawTokens = bulkNumbersText.split(/[,\s;\n]+/);
        const addedList = [...selectedContacts];
        let addedCount = 0;

        rawTokens.forEach((token) => {
            const formatted = formatPhoneNumber(token);
            if (formatted && formatted.length > 2) {
                // Prevent duplicate addition
                if (!addedList.some(c => c.phone === formatted)) {
                    addedList.push({
                        id: `bulk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        name: `Recipient ${formatted}`,
                        phone: formatted,
                        email: "",
                        groups: []
                    });
                    addedCount++;
                }
            }
        });

        setSelectedContacts(addedList);
        setBulkNumbersText("");
        setIsPanelOpen(false);

        if (addedCount > 0) {
            toast.success(`Successfully formatted and imported ${addedCount} numbers!`);
        } else {
            toast.info("No new unique numbers were found or added.");
        }
    };

    const handleImportFromGroup = (groupId: string) => {
        const groupContacts = contacts.filter(c => c.groups.includes(groupId));

        let addedCount = 0;
        const updatedList = [...selectedContacts];

        groupContacts.forEach(gc => {
            if (!updatedList.some(c => c.id === gc.id)) {
                updatedList.push(gc);
                addedCount++;
            }
        });

        setSelectedContacts(updatedList);
        setIsPanelOpen(false);
        if (addedCount > 0) {
            toast.success(`Imported ${addedCount} contacts from group`);
        } else {
            toast.info("All contacts from this group are already added");
        }
    };

    const handleRemoveContact = (id: string) => {
        setSelectedContacts(selectedContacts.filter(c => c.id !== id));
    };

    const handleClearAll = () => {
        setSelectedContacts([]);
        setMessageText("LUCOSMS: ");
        toast.info("Cleared composition parameters");
    };

    const handleLoadTemplate = () => {
        const tmpl = templates.find(t => t.id === selectedTemplateId);
        if (!tmpl) return;

        let content = tmpl.content;
        content = content.replace(/{name}/g, tempVarName);
        content = content.replace(/{code}/g, tempVarCode);
        content = content.replace(/{amount}/g, tempVarAmount);
        content = content.replace(/{date}/g, tempVarDate);

        setMessageText(content);
        setIsPanelOpen(false);
        toast.success("Template variables injected successfully");
    };

    const submitSms = async (scheduledFor?: string | null) => {
        if (selectedContacts.length === 0) {
            toast.error("Please add at least one recipient");
            return false;
        }
        if (!messageText.trim() || messageText.trim() === "LUCOSMS:") {
            toast.error("Please compose a message content");
            return false;
        }
        if (requiredCash > walletBalance) {
            toast.error("Insufficient wallet balance for this broadcast");
            return false;
        }

        const result = await renultApi.sms.send({
            recipients: selectedContacts.map((contact) => ({
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                groups: contact.groups,
            })),
            message: messageText.trim(),
            sender_id: senderId.trim() || "Default",
            scheduled_for: scheduledFor,
        });
        setWalletBalance(result.wallet.cash_balance);
        setSmsBalance(result.wallet.sms_balance);
        window.dispatchEvent(new CustomEvent("renult-wallet-change"));
        setSelectedContacts([]);
        setMessageText("LUCOSMS: ");
        return true;
    };

    const handleSendMessage = async () => {
        if (selectedContacts.length === 0 || !messageText.trim() || messageText.trim() === "LUCOSMS:" || requiredCash > walletBalance) {
            await submitSms(null);
            return;
        }

        setIsSending(true);
        setSendProgress(0);
        setSendStage("Initializing gateway route...");
        try {
            setSendProgress(35);
            setSendStage("Validating recipient numbers...");
            setSendProgress(65);
            setSendStage(`Sending batches (Batch size: ${batchSize})...`);
            const recipientCount = selectedContacts.length;
            const ok = await submitSms(null);
            if (!ok) return;
            setSendProgress(100);
            setSendStage("Broadcast queued successfully!");
            toast.success(`Queued ${recipientCount} message${recipientCount === 1 ? "" : "s"} for delivery`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to send broadcast");
        } finally {
            setTimeout(() => setIsSending(false), 600);
        }
    };

    const openPanel = (type: "numbers" | "groups" | "templates") => {
        setPanelType(type);
        setIsPanelOpen(true);
    };

    const handleQueueMessage = async () => {
        try {
            const queuedCount = selectedContacts.length;
            const ok = await submitSms(null);
            if (ok) toast.success(`Added ${queuedCount} message${queuedCount === 1 ? "" : "s"} to the queue`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to queue broadcast");
        }
    };

    return (
        <div
            className={cn(
                "min-h-screen bg-background transition-all duration-300",
                sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
            )}
        >
            <SEO title="Bulk Message Compose" />
            <AppHeader onCreateForm={() => { }} />

            <main className="max-w-8xl mx-auto px-4 sm:px-6 py-6">
                {/* Header Title */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-base font-black tracking-tight text-foreground sm:text-xl">
                            Bulk Message Compose
                        </h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            Import contacts, compose messages, use templates, and send messages in bulk with ease.
                        </p>
                    </div>
                </div>

                {/* 2-Column Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Contacts Selector */}
                    <Card className="lg:col-span-1 border-border/10 shadow-sm rounded-none flex flex-col min-h-[480px]">
                        <CardHeader className="pb-3 border-b border-border/10 flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle className="text-sm font-bold">
                                    Contacts ({selectedContacts.length})
                                </CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">
                                    Broadcast recipients list
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => groups[0] && handleImportFromGroup(groups[0].id)}
                                    disabled={groups.length === 0 || isLoadingData}
                                    title="Import first group"
                                    className="h-9 w-9 rounded-full border-border/80"
                                >
                                    <RefreshCw className="w-3.5 h-3.5 text-primary" />
                                </Button>
                                <Button
                                    onClick={() => openPanel("numbers")}
                                    size="sm"
                                    className="h-10 text-xs font-bold gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Use Numbers
                                </Button>
                            </div>
                        </CardHeader>

                        {/* Contacts List Scroll Area */}
                        <CardContent className="flex-1 p-4 overflow-y-auto max-h-[380px]">
                            {selectedContacts.length === 0 ? (
                                <div className="h-64 border border-dashed border-border/80 rounded flex flex-col items-center justify-center text-center p-4">
                                    <div className="p-3 bg-muted/40 rounded-full text-muted-foreground/60 mb-2">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <p className="text-xs font-bold text-foreground">No recipients selected</p>
                                    <p className="text-[10px] text-muted-foreground mt-1 max-w-[180px]">
                                        Import contacts from a group or add numbers manually to get started.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {selectedContacts.map((contact) => (
                                        <div
                                            key={contact.id}
                                            className="flex items-center justify-between p-2 rounded border border-border/50 hover:bg-muted/10 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-primary/5 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                                                    {contact.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-foreground truncate">{contact.name}</p>
                                                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{contact.phone}</p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveContact(contact.id)}
                                                className="h-7 w-7 rounded-full text-muted-foreground hover:text-rose-500"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>

                        {/* Left Column Footer */}
                        <div className="p-4 border-t border-border/10 bg-muted/5 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <span className="text-[12px] font-semibold text-muted-foreground">
                                {selectedContacts.length} contacts selected
                            </span>
                            <Button
                                onClick={() => openPanel("groups")}
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto h-10 text-xs font-semibold border-border/80"
                            >
                                <Users className="w-3.5 h-3.5 mr-1.5 text-primary" />
                                Import From Group
                            </Button>
                        </div>
                    </Card>

                    {/* Right Column - Message Composer */}
                    <Card className="lg:col-span-2 border-border/20 rounded shadow-sm flex flex-col justify-between">
                        <CardHeader className="pb-3 border-b border-border/10 flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle className="text-sm font-bold">
                                    Composing to {selectedContacts.length} contacts
                                </CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">
                                    Draft message contents and configure broadcasting options
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    onClick={() => openPanel("templates")}
                                    variant="outline"
                                    size="sm"
                                    className="h-10 text-xs font-bold border-border/80"
                                >
                                    <FileText className="w-3.5 h-3.5 mr-1" />
                                    Use Template
                                </Button>
                                <Button
                                    onClick={handleClearAll}
                                    variant="outline"
                                    size="sm"
                                    className="h-10 text-xs font-bold text-rose-500 border-rose-200/50 bg-rose-50 hover:bg-rose-50/50"
                                >
                                    Clear All
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="p-5 space-y-4">
                            {/* Intermediate Config Panel */}
                            <div className="p-3 bg-muted/15 border border-border/30 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-[12px] font-semibold text-muted-foreground">Recipient Grouping</p>
                                    <p className="text-xs font-semibold text-foreground">
                                        To: {selectedContacts.filter(c => c.groups.length > 0).length} group contacts, {selectedContacts.filter(c => c.groups.length === 0).length} manual numbers
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="sender-id" className="text-[12px] font-bold text-muted-foreground">Sender ID</Label>
                                        <Input
                                            id="sender-id"
                                            value={senderId}
                                            onChange={(e) => setSenderId(e.target.value)}
                                            className="h-8 text-xs bg-card w-28 text-center font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="batch-size" className="text-[12px] font-bold text-muted-foreground">Batch Size</Label>
                                        <Input
                                            id="batch-size"
                                            value={batchSize}
                                            onChange={(e) => setBatchSize(e.target.value)}
                                            className="h-8 text-xs bg-card w-20 text-center font-semibold font-mono"
                                        />
                                    </div>

                                </div>
                            </div>

                            {/* SMS Textarea Input */}
                            <div className="space-y-2">
                                <Label htmlFor="sms-compose-text" className="text-xs font-semibold">Message Text</Label>
                                <div className="relative border border-border rounded overflow-hidden bg-card focus-within:ring-1 focus-within:ring-primary">
                                    <textarea
                                        id="sms-compose-text"
                                        rows={6}
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        className="w-full p-3 text-xs bg-transparent focus:outline-none resize-none leading-normal"
                                        placeholder="Compose your SMS broadcast text here..."
                                    />
                                    {/* Textarea info footer */}
                                    <div className="px-3 py-2 border-t border-border/20 bg-muted/5 flex items-center justify-between text-[10px] text-muted-foreground">
                                        <span className="font-semibold text-primary/90 flex items-center gap-1">
                                            <Layers className="w-3 h-3" />
                                            SMS Segment {smsDetails.segments}
                                        </span>
                                        <div className="flex gap-4">
                                            <span>{smsDetails.remaining} characters remaining</span>
                                            <span>
                                                Units: <b className="text-foreground font-mono">{totalSmsUnits.toLocaleString()}</b>
                                            </span>
                                            <span>
                                                Cost: <b className="text-foreground font-mono">{totalCost.toLocaleString()} UGX</b>
                                                <span className="text-[9px] text-muted-foreground/80"> (at {costPerSms.toLocaleString()} UGX/segment)</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Wallet will reserve SMS credits first ({smsBalance.toLocaleString()} available), then cash balance if credits are not enough. Cash needed now: UGX {requiredCash.toLocaleString()}.
                                </p>
                            </div>
                        </CardContent>

                        {/* Broadcast Dispatch Footer */}
                        <div className="px-5 py-4 border-t border-border/10 bg-muted/15 flex items-center justify-between">
                            <div className="text-[10px] font-bold text-muted-foreground uppercase">
                                Dispatch to {selectedContacts.length} numbers
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleQueueMessage}
                                    className="h-10 text-xs font-bold border-border/80 bg-card"
                                    disabled={selectedContacts.length === 0 || isSending || isLoadingData}
                                >
                                    Queue ({selectedContacts.length})
                                </Button>
                                <Button
                                    onClick={handleSendMessage}
                                    className="h-10 text-xs font-black gap-1.5"
                                    disabled={selectedContacts.length === 0 || isSending || isLoadingData}
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Send Message
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </main>

            {/* --- SLIDING PANEL OVERLAY --- */}
            {isPanelOpen && (
                <div
                    onClick={() => setIsPanelOpen(false)}
                    className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] transition-opacity"
                />
            )}

            <div
                className={cn(
                    "fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out transform",
                    isPanelOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Panel Header */}
                <div className="px-6 py-4 border-b border-border/10 flex items-center justify-between bg-muted/5">
                    <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            {panelType === "numbers" && <Plus className="w-4 h-4 text-primary" />}
                            {panelType === "groups" && <Users className="w-4 h-4 text-primary" />}
                            {panelType === "templates" && <FileText className="w-4 h-4 text-primary" />}
                            {panelType === "numbers" && "Bulk Number Import"}
                            {panelType === "groups" && "Import Group Contacts"}
                            {panelType === "templates" && "Use SMS Template"}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            {panelType === "numbers" && "Paste multiple numbers to auto-format and import"}
                            {panelType === "groups" && "Load all numbers mapped to a contact group"}
                            {panelType === "templates" && "Select a template and input variables to inject"}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsPanelOpen(false)}
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Panel Body Content */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                    {/* PANEL TYPE: NUMBERS */}
                    {panelType === "numbers" && (
                        <form onSubmit={handleBulkNumbersImport} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="bulk-numbers-input" className="text-xs font-semibold">
                                    Enter Numbers
                                </Label>
                                <textarea
                                    id="bulk-numbers-input"
                                    rows={8}
                                    value={bulkNumbersText}
                                    onChange={(e) => setBulkNumbersText(e.target.value)}
                                    className="w-full p-3 text-sm bg-muted/10 border border-border rounded focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                                    placeholder="Paste bulk numbers here (e.g. 0700..., 777..., 256... separated by comma, spaces, or newline)"
                                />
                            </div>

                            <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded text-xs leading-normal space-y-1">
                                <p className="font-bold text-foreground">Auto Formatter Helper:</p>
                                <ul className="list-disc pl-4 space-y-0.5 font-mono">
                                    <li>0700xxxxxx &rarr; +256700xxxxxx</li>
                                    <li>777xxxxxx &rarr; +256777xxxxxx</li>
                                    <li>256xxxxxxxxx &rarr; +256xxxxxxxxx</li>
                                </ul>
                            </div>

                            <div className="pt-4 border-t border-border/10 flex justify-end gap-2">
                                <Button
                                    type="button"
                                    onClick={() => setIsPanelOpen(false)}
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-xs font-semibold border-rose-200 text-rose-500"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="h-9 text-xs font-semibold"
                                >
                                    Format & Import
                                </Button>
                            </div>
                        </form>
                    )}

                    {/* PANEL TYPE: GROUPS */}
                    {panelType === "groups" && (
                        <div className="space-y-2">
                            {groups.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-8">
                                    {isLoadingData ? "Loading groups..." : "No contact groups available."}
                                </p>
                            )}
                            {groups.map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => handleImportFromGroup(group.id)}
                                    className="w-full flex items-center justify-between p-3.5 rounded-lg border border-border/60 hover:bg-muted/10 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/5 text-primary rounded-md">
                                            <Users className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-foreground">{group.name}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{group.count} contacts in group</p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold text-primary hover:underline">Import &rarr;</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* PANEL TYPE: TEMPLATES */}
                    {panelType === "templates" && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Select Template</Label>
                                <div className="space-y-2">
                                    {templates.length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-8">
                                            {isLoadingData ? "Loading templates..." : "No templates available."}
                                        </p>
                                    )}
                                    {templates.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setSelectedTemplateId(t.id)}
                                            className={cn(
                                                "w-full p-3 rounded border text-left flex items-start gap-3 transition-all",
                                                selectedTemplateId === t.id
                                                    ? "border-primary bg-primary/5 text-primary"
                                                    : "border-border/60 hover:bg-muted/10"
                                            )}
                                        >
                                            <div className="p-1.5 bg-muted rounded shrink-0">
                                                <FileText className="w-4 h-4 text-muted-foreground" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold">{t.name}</p>
                                                <p className="text-[9px] text-muted-foreground font-mono mt-0.5 truncate">{t.content}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {selectedTemplateId && (
                                <div className="space-y-3 pt-3 border-t border-border/10">
                                    <Label className="text-xs font-semibold block uppercase tracking-wider text-muted-foreground text-[9px]">
                                        Inject Custom Parameters
                                    </Label>

                                    {selectedTemplateId === "t1" && (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="var-code" className="text-xs">Security Verification Code ({"{code}"})</Label>
                                            <Input
                                                id="var-code"
                                                value={tempVarCode}
                                                onChange={(e) => setTempVarCode(e.target.value)}
                                                className="h-9 text-xs font-mono"
                                            />
                                        </div>
                                    )}

                                    {selectedTemplateId === "t2" && (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="var-name" className="text-xs">Recipient Name ({"{name}"})</Label>
                                            <Input
                                                id="var-name"
                                                value={tempVarName}
                                                onChange={(e) => setTempVarName(e.target.value)}
                                                className="h-9 text-xs"
                                            />
                                        </div>
                                    )}

                                    {selectedTemplateId === "t3" && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="var-amount-name" className="text-xs">Name ({"{name}"})</Label>
                                                <Input
                                                    id="var-amount-name"
                                                    value={tempVarName}
                                                    onChange={(e) => setTempVarName(e.target.value)}
                                                    className="h-9 text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="var-amount" className="text-xs">Amount UGX ({"{amount}"})</Label>
                                                <Input
                                                    id="var-amount"
                                                    value={tempVarAmount}
                                                    onChange={(e) => setTempVarAmount(e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="col-span-2 space-y-1.5">
                                                <Label htmlFor="var-date" className="text-xs">Due Date ({"{date}"})</Label>
                                                <Input
                                                    id="var-date"
                                                    value={tempVarDate}
                                                    onChange={(e) => setTempVarDate(e.target.value)}
                                                    className="h-9 text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {selectedTemplateId === "t4" && (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="var-w-name" className="text-xs">Recipient Name ({"{name}"})</Label>
                                            <Input
                                                id="var-w-name"
                                                value={tempVarName}
                                                onChange={(e) => setTempVarName(e.target.value)}
                                                className="h-9 text-xs"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pt-4 border-t border-border/10 flex justify-end gap-2">
                                <Button
                                    type="button"
                                    onClick={() => setIsPanelOpen(false)}
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-xs font-semibold"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleLoadTemplate}
                                    disabled={!selectedTemplateId}
                                    size="sm"
                                    className="h-9 text-xs font-semibold"
                                >
                                    Inject Template
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Broadcast Dispatch Sending Progress Modal */}
            {isSending && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
                    <Card className="w-full max-w-sm border border-border/50 bg-card rounded shadow-2xl relative z-10 overflow-hidden text-center p-6 space-y-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                            {sendProgress < 100 ? (
                                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            ) : (
                                <Check className="w-6 h-6 text-emerald-500 font-bold" />
                            )}
                        </div>

                        <div className="space-y-1">
                            <h3 className="text-sm font-bold text-foreground">
                                {sendProgress < 100 ? "Sending Broadcast" : "Broadcast Complete!"}
                            </h3>
                            <p className="text-[10px] text-muted-foreground">{sendStage}</p>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
                                <span>Progress</span>
                                <span className="font-mono">{sendProgress}%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${sendProgress}%` }}
                                />
                            </div>
                        </div>

                        <div className="text-[9px] text-muted-foreground leading-normal bg-muted/20 p-2 rounded border border-border/50 max-w-[280px] mx-auto">
                            Broadcasting message content using Sender ID <b>{senderId}</b>. Dispatched to <b>{selectedContacts.length}</b> devices.
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
