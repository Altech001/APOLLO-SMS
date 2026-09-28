import { ContactGroupResponse, ContactResponse, renultApi } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Loader2, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

/** A recipient picked from the user's saved contacts. */
export interface PickedContact {
    id: string;
    name: string;
    phone: string;
    email: string;
    groups: string[];
}

export interface ContactPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Receives the chosen contacts (whole groups are expanded to their members, deduplicated by phone). */
    onConfirm: (contacts: PickedContact[]) => void;
    /** Phones already on the recipient list; shown as added. */
    existingPhones?: string[];
}

const toPicked = (contact: ContactResponse): PickedContact => ({
    id: contact.id,
    name: contact.name || contact.full_name || "Unnamed contact",
    phone: contact.phone || contact.phone_number || "",
    email: contact.email || "",
    groups: contact.groups || contact.group_ids || [],
});

/** Dialog to add recipients from saved contacts or whole contact groups. */
export default function ContactPicker({ open, onOpenChange, onConfirm, existingPhones = [] }: ContactPickerProps) {
    const [tab, setTab] = useState<"groups" | "contacts">("groups");
    const [contacts, setContacts] = useState<PickedContact[]>([]);
    const [groups, setGroups] = useState<ContactGroupResponse[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [groupFilter, setGroupFilter] = useState<string>("all");
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!open) return;
        setSearch("");
        setGroupFilter("all");
        setSelectedGroupIds(new Set());
        setSelectedContactIds(new Set());
        setIsLoading(true);
        Promise.all([renultApi.contacts.list(), renultApi.contactGroups.list()])
            .then(([contactsData, groupsData]: [ContactResponse[], ContactGroupResponse[]]) => {
                setContacts(contactsData.map(toPicked).filter((c) => c.phone));
                setGroups(groupsData);
                if (groupsData.length === 0) setTab("contacts");
            })
            .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to load contacts"))
            .finally(() => setIsLoading(false));
    }, [open]);

    const existing = useMemo(() => new Set(existingPhones), [existingPhones]);

    const visibleContacts = useMemo(() => {
        const q = search.trim().toLowerCase();
        return contacts.filter((c) => {
            if (groupFilter !== "all" && !c.groups.includes(groupFilter)) return false;
            return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q);
        });
    }, [contacts, search, groupFilter]);

    const visibleGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return groups.filter((g) => !q || g.name.toLowerCase().includes(q));
    }, [groups, search]);

    // Everything the confirm button would add: selected contacts plus members of selected groups.
    const picked = useMemo(() => {
        const byPhone = new Map<string, PickedContact>();
        for (const c of contacts) {
            if (selectedContactIds.has(c.id) || c.groups.some((g) => selectedGroupIds.has(g))) {
                byPhone.set(c.phone, c);
            }
        }
        return Array.from(byPhone.values());
    }, [contacts, selectedContactIds, selectedGroupIds]);
    const newCount = picked.filter((c) => !existing.has(c.phone)).length;

    const toggle = (set: Set<string>, id: string, update: (next: Set<string>) => void) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        update(next);
    };

    const allVisibleSelected = visibleContacts.length > 0 && visibleContacts.every((c) => selectedContactIds.has(c.id));
    const toggleAllVisible = () => {
        const next = new Set(selectedContactIds);
        for (const c of visibleContacts) {
            if (allVisibleSelected) next.delete(c.id);
            else next.add(c.id);
        }
        setSelectedContactIds(next);
    };

    const handleConfirm = () => {
        onConfirm(picked);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg rounded p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-5 pb-3">
                    <DialogTitle className="text-base">Add from contacts</DialogTitle>
                    <DialogDescription className="text-xs">
                        Pick whole groups or individual contacts. <Link to="/my-contacts" className="text-primary hover:underline">Manage contacts</Link>
                    </DialogDescription>
                </DialogHeader>

                <div className="px-5 space-y-3">
                    <div className="grid grid-cols-2 gap-1 p-1 rounded border border-border/50">
                        {(["groups", "contacts"] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setTab(value)}
                                className={cn(
                                    "h-8 rounded text-xs font-semibold",
                                    tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
                                )}
                            >
                                {value === "groups" ? `Groups (${groups.length})` : `Contacts (${contacts.length})`}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tab === "groups" ? "Search groups" : "Search name, phone or email"}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>
                    {tab === "contacts" && groups.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                            {[{ id: "all", name: "All" }, ...groups].map((g) => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setGroupFilter(g.id)}
                                    className={cn(
                                        "h-7 px-2.5 rounded-full border text-[11px] whitespace-nowrap",
                                        groupFilter === g.id ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"
                                    )}
                                >
                                    {g.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="h-[340px] overflow-y-auto px-5 py-3 space-y-1.5">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : tab === "groups" ? (
                        visibleGroups.length === 0 ? (
                            <EmptyState text={groups.length === 0 ? "No contact groups yet." : "No groups match your search."} />
                        ) : visibleGroups.map((g) => {
                            const selected = selectedGroupIds.has(g.id);
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => toggle(selectedGroupIds, g.id, setSelectedGroupIds)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-2.5 rounded border text-left transition-colors",
                                        selected ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/20"
                                    )}
                                >
                                    <CheckBox checked={selected} />
                                    <div className="p-1.5 rounded bg-primary/10 text-primary"><Users className="w-4 h-4" /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold truncate">{g.name}</p>
                                        <p className="text-[10px] text-muted-foreground">{g.contact_count ?? 0} contacts</p>
                                    </div>
                                </button>
                            );
                        })
                    ) : visibleContacts.length === 0 ? (
                        <EmptyState text={contacts.length === 0 ? "No saved contacts yet." : "No contacts match your filters."} />
                    ) : (
                        <>
                            <button type="button" onClick={toggleAllVisible} className="text-[11px] font-semibold text-primary hover:underline mb-1">
                                {allVisibleSelected ? "Clear selection" : `Select all ${visibleContacts.length} shown`}
                            </button>
                            {visibleContacts.map((c) => {
                                const selected = selectedContactIds.has(c.id);
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => toggle(selectedContactIds, c.id, setSelectedContactIds)}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-2 rounded border text-left transition-colors",
                                            selected ? "border-primary bg-primary/5" : "border-border/40 hover:bg-muted/20"
                                        )}
                                    >
                                        <CheckBox checked={selected} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs truncate">{c.name}</p>
                                            <p className="text-[10px] text-muted-foreground font-mono">{c.phone}</p>
                                        </div>
                                        {existing.has(c.phone) && <span className="text-[9px] text-muted-foreground">already added</span>}
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>

                <DialogFooter className="p-4 border-t border-border/30 flex-row items-center justify-between sm:justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                        {picked.length} selected{picked.length !== newCount ? ` · ${newCount} new` : ""}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" className="h-9 text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button className="h-9 text-xs" disabled={newCount === 0} onClick={handleConfirm}>
                            Add {newCount} recipient{newCount === 1 ? "" : "s"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CheckBox({ checked }: { checked: boolean }) {
    return (
        <span className={cn(
            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
            checked ? "bg-primary border-primary text-primary-foreground" : "border-border"
        )}>
            {checked && <Check className="w-3 h-3" />}
        </span>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-xs text-muted-foreground">
            <Users className="w-7 h-7 opacity-50" />
            <p>{text}</p>
            <Link to="/my-contacts" className="text-primary hover:underline">Go to Contacts</Link>
        </div>
    );
}
