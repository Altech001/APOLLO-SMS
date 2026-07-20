import { ContactGroupResponse, ContactResponse, renultApi } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    Edit,
    FolderPlus,
    FolderTree,
    Loader2,
    Mail,
    MessageSquare,
    Phone,
    Plus,
    Search,
    Tag,
    Trash2,
    Upload,
    UserPlus,
    Users,
    X
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Contact {
    id: string;
    name: string;
    phone: string;
    email: string;
    groups: string[]; // Group IDs
    createdAt: string;
}

interface ContactGroup {
    id: string;
    name: string;
    description: string;
    color: string;
}

const GROUP_COLORS = [
    "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    "bg-amber-500/10 text-amber-500 border-amber-500/20",
    "bg-pink-500/10 text-pink-500 border-pink-500/20",
    "bg-purple-500/10 text-purple-500 border-purple-500/20",
    "bg-rose-500/10 text-rose-500 border-rose-500/20",
];

const toContact = (contact: ContactResponse): Contact => ({
    id: contact.id,
    name: contact.name || contact.full_name || "Unnamed Contact",
    phone: contact.phone || contact.phone_number || "",
    email: contact.email || "",
    groups: contact.groups || contact.group_ids || [],
    createdAt: (contact.createdAt || contact.created_at || "").slice(0, 10),
});

const toGroup = (group: ContactGroupResponse, index = 0): ContactGroup => ({
    id: group.id,
    name: group.name,
    description: group.description || "",
    color: group.color || GROUP_COLORS[index % GROUP_COLORS.length],
});

export default function MyContactsIndex() {
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<ContactGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const loadContacts = async () => {
        setIsLoading(true);
        setLoadError("");
        try {
            const [contactsData, groupsData] = await Promise.all([
                renultApi.contacts.list(),
                renultApi.contactGroups.list(),
            ]);
            setContacts(contactsData.map(toContact));
            setGroups(groupsData.map(toGroup));
        } catch (error) {
            setContacts([]);
            setGroups([]);
            setLoadError(error instanceof Error ? error.message : "Unable to load contacts");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadContacts();
    }, []);

    // Filter States
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all"); // 'all' | 'ungrouped' | group.id
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

    // Contact Drawer Panel State
    const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
    const [contactPanelMode, setContactPanelMode] = useState<"view" | "edit" | "create">("view");
    const [activeContact, setActiveContact] = useState<Contact | null>(null);

    // Contact Form State
    const [contactFormName, setContactFormName] = useState("");
    const [contactFormPhone, setContactFormPhone] = useState("");
    const [contactFormEmail, setContactFormEmail] = useState("");
    const [contactFormGroups, setContactFormGroups] = useState<string[]>([]);

    // Group Modal/Dialog State
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [groupModalMode, setGroupModalMode] = useState<"create" | "edit">("create");
    const [activeGroup, setActiveGroup] = useState<ContactGroup | null>(null);
    const [groupFormName, setGroupFormName] = useState("");
    const [groupFormDesc, setGroupFormDesc] = useState("");
    const [groupFormColor, setGroupFormColor] = useState(GROUP_COLORS[0]);

    // Bulk Group Assignment state
    const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
    const [bulkAssignGroupId, setBulkAssignGroupId] = useState("");

    // Bulk Import State
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importMethod, setImportMethod] = useState<"paste" | "file">("paste");
    const [importPasteText, setImportPasteText] = useState("");
    const [importGroupId, setImportGroupId] = useState("none");

    // Parser: runs whenever importPasteText changes
    const parsedContacts = useMemo(() => {
        if (!importPasteText.trim()) return [];

        const lines = importPasteText.split("\n");
        const list: Array<{ name: string; phone: string; email: string; valid: boolean }> = [];

        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Simple parse: Name, Phone, Email
            const parts = trimmed.split(",").map((p) => p.trim());
            let name = "";
            let phone = "";
            let email = "";

            if (parts.length >= 3) {
                name = parts[0];
                phone = parts[1];
                email = parts[2];
            } else if (parts.length === 2) {
                name = parts[0];
                phone = parts[1];
            } else {
                // Just one part, check if it looks like a phone number
                phone = parts[0];
                name = "Imported Contact";
            }

            // Basic phone validation: needs at least some digits
            const hasDigits = /\d+/.test(phone);
            list.push({
                name: name || "Imported Contact",
                phone: phone,
                email: email,
                valid: hasDigits && phone.length >= 7,
            });
        });

        return list;
    }, [importPasteText]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setImportPasteText(text);
            setImportMethod("paste");
            toast.success("File parsed successfully! Review the parsed contacts below.");
        };
        reader.onerror = () => {
            toast.error("Failed to read file.");
        };
        reader.readAsText(file);
    };

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const validToImport = parsedContacts.filter((c) => c.valid);
        if (validToImport.length === 0) {
            toast.error("No valid contacts found to import.");
            return;
        }

        try {
            const created = await renultApi.contacts.bulkCreate({
                contacts: validToImport.map((pc) => ({
                    name: pc.name,
                    phone: pc.phone,
                    email: pc.email,
                    groups: importGroupId && importGroupId !== "none" ? [importGroupId] : [],
                })),
            });
            setContacts([...created.map(toContact), ...contacts]);
            toast.success(`Successfully imported ${validToImport.length} contacts!`);
            setIsImportModalOpen(false);
            setImportPasteText("");
            setImportGroupId("none");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to import contacts");
        }
    };


    // Filters computed contacts
    const filteredContacts = useMemo(() => {
        return contacts.filter((c) => {
            const matchesSearch =
                c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.phone.includes(searchQuery) ||
                c.email.toLowerCase().includes(searchQuery.toLowerCase());

            let matchesGroup = true;
            if (selectedGroupFilter === "ungrouped") {
                matchesGroup = c.groups.length === 0;
            } else if (selectedGroupFilter !== "all") {
                matchesGroup = c.groups.includes(selectedGroupFilter);
            }

            return matchesSearch && matchesGroup;
        });
    }, [contacts, searchQuery, selectedGroupFilter]);

    // Bulk selection handlers
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedContacts(filteredContacts.map((c) => c.id));
        } else {
            setSelectedContacts([]);
        }
    };

    const handleSelectContact = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedContacts([...selectedContacts, id]);
        } else {
            setSelectedContacts(selectedContacts.filter((cId) => cId !== id));
        }
    };

    // Contacts operations
    const openViewContact = (contact: Contact) => {
        setActiveContact(contact);
        setContactPanelMode("view");
        setIsContactPanelOpen(true);
    };

    const openCreateContact = () => {
        setActiveContact(null);
        setContactFormName("");
        setContactFormPhone("");
        setContactFormEmail("");
        setContactFormGroups(selectedGroupFilter !== "all" && selectedGroupFilter !== "ungrouped" ? [selectedGroupFilter] : []);
        setContactPanelMode("create");
        setIsContactPanelOpen(true);
    };

    const openEditContact = (contact: Contact) => {
        setActiveContact(contact);
        setContactFormName(contact.name);
        setContactFormPhone(contact.phone);
        setContactFormEmail(contact.email);
        setContactFormGroups(contact.groups);
        setContactPanelMode("edit");
        setIsContactPanelOpen(true);
    };

    const handleSaveContact = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contactFormName.trim() || !contactFormPhone.trim()) {
            toast.error("Name and Phone Number are required.");
            return;
        }

        const payload = {
            name: contactFormName.trim(),
            phone: contactFormPhone.trim(),
            email: contactFormEmail.trim(),
            groups: contactFormGroups,
        };

        try {
            if (contactPanelMode === "create") {
                const created = await renultApi.contacts.create(payload);
                setContacts([toContact(created), ...contacts]);
                toast.success("Contact created successfully");
            } else if (contactPanelMode === "edit" && activeContact) {
                const updated = await renultApi.contacts.update(activeContact.id, payload);
                setContacts(contacts.map((c) => c.id === activeContact.id ? toContact(updated) : c));
                toast.success("Contact updated successfully");
            }
            setIsContactPanelOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save contact");
        }
    };

    const handleDeleteContact = async (id: string) => {
        if (confirm("Are you sure you want to delete this contact?")) {
            try {
                await renultApi.contacts.delete(id);
                setContacts(contacts.filter((c) => c.id !== id));
                setSelectedContacts(selectedContacts.filter((cId) => cId !== id));
                toast.success("Contact deleted");
                setIsContactPanelOpen(false);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to delete contact");
            }
        }
    };

    // Group operations
    const openCreateGroup = () => {
        setActiveGroup(null);
        setGroupFormName("");
        setGroupFormDesc("");
        setGroupFormColor(GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]);
        setGroupModalMode("create");
        setIsGroupModalOpen(true);
    };

    const openEditGroup = (group: ContactGroup, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveGroup(group);
        setGroupFormName(group.name);
        setGroupFormDesc(group.description);
        setGroupFormColor(group.color);
        setGroupModalMode("edit");
        setIsGroupModalOpen(true);
    };

    const handleSaveGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupFormName.trim()) {
            toast.error("Group Name is required");
            return;
        }

        const payload = {
            name: groupFormName.trim(),
            description: groupFormDesc.trim(),
            color: groupFormColor,
        };

        try {
            if (groupModalMode === "create") {
                const created = await renultApi.contactGroups.create(payload);
                setGroups([...groups, toGroup(created, groups.length)]);
                toast.success("Group created successfully");
            } else if (groupModalMode === "edit" && activeGroup) {
                const updated = await renultApi.contactGroups.update(activeGroup.id, payload);
                setGroups(groups.map((g) => g.id === activeGroup.id ? toGroup(updated) : g));
                toast.success("Group updated successfully");
            }
            setIsGroupModalOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save group");
        }
    };

    const handleDeleteGroup = async (groupId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this group? The contacts inside this group will not be deleted.")) {
            try {
                await renultApi.contactGroups.delete(groupId);
                setGroups(groups.filter((g) => g.id !== groupId));
                setContacts(
                    contacts.map((c) => ({
                        ...c,
                        groups: c.groups.filter((gId) => gId !== groupId),
                    }))
                );
                if (selectedGroupFilter === groupId) {
                    setSelectedGroupFilter("all");
                }
                toast.success("Group deleted successfully");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to delete group");
            }
        }
    };

    // Bulk Operations Actions
    const handleBulkDelete = async () => {
        if (confirm(`Are you sure you want to delete the ${selectedContacts.length} selected contacts?`)) {
            try {
                await renultApi.contacts.bulkDelete(selectedContacts);
                setContacts(contacts.filter((c) => !selectedContacts.includes(c.id)));
                setSelectedContacts([]);
                toast.success("Selected contacts deleted");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to delete selected contacts");
            }
        }
    };

    const handleBulkAssignGroup = async () => {
        if (!bulkAssignGroupId) return;

        if (bulkAssignGroupId === "new-group") {
            setIsBulkAssignOpen(false);
            openCreateGroup();
            return;
        }

        try {
            await renultApi.contacts.assignGroup(selectedContacts, bulkAssignGroupId);
            setContacts(
                contacts.map((c) => {
                    if (selectedContacts.includes(c.id)) {
                        const nextGroups = c.groups.includes(bulkAssignGroupId)
                            ? c.groups
                            : [...c.groups, bulkAssignGroupId];
                        return { ...c, groups: nextGroups };
                    }
                    return c;
                })
            );
            setSelectedContacts([]);
            setIsBulkAssignOpen(false);
            toast.success("Contacts added to group successfully");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to assign contacts to group");
        }
    };

    const toggleGroupSelectionInForm = (groupId: string) => {
        if (contactFormGroups.includes(groupId)) {
            setContactFormGroups(contactFormGroups.filter((id) => id !== groupId));
        } else {
            setContactFormGroups([...contactFormGroups, groupId]);
        }
    };

    // Helper count of contacts in group
    const getGroupContactCount = (groupId: string) => {
        return contacts.filter((c) => c.groups.includes(groupId)).length;
    };

    const ungroupedCount = contacts.filter((c) => c.groups.length === 0).length;

    return (
        <div
            className={cn(
                "min-h-screen bg-background transition-all duration-300",
                sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
            )}
        >
            <SEO title="My Contacts" />
            <AppHeader onCreateForm={() => { }} />

            <main className="max-w-screen mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                            My Contacts
                        </h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            Manage your message recipients, organize them into segments, and dispatch broadcasts.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={openCreateGroup}
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-9 font-semibold text-xs border-border/80"
                        >
                            <FolderPlus className="w-4 h-4 text-primary" />
                            Add Group
                        </Button>
                        <Button
                            onClick={() => setIsImportModalOpen(true)}
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-9 font-semibold text-xs border-border/80"
                        >
                            <Upload className="w-4 h-4 text-primary" />
                            Import Contacts
                        </Button>
                        <Button
                            onClick={openCreateContact}
                            size="sm"
                            className="gap-1.5 h-9 font-semibold text-xs"
                        >
                            <UserPlus className="w-4 h-4" />
                            Add Contact
                        </Button>
                    </div>
                </div>

                {/* 2-Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    {/* LEFT COLUMN: Groups Sidebar */}
                    <Card className="lg:col-span-1 border border-border/40 bg-card rounded shadow-none">
                        <CardHeader className="pb-3 border-b border-border/10">
                            <CardTitle className="text-xs font-bold  text-muted-foreground flex items-center gap-1.5">
                                Contact Groups
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 space-y-1">
                            {/* All Contacts Item */}
                            <button
                                onClick={() => setSelectedGroupFilter("all")}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded transition-colors text-left",
                                    selectedGroupFilter === "all"
                                        ? "bg-primary/10 text-primary"
                                        : "text-foreground/80 hover:bg-muted/50"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5" />
                                    All Contacts
                                </span>
                                <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                    {contacts.length}
                                </span>
                            </button>

                            {/* Ungrouped Contacts Item */}
                            <button
                                onClick={() => setSelectedGroupFilter("ungrouped")}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded transition-colors text-left",
                                    selectedGroupFilter === "ungrouped"
                                        ? "bg-primary/10 text-primary"
                                        : "text-foreground/80 hover:bg-muted/50"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    <Tag className="w-3.5 h-3.5" />
                                    Ungrouped
                                </span>
                                <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                    {ungroupedCount}
                                </span>
                            </button>

                            <div className="border-t border-border/10 my-2 pt-2" />

                            {/* Custom Groups List */}
                            {groups.map((group) => {
                                const isActive = selectedGroupFilter === group.id;
                                return (
                                    <div
                                        key={group.id}
                                        onClick={() => setSelectedGroupFilter(group.id)}
                                        className={cn(
                                            "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded transition-colors text-left cursor-pointer group",
                                            isActive ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted/50"
                                        )}
                                    >
                                        <span className="flex items-center gap-2 truncate">
                                            <span className={cn("w-2 h-2 rounded-full border border-current", group.color.split(" ")[1])} />
                                            <span className="truncate">{group.name}</span>
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                                {getGroupContactCount(group.id)}
                                            </span>
                                            {/* Edit/Delete hover action triggers */}
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 items-center">
                                                <button
                                                    onClick={(e) => openEditGroup(group, e)}
                                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                                                >
                                                    <Edit className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteGroup(group.id, e)}
                                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-rose-500"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {groups.length === 0 && (
                                <p className="text-[10px] text-muted-foreground text-center py-4">
                                    No groups created yet.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* RIGHT COLUMN: Contacts Registry Table */}
                    <div className="lg:col-span-3 space-y-4">
                        {/* Toolbar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search contacts by name, phone or email..."
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
                        </div>

                        {/* Bulk Actions Panel Overlay */}
                        {selectedContacts.length > 0 && (
                            <div className="bg-primary/5 border border-primary/10 rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
                                <span className="text-xs text-primary font-semibold">
                                    {selectedContacts.length} contacts selected
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Assign to Group dropdown */}
                                    <div className="flex items-center gap-1.5">
                                        <Select value={bulkAssignGroupId} onValueChange={setBulkAssignGroupId}>
                                            <SelectTrigger className="h-8 text-[11px] bg-card w-40">
                                                <SelectValue placeholder="Add to Group..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {groups.map((g) => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                        {g.name}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value="new-group" className="text-primary font-bold">
                                                    + Create New Group
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            onClick={handleBulkAssignGroup}
                                            disabled={!bulkAssignGroupId}
                                            size="sm"
                                            className="h-8 text-[11px] px-2.5 font-bold"
                                        >
                                            Assign
                                        </Button>
                                    </div>

                                    <Button
                                        onClick={handleBulkDelete}
                                        variant="destructive"
                                        size="sm"
                                        className="h-8 text-[11px] px-2.5 font-bold"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                                        Delete Selected
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Contacts Table Card */}
                        <Card className="border border-border/10 shadow-none overflow-hidden rounded">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead className="w-[50px] text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={filteredContacts.length > 0 && selectedContacts.length === filteredContacts.length}
                                                    onChange={(e) => handleSelectAll(e.target.checked)}
                                                    className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                                                />
                                            </TableHead>
                                            <TableHead className="text-xs font-bold">Name</TableHead>
                                            <TableHead className="text-xs font-bold">Phone Number</TableHead>
                                            <TableHead className="text-xs font-bold">Email</TableHead>
                                            <TableHead className="text-xs font-bold">Groups</TableHead>
                                            <TableHead className="text-xs font-bold">Added Date</TableHead>
                                            <TableHead className="w-[120px] text-right text-xs font-bold">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-xs font-medium">
                                                    <Loader2 className="w-8 h-8 mx-auto mb-2 text-primary/70 animate-spin" />
                                                    Loading contacts from the API.
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredContacts.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-xs font-medium">
                                                    <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                                                    {loadError || "No contacts found matching search or filter constraints."}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredContacts.map((contact) => {
                                                const isSelected = selectedContacts.includes(contact.id);
                                                return (
                                                    <TableRow
                                                        key={contact.id}
                                                        className={cn(
                                                            "hover:bg-muted/15 transition-colors cursor-pointer",
                                                            isSelected ? "bg-primary/5 hover:bg-primary/5" : ""
                                                        )}
                                                        onClick={() => openViewContact(contact)}
                                                    >
                                                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={(e) => handleSelectContact(contact.id, e.target.checked)}
                                                                className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-semibold text-xs text-foreground">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">
                                                                    {contact.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <span>{contact.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs text-foreground/80">{contact.phone}</TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">{contact.email || "—"}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                                                                {contact.groups.map((gId) => {
                                                                    const group = groups.find((g) => g.id === gId);
                                                                    if (!group) return null;
                                                                    return (
                                                                        <Badge
                                                                            key={gId}
                                                                            variant="outline"
                                                                            className={cn("text-[9px] px-1.5 py-0 border-none font-semibold rounded-full shrink-0", group.color)}
                                                                        >
                                                                            {group.name}
                                                                        </Badge>
                                                                    );
                                                                })}
                                                                {contact.groups.length === 0 && (
                                                                    <span className="text-[10px] text-muted-foreground/60 italic">None</span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">{contact.createdAt}</TableCell>
                                                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <button
                                                                    onClick={() => {
                                                                        toast.success(`Opening Compose Message for ${contact.name}...`);
                                                                        navigate("/compose", { state: { initialRecipient: contact.phone } });
                                                                    }}
                                                                    className="text-muted-foreground hover:text-primary p-1 rounded hover:bg-muted transition-colors"
                                                                    title="Send Message"
                                                                >
                                                                    <MessageSquare className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => openEditContact(contact)}
                                                                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors"
                                                                    title="Edit Contact"
                                                                >
                                                                    <Edit className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteContact(contact.id)}
                                                                    className="text-muted-foreground hover:text-rose-500 p-1 rounded hover:bg-muted transition-colors"
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>
                    </div>
                </div>
            </main>

            {/* Right Drawer Contact Details Panel */}
            <div
                className={cn(
                    "fixed inset-0 z-50 transition-opacity duration-300",
                    isContactPanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            >
                {/* Backdrop Overlay */}
                <div
                    onClick={() => setIsContactPanelOpen(false)}
                    className={cn(
                        "absolute inset-0 bg-black/45 backdrop-blur-[1.5px] transition-opacity duration-300",
                        isContactPanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                />

                {/* Sliding Panel */}
                <div
                    className={cn(
                        "absolute inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-card border-l border-border/80 shadow-2xl flex flex-col h-full transition-transform duration-300 ease-in-out transform",
                        isContactPanelOpen ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
                    )}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
                        <div>
                            <h2 className="text-sm font-bold text-foreground">
                                {contactPanelMode === "view" && "Contact Details"}
                                {contactPanelMode === "edit" && "Edit Contact"}
                                {contactPanelMode === "create" && "Create Contact"}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                                {contactPanelMode === "view" && "Recipients details and message analytics"}
                                {(contactPanelMode === "edit" || contactPanelMode === "create") && "Input numbers using phone format"}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsContactPanelOpen(false)}
                            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Body Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {contactPanelMode === "view" && activeContact && (
                            <>
                                {/* Big Avatar Header */}
                                <div className="flex flex-col items-center text-center space-y-2 border-b border-border/10 pb-6">
                                    <div className="w-16 h-16 rounded-full bg-primary/15 text-primary flex items-center justify-center font-black text-xl border border-primary/20 shadow-sm">
                                        {activeContact.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-foreground">{activeContact.name}</h3>
                                        <span className="text-[10px] text-muted-foreground font-medium">Recipient since {activeContact.createdAt}</span>
                                    </div>
                                </div>

                                {/* Details List */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded bg-muted/60 text-muted-foreground shrink-0">
                                            <Phone className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Phone Number</span>
                                            <span className="font-mono text-sm font-bold text-foreground">{activeContact.phone}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded bg-muted/60 text-muted-foreground shrink-0">
                                            <Mail className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Email Address</span>
                                            <span className="text-sm font-semibold text-foreground">{activeContact.email || "No email provided"}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Groups List */}
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase  block">Associated Groups</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {activeContact.groups.map((gId) => {
                                            const group = groups.find((g) => g.id === gId);
                                            if (!group) return null;
                                            return (
                                                <Badge key={gId} variant="outline" className={cn("text-[10px] py-0.5 border-none font-semibold rounded-full", group.color)}>
                                                    {group.name}
                                                </Badge>
                                            );
                                        })}
                                        {activeContact.groups.length === 0 && (
                                            <span className="text-xs text-muted-foreground italic">None assigned. Edit contact to add groups.</span>
                                        )}
                                    </div>
                                </div>

                                {/* Mock Message History */}
                                <div className="space-y-3 pt-2">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase  block">Recent Messages Sent</span>
                                    <div className="border border-border/30 rounded overflow-hidden divide-y divide-border/20">
                                        <div className="p-3 bg-muted/10 text-xs">
                                            <div className="flex justify-between font-semibold mb-1">
                                                <span className="text-emerald-500">Delivered</span>
                                                <span className="text-muted-foreground text-[10px]">Today, 10:14 AM</span>
                                            </div>
                                            <p className="text-muted-foreground leading-relaxed line-clamp-2">
                                                Hey {activeContact.name.split(" ")[0]}, your verification code for LUCOSMS is 4920.
                                            </p>
                                        </div>
                                        <div className="p-3 bg-muted/10 text-xs">
                                            <div className="flex justify-between font-semibold mb-1">
                                                <span className="text-emerald-500">Delivered</span>
                                                <span className="text-muted-foreground text-[10px]">Jun 03, 14:10 PM</span>
                                            </div>
                                            <p className="text-muted-foreground leading-relaxed line-clamp-2">
                                                Welcome to LUCOSMS, {activeContact.name.split(" ")[0]}! We're thrilled to have you.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* View Actions Footer */}
                                <div className="flex gap-2 pt-4 border-t border-border/10">
                                    <Button
                                        onClick={() => openEditContact(activeContact)}
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 gap-1.5 text-xs font-semibold h-10"
                                    >
                                        <Edit className="w-3.5 h-3.5 text-primary" />
                                        Edit Details
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            toast.success(`Redirecting to Message Composer...`);
                                            navigate("/compose", { state: { initialRecipient: activeContact.phone } });
                                        }}
                                        size="sm"
                                        className="flex-1 gap-1.5 text-xs font-semibold h-10"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        Send Message
                                    </Button>
                                </div>
                            </>
                        )}

                        {(contactPanelMode === "edit" || contactPanelMode === "create") && (
                            <form onSubmit={handleSaveContact} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="con-form-name" className="text-xs font-semibold">
                                        Full Name <span className="text-rose-500">*</span>
                                    </Label>
                                    <Input
                                        id="con-form-name"
                                        placeholder="e.g. John Doe"
                                        value={contactFormName}
                                        onChange={(e) => setContactFormName(e.target.value)}
                                        className="h-10 text-xs bg-card"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="con-form-phone" className="text-xs font-semibold">
                                        Phone Number <span className="text-rose-500">*</span>
                                    </Label>
                                    <Input
                                        id="con-form-phone"
                                        placeholder="e.g. +256 701 234567"
                                        value={contactFormPhone}
                                        onChange={(e) => setContactFormPhone(e.target.value)}
                                        className="h-10 text-xs bg-card"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="con-form-email" className="text-xs font-semibold">
                                        Email Address
                                    </Label>
                                    <Input
                                        id="con-form-email"
                                        type="email"
                                        placeholder="e.g. john@example.com"
                                        value={contactFormEmail}
                                        onChange={(e) => setContactFormEmail(e.target.value)}
                                        className="h-10 text-xs bg-card"
                                    />
                                </div>

                                {/* Group Selector checkboxes */}
                                <div className="space-y-2.5">
                                    <Label className="text-xs font-semibold block">Assign to Groups</Label>
                                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-2">
                                        {groups.map((g) => {
                                            const isAssigned = contactFormGroups.includes(g.id);
                                            return (
                                                <div
                                                    key={g.id}
                                                    onClick={() => toggleGroupSelectionInForm(g.id)}
                                                    className={cn(
                                                        "flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors text-xs font-semibold",
                                                        isAssigned
                                                            ? "border-primary bg-primary/5 text-primary"
                                                            : "border-border/60 hover:bg-muted/40"
                                                    )}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isAssigned}
                                                        onChange={() => { }} // handled by div onClick
                                                        className="rounded text-primary focus:ring-primary w-3.5 h-3.5 pointer-events-none"
                                                    />
                                                    <span className="truncate">{g.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {groups.length === 0 && (
                                        <p className="text-[10px] text-muted-foreground italic">No groups available. Create groups first.</p>
                                    )}
                                </div>

                                {/* Form Action Footer */}
                                <div className="flex gap-2 pt-4 border-t border-border/10">
                                    <Button
                                        type="button"
                                        onClick={() => setIsContactPanelOpen(false)}
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
                                        Save Contact
                                    </Button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>

            {/* Group Modal (Create / Edit Groups Dialog) */}
            {isGroupModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        onClick={() => setIsGroupModalOpen(false)}
                        className="absolute inset-0 bg-black/50 backdrop-blur-[1.5px] transition-opacity"
                    />

                    {/* Modal Content */}
                    <Card className="w-full max-w-sm border border-border/50 bg-card rounded shadow-2xl relative z-10 overflow-hidden">
                        <CardHeader className="pb-3 border-b border-border/10 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-bold">
                                    {groupModalMode === "create" ? "Add New Group" : "Edit Group Details"}
                                </CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">
                                    Organize contacts by tag identifiers
                                </CardDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsGroupModalOpen(false)}
                                className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                            >
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </CardHeader>

                        <form onSubmit={handleSaveGroup}>
                            <CardContent className="p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="grp-form-name" className="text-xs font-semibold">
                                        Group Name <span className="text-rose-500">*</span>
                                    </Label>
                                    <Input
                                        id="grp-form-name"
                                        placeholder="e.g. Sales Team"
                                        value={groupFormName}
                                        onChange={(e) => setGroupFormName(e.target.value)}
                                        className="h-9 text-xs bg-card"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="grp-form-desc" className="text-xs font-semibold">
                                        Description
                                    </Label>
                                    <Input
                                        id="grp-form-desc"
                                        placeholder="Brief group description..."
                                        value={groupFormDesc}
                                        onChange={(e) => setGroupFormDesc(e.target.value)}
                                        className="h-9 text-xs bg-card"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold block">Select Badge Color</Label>
                                    <div className="flex gap-2 justify-between">
                                        {GROUP_COLORS.map((color) => (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={() => setGroupFormColor(color)}
                                                className={cn(
                                                    "w-7 h-7 rounded-full border flex items-center justify-center transition-all",
                                                    groupFormColor === color ? "border-primary ring-2 ring-primary/20 scale-110" : "border-border hover:scale-105"
                                                )}
                                                style={{ backgroundColor: "transparent" }}
                                            >
                                                <span className={cn("w-3.5 h-3.5 rounded-full", color.split(" ")[1])} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>

                            <div className="px-5 py-3 border-t border-border/10 bg-muted/15 flex justify-end gap-2">
                                <Button
                                    type="button"
                                    onClick={() => setIsGroupModalOpen(false)}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs font-semibold h-8"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="text-xs font-semibold h-8"
                                >
                                    Save Group
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* Bulk Contacts Import Modal */}
            {isImportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        onClick={() => {
                            setIsImportModalOpen(false);
                            setImportPasteText("");
                            setImportGroupId("none");
                        }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-[1.5px] transition-opacity"
                    />

                    {/* Modal Content */}
                    <Card className="w-full max-w-lg border border-border/50 bg-card rounded shadow-2xl relative z-10 overflow-hidden">
                        <CardHeader className="pb-3 border-b border-border/10 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                                    <Upload className="w-4 h-4 text-primary" />
                                    Bulk Contacts Import
                                </CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">
                                    Import multiple contacts via text copy-paste or by uploading a CSV/TXT file.
                                </CardDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                    setIsImportModalOpen(false);
                                    setImportPasteText("");
                                    setImportGroupId("none");
                                }}
                                className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                            >
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </CardHeader>

                        <form onSubmit={handleImportSubmit} className="space-y-4">
                            <CardContent className="p-5 space-y-4 max-h-[75vh] overflow-y-auto pr-2">
                                {/* Tab selector */}
                                <div className="flex border-b border-border/30 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => setImportMethod("paste")}
                                        className={cn(
                                            "flex-1 pb-2 text-xs font-bold text-center border-b-2 transition-all",
                                            importMethod === "paste"
                                                ? "border-primary text-primary"
                                                : "border-transparent text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Copy & Paste Text
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setImportMethod("file")}
                                        className={cn(
                                            "flex-1 pb-2 text-xs font-bold text-center border-b-2 transition-all",
                                            importMethod === "file"
                                                ? "border-primary text-primary"
                                                : "border-transparent text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Upload CSV/TXT
                                    </button>
                                </div>

                                {importMethod === "paste" ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="import-paste" className="text-xs font-semibold">
                                            Paste Contacts Content
                                        </Label>
                                        <textarea
                                            id="import-paste"
                                            placeholder="Format: Name, Phone, Email (one per line)&#10;e.g. John Doe, +256 701 234567, john@doe.com&#10;Or just phone numbers:&#10;+256 772 987654"
                                            value={importPasteText}
                                            onChange={(e) => setImportPasteText(e.target.value)}
                                            className="w-full min-h-24 text-xs font-mono bg-card border border-border rounded p-2 focus:ring-1 focus:ring-primary focus:outline-none resize-none leading-relaxed"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Upload Contact File</Label>
                                        <div className="border border-dashed border-border/80 rounded-lg p-6 text-center hover:bg-muted/10 transition-colors relative cursor-pointer">
                                            <input
                                                type="file"
                                                accept=".csv,.txt"
                                                onChange={handleFileUpload}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                            />
                                            <Upload className="w-8 h-8 mx-auto text-primary/70 mb-2" />
                                            <p className="text-xs font-bold text-foreground">Click to select CSV or TXT file</p>
                                            <p className="text-[10px] text-muted-foreground mt-1">Accepts standard comma-separated lines</p>
                                        </div>
                                    </div>
                                )}

                                {/* Assign to group selection */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Assign to Group (Optional)</Label>
                                    <Select value={importGroupId} onValueChange={setImportGroupId}>
                                        <SelectTrigger className="h-9 text-xs bg-card">
                                            <SelectValue placeholder="Do not assign group" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Do not assign group</SelectItem>
                                            {groups.map((g) => (
                                                <SelectItem key={g.id} value={g.id}>
                                                    {g.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Parsed Contacts Live Preview grid */}
                                {parsedContacts.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-border/10">
                                        <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                                            <span>Parsed Preview</span>
                                            <span>
                                                {parsedContacts.filter((c) => c.valid).length} valid / {parsedContacts.length} total
                                            </span>
                                        </div>

                                        <div className="border border-border/30 rounded max-h-36 overflow-y-auto bg-muted/10">
                                            <Table className="text-[10px]">
                                                <TableHeader className="bg-muted/30">
                                                    <TableRow>
                                                        <TableHead className="py-1 font-bold">Name</TableHead>
                                                        <TableHead className="py-1 font-bold">Phone</TableHead>
                                                        <TableHead className="py-1 font-bold">Email</TableHead>
                                                        <TableHead className="py-1 font-bold text-right">Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {parsedContacts.map((pc, idx) => (
                                                        <TableRow key={idx} className="hover:bg-transparent">
                                                            <TableCell className="py-1.5 font-semibold">{pc.name}</TableCell>
                                                            <TableCell className="py-1.5 font-mono">{pc.phone}</TableCell>
                                                            <TableCell className="py-1.5 text-muted-foreground">{pc.email || "—"}</TableCell>
                                                            <TableCell className="py-1.5 text-right">
                                                                {pc.valid ? (
                                                                    <span className="text-emerald-500 font-bold">Valid</span>
                                                                ) : (
                                                                    <span className="text-rose-500 font-bold" title="Invalid phone format">Invalid</span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                            </CardContent>

                            <div className="px-5 py-3 border-t border-border/10 bg-muted/15 flex justify-end gap-2">
                                <Button
                                    type="button"
                                    onClick={() => {
                                        setIsImportModalOpen(false);
                                        setImportPasteText("");
                                        setImportGroupId("none");
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs font-semibold h-8"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={parsedContacts.filter((c) => c.valid).length === 0}
                                    size="sm"
                                    className="text-xs font-semibold h-8"
                                >
                                    Import {parsedContacts.filter((c) => c.valid).length} Contacts
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
