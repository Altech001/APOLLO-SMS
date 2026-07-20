import {
  BranchResponse,
  renultApi,
  TicketCategoryResponse,
  TicketResponse,
} from "@/api/apollosms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Calendar, Clock, Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

type Priority = "LOW" | "MEDIUM" | "HIGH";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function Campign() {
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [categories, setCategories] = useState<TicketCategoryResponse[]>([]);
  const [tickets, setTickets] = useState<TicketResponse[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(localStorage.getItem("selected-workspace"));
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) || branches[0],
    [branches, selectedBranchId],
  );

  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name || "campaign";

  const loadMeta = async () => {
    setIsLoading(true);
    try {
      const [branchData, categoryData] = await Promise.all([
        renultApi.branches.list(),
        renultApi.tickets.categories(),
      ]);
      setBranches(branchData);
      setCategories(categoryData);
      setCategoryId((current) => current || categoryData[0]?.id || "");

      const saved = localStorage.getItem("selected-workspace");
      const nextBranch = branchData.find((branch) => branch.id === saved) || branchData[0];
      if (nextBranch) {
        setSelectedBranchId(nextBranch.id);
        localStorage.setItem("selected-workspace", nextBranch.id);
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to load campaign setup"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadTickets = async (branchId: string) => {
    try {
      setTickets(await renultApi.tickets.list(branchId));
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to load campaigns"));
    }
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => {
    if (selectedBranch?.id) loadTickets(selectedBranch.id);
  }, [selectedBranch?.id]);

  const selectBranch = (branchId: string) => {
    const branch = branches.find((item) => item.id === branchId);
    setSelectedBranchId(branchId);
    localStorage.setItem("selected-workspace", branchId);
    if (branch) window.dispatchEvent(new CustomEvent("renult-branch-change", { detail: branch }));
  };

  const resetForm = () => {
    setCategoryId(categories[0]?.id || "");
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBranch) {
      toast.error("create or select a branch first");
      return;
    }
    if (!categoryId) {
      toast.error("select a campaign category");
      return;
    }
    if (title.trim().length < 3) {
      toast.error("title must be at least 3 characters");
      return;
    }
    if (description.trim().length < 5) {
      toast.error("description must be at least 5 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await renultApi.tickets.create(selectedBranch.id, {
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      setTickets((prev) => [created, ...prev]);
      resetForm();
      setSheetOpen(false);
      toast.success("Campaign created");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to create campaign"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteTicket = async (id: string) => {
    try {
      await renultApi.tickets.delete(id);
      setTickets((prev) => prev.filter((ticket) => ticket.id !== id));
      toast.success("Campaign deleted");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to delete campaign"));
    }
  };

  const getPriorityColor = (value: string) => {
    switch (value.toUpperCase()) {
      case "HIGH":
        return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "LOW":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      default:
        return "bg-slate-500/10 text-slate-600 border-slate-500/20";
    }
  };

  const getStatusColor = (value: string) => {
    switch (value.toUpperCase()) {
      case "RESOLVED":
      case "CLOSED":
      case "DONE":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "IN_PROGRESS":
      case "IN PROGRESS":
        return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
      default:
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    }
  };

  return (
    <SettingsLayout title="Campaigns">
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-base font-semibold text-foreground mb-0.5">Campaigns</h1>
            <p className="text-[12px] text-muted-foreground">Create and track branch campaign tickets</p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedBranch?.id || ""} onValueChange={selectBranch}>
              <SelectTrigger className="w-[180px] h-10 text-[12px] bg-card font-bold">
                <SelectValue placeholder="select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id} className="text-xs">{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button className="h-10 text-[12px] font-bold gap-1.5 bg-primary hover:bg-primary/90 rounded" disabled={!selectedBranch}>
                  <Plus className="w-3.5 h-3.5" />
                  New campaign
                </Button>
              </SheetTrigger>

              <SheetContent side="right" className="w-full sm:max-w-md border-border/40 bg-background overflow-y-auto">
                <SheetHeader className="pb-6">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-1">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <SheetTitle className="text-base font-bold text-foreground">Create New Campaign Ticket</SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground">
                    Submit a campaign item for the selected branch.
                  </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-1">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="category" className="text-xs font-medium text-muted-foreground">Campaign category</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger id="category" className="w-full text-xs h-9 bg-card border-border/60">
                        <SelectValue placeholder="select category" />
                      </SelectTrigger>
                      <SelectContent className="border-border/60">
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id} className="text-xs">{category.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="title" className="text-xs font-medium text-muted-foreground">Title</Label>
                    <Input
                      id="title"
                      type="text"
                      placeholder="Campaign title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="text-xs h-9 bg-card border-border/60"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="description" className="text-xs font-medium text-muted-foreground">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Campaign details"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="text-xs min-h-[120px] bg-card border-border/60 resize-none"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="priority" className="text-xs font-medium text-muted-foreground">Priority</Label>
                    <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                      <SelectTrigger id="priority" className="w-full text-xs h-9 bg-card border-border/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border/60">
                        <SelectItem value="LOW" className="text-xs">Low</SelectItem>
                        <SelectItem value="MEDIUM" className="text-xs">Medium</SelectItem>
                        <SelectItem value="HIGH" className="text-xs">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type="submit" className="w-full h-9 text-xs font-medium bg-primary hover:bg-primary/95 mt-3" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    Create Campaign
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Open", count: tickets.filter((ticket) => ticket.status.toUpperCase() === "OPEN").length, color: "text-amber-600" },
            { label: "Active", count: tickets.filter((ticket) => ticket.status.toUpperCase().includes("PROGRESS")).length, color: "text-indigo-600" },
            { label: "Closed", count: tickets.filter((ticket) => ["RESOLVED", "CLOSED", "DONE"].includes(ticket.status.toUpperCase())).length, color: "text-emerald-600" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 px-4 py-3 rounded-none border border-border/20 bg-card/50">
              <span className={`text-xl font-bold ${stat.color}`}>{stat.count}</span>
              <span className="text-[12px] text-muted-foreground font-bold">{stat.label}</span>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading campaigns...
          </div>
        ) : !selectedBranch ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/40 rounded text-muted-foreground">
            <AlertCircle className="w-8 h-8 mb-3 opacity-30" />
            <span className="text-sm font-medium mb-1">no branch selected</span>
            <span className="text-xs opacity-70">create a branch before adding campaigns</span>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/40 rounded text-muted-foreground">
            <AlertCircle className="w-8 h-8 mb-3 opacity-30" />
            <span className="text-sm font-medium mb-1">no campaigns yet</span>
            <span className="text-xs opacity-70">click "new campaign" to create the first one</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tickets.map((ticket) => (
              <Card
                key={ticket.id}
                className={`group relative bg-card cursor-alias border border-${getPriorityColor(ticket.priority)} shadow shadow-${getPriorityColor(ticket.priority)} rounded overflow-hidden transition-all duration-200 hover:border-${getPriorityColor(ticket.priority)} hover:shadow-sm`}
              >
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-[11px] text-muted-foreground font-medium truncate">{ticket.id}</span>
                    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border font-medium rounded-full ${getStatusColor(ticket.status)}`}>
                      {ticket.status.replace("_", " ").toLowerCase()}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1.5 min-h-[58px]">
                    <h3 className="text-sm font-semibold text-foreground leading-tight">{ticket.title}</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{ticket.description}</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/20">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
                      <Clock className="w-3 h-3 opacity-60 shrink-0" />
                      <span className="truncate">{categoryName(ticket.category_id)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border font-medium rounded-full ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority.toLowerCase()}
                      </Badge>
                      <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar className="w-3 h-3 opacity-60" />
                        <span>{dateLabel(ticket.created_at)}</span>
                      </div>
                      <button onClick={() => deleteTicket(ticket.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete campaign">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
