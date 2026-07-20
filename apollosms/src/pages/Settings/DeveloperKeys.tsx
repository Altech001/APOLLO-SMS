import { DeveloperKey as ApiDeveloperKey, renultApi } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Code,
  Copy,
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  Key,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

interface DeveloperKey {
  id: string;
  name: string;
  key: string;
  maskedKey: string;
  isActive: boolean;
  projectId: string;
  projectName: string;
  projectClientId: string;
  createdAt: string;
  billingTier: string;
}

const DEFAULT_PROJECT = {
  id: "apollosms-gateway",
  name: "ApolloSMS Gateway",
  clientId: "apollosms-gateway",
};

const toDeveloperKey = (key: ApiDeveloperKey): DeveloperKey => ({
  id: String(key.id),
  name: key.name,
  key: key.masked_key,
  maskedKey: key.masked_key,
  isActive: key.is_active,
  projectId: DEFAULT_PROJECT.id,
  projectName: DEFAULT_PROJECT.name,
  projectClientId: DEFAULT_PROJECT.clientId,
  createdAt: key.created_at ? new Date(key.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-",
  billingTier: "API gateway",
});

export default function DeveloperKeysPage() {
  // Developer keys state
  const [keys, setKeys] = useState<DeveloperKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [groupBy, setGroupBy] = useState<"key" | "project">("key");
  const [filterProject, setFilterProject] = useState<string>("all");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isQuickstartOpen, setIsQuickstartOpen] = useState(false);
  const [isCreatedSuccessOpen, setIsCreatedSuccessOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isShowKeyOpen, setIsShowKeyOpen] = useState(false);

  // Form states
  const [newKeyName, setNewKeyName] = useState("Production API Key");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(DEFAULT_PROJECT.id);
  const [createdKeyVal, setCreatedKeyVal] = useState("");
  const [activeKey, setActiveKey] = useState<DeveloperKey | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const projects = [DEFAULT_PROJECT];

  const loadKeys = async (showToast = false) => {
    setIsLoadingKeys(true);
    try {
      const data = await renultApi.developerKeys.list();
      setKeys(data.map(toDeveloperKey));
      if (showToast) toast.success("API keys refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load API keys");
    } finally {
      setIsLoadingKeys(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  // Create key handler
  const handleCreateKey = async () => {
    const selectedProj = projects.find(p => p.id === selectedProjectId);
    if (!selectedProj) {
      toast.error("Please select a gateway project");
      return;
    }
    const name = newKeyName.trim();
    if (name.length < 2) {
      toast.error("Key name must be at least 2 characters");
      return;
    }

    setIsSavingKey(true);
    try {
      const created = await renultApi.developerKeys.create({ name });
      const visibleKey: DeveloperKey = {
        id: String(created.id),
        name: created.name,
        key: created.raw_key,
        maskedKey: created.masked_key,
        isActive: true,
        projectId: selectedProj.id,
        projectName: selectedProj.name,
        projectClientId: selectedProj.clientId,
        createdAt: created.created_at ? new Date(created.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-",
        billingTier: "API gateway",
      };
      setKeys((prev) => [visibleKey, ...prev]);
      setCreatedKeyVal(created.raw_key);
      setIsCreateOpen(false);
      setIsCreatedSuccessOpen(true);
      setNewKeyName("Production API Key");
      toast.success("API key generated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create API key");
    } finally {
      setIsSavingKey(false);
    }
  };

  // Rename key handler
  const handleRenameKey = () => {
    toast.error("Renaming developer keys is not supported by the backend yet");
    setIsRenameOpen(false);
    setActiveKey(null);
  };

  // Delete key handler
  const handleDeleteKey = async () => {
    if (!activeKey) return;
    setIsSavingKey(true);
    try {
      await renultApi.developerKeys.revoke(activeKey.id);
      setKeys((prev) => prev.filter(k => k.id !== activeKey.id));
      setIsDeleteConfirmOpen(false);
      setActiveKey(null);
      toast.success("API key revoked successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke API key");
    } finally {
      setIsSavingKey(false);
    }
  };

  // Clipboard copy helper
  const copyToClipboard = (text: string, label: string = "API Key") => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const maskKey = (keyStr: string) => {
    if (keyStr.length <= 8) return keyStr;
    // Extract a mock last 4 characters just for display
    const suffix = keyStr.slice(-4);
    // Or check if it has the underscore format
    if (keyStr.includes("_o-7o")) return "...o-7o";
    if (keyStr.includes("_AMjc")) return "...AMjc";
    if (keyStr.includes("_3yLs")) return "...3yLs";
    return `...${suffix}`;
  };

  // Filtered keys list
  const filteredKeys = keys.filter(k => filterProject === "all" || k.projectId === filterProject);

  // Quickstart content states
  const [quickstartTab, setQuickstartTab] = useState<"curl" | "python" | "node">("curl");

  const sampleKey = createdKeyVal || keys[0]?.key || "luco_live_your_api_key";

  return (
    <SettingsLayout title="Developer API Keys">
      <div className="text-foreground min-h-[calc(100vh-57px)] w-full p-6 sm:p-10 font-sans flex flex-col justify-between selection:bg-primary/20 selection:text-primary">

        {/* Main Content Area */}
        <div className="space-y-8 flex-1">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Button
                variant="ghost"
                onClick={() => setIsQuickstartOpen(true)}
                className="h-10 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded px-4 gap-2 border border-border"
              >
                <BookOpen className="w-4 h-4" />
                API quickstart
              </Button>

            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setIsCreateOpen(true)}
                disabled={isLoadingKeys}
                className="h-10 text-[13px] bg-primary hover:bg-primary/90 text-primary-foreground rounded px-5 gap-2 transition-all font-semibold"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Create API key
              </Button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex bg-muted p-1 rounded border border-border">
                <button
                  onClick={() => setGroupBy("key")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${groupBy === "key"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {groupBy === "key" && <Check className="w-3 h-3 stroke-[3]" />}
                  API Key
                </button>
                <button
                  onClick={() => setGroupBy("project")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${groupBy === "project"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {groupBy === "project" && <Check className="w-3 h-3 stroke-[3]" />}
                  Branches
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="h-9 w-[180px] bg-background border-border text-foreground text-xs rounded focus:ring-1 focus:ring-ring focus:ring-offset-0">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="all" className="focus:bg-muted focus:text-foreground text-xs">All projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="focus:bg-muted focus:text-foreground text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* API Keys Table */}
          <div className="relative bg-card overflow-hidden">
            {isLoadingKeys ? (
              <div className="py-16 text-center text-muted-foreground">
                <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-sm font-medium">Loading API keys...</p>
              </div>
            ) : filteredKeys.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Key className="w-10 h-10 mx-auto mb-3 opacity-30 text-primary animate-bounce" />
                <p className="text-sm font-medium">No API keys found matching the filter.</p>
              </div>
            ) : groupBy === "key" ? (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[30%] text-sm text-muted-foreground">Key Details</TableHead>
                    <TableHead className="w-[15%] text-sm text-muted-foreground">Status</TableHead>
                    <TableHead className="w-[30%] text-sm text-muted-foreground">Branch</TableHead>
                    <TableHead className="w-[15%] text-sm text-muted-foreground">Created</TableHead>
                    <TableHead className="w-[10%] text-right text-xs font-bold text-muted-foreground pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKeys.map((k) => (
                    <TableRow
                      key={k.id}
                      onClick={() => {
                        setActiveKey(k);
                        setIsShowKeyOpen(true);
                      }}
                      className="hover:bg-muted/40 cursor-pointer group/row transition-all duration-200"
                    >
                      <TableCell className="py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground text-sm tracking-tight">{k.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground border border-border/40 font-medium">
                              {k.maskedKey || maskKey(k.key)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(k.key);
                              }}
                              className="opacity-0 group-hover/row:opacity-100 p-1 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-all duration-150"
                              title="Copy API key"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          {k.isActive ? "active" : "revoked"}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground text-sm flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            {k.projectName}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground/80 pl-5">{k.projectClientId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                          <CalendarDays className="w-3.5 h-3.5 opacity-60" />
                          <span>{k.createdAt}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => copyToClipboard(k.key)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                            title="Copy API key"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border text-foreground p-1 w-[160px]">
                              <DropdownMenuItem
                                onClick={() => {
                                  setActiveKey(k);
                                  setRenameValue(k.name);
                                  setIsRenameOpen(true);
                                }}
                                className="focus:bg-muted focus:text-foreground cursor-pointer gap-2 py-2 text-xs"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Rename unavailable
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setActiveKey(k);
                                  setIsShowKeyOpen(true);
                                }}
                                className="focus:bg-muted focus:text-foreground cursor-pointer gap-2 py-2 text-xs"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Show key
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setActiveKey(k);
                                  setIsDeleteConfirmOpen(true);
                                }}
                                className="focus:bg-destructive/10 text-destructive focus:text-destructive cursor-pointer gap-2 py-2 text-xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete API key
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveKey(k);
                              setIsShowKeyOpen(true);
                            }}
                            className="p-1 rounded-full text-muted-foreground group-hover/row:text-primary group-hover/row:bg-primary/10 transition-all duration-300 transform translate-x-2 opacity-0 group-hover/row:translate-x-0 group-hover/row:opacity-100"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              // Grouped by Project (Branch)
              <div className="divide-y divide-border/60">
                {projects.map((proj) => {
                  const projKeys = filteredKeys.filter(k => k.projectId === proj.id);
                  return (
                    <div key={proj.id} className="p-5">
                      {/* Project Header */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/40">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground text-sm leading-none">{proj.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono mt-1">
                              {proj.clientId}
                            </span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs font-semibold px-2.5 py-0.5">
                          {projKeys.length} {projKeys.length === 1 ? "key" : "keys"}
                        </Badge>
                      </div>

                      {/* Keys inside this Project */}
                      {projKeys.length === 0 ? (
                        <p className="text-xs text-muted-foreground/80 italic py-2 pl-2">No keys in this project.</p>
                      ) : (
                        <div className="space-y-3">
                          {projKeys.map(k => (
                            <div
                              key={k.id}
                              onClick={() => {
                                setActiveKey(k);
                                setIsShowKeyOpen(true);
                              }}
                              className="flex items-center justify-between p-4 bg-muted/20 hover:bg-muted/40 rounded border border-border/50 hover:border-border transition-all duration-200 cursor-pointer group/item"
                            >
                              <div className="flex items-center gap-8 flex-wrap">
                                <div className="flex flex-col gap-1 min-w-[120px]">
                                  <span className="text-[10px] text-muted-foreground font-semibold uppercase ">Key Name</span>
                                  <span className="text-sm font-semibold text-foreground">{k.name}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground font-semibold uppercase ">Value</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground border border-border/40 font-medium">
                                      {k.maskedKey || maskKey(k.key)}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(k.key);
                                      }}
                                      className="p-1 text-muted-foreground hover:text-primary hover:bg-muted rounded transition-colors"
                                      title="Copy API key"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground font-semibold uppercase ">Status</span>
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 w-fit">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                    Active
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground font-semibold uppercase ">Created</span>
                                  <span className="text-xs text-foreground font-semibold">{k.createdAt}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => copyToClipboard(k.key)}
                                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                  title="Copy key"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-card border-border text-foreground p-1 w-[160px]">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setActiveKey(k);
                                        setRenameValue(k.name);
                                        setIsRenameOpen(true);
                                      }}
                                      className="focus:bg-muted focus:text-foreground cursor-pointer gap-2 py-2 text-xs"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      Rename unavailable
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setActiveKey(k);
                                        setIsShowKeyOpen(true);
                                      }}
                                      className="focus:bg-muted focus:text-foreground cursor-pointer gap-2 py-2 text-xs"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Show key
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setActiveKey(k);
                                        setIsDeleteConfirmOpen(true);
                                      }}
                                      className="focus:bg-destructive/10 text-destructive focus:text-destructive cursor-pointer gap-2 py-2 text-xs"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete API key
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <div
                                  onClick={() => {
                                    setActiveKey(k);
                                    setIsShowKeyOpen(true);
                                  }}
                                  className="p-1 rounded-full text-muted-foreground group-hover/item:text-primary group-hover/item:bg-primary/10 transition-all duration-300 transform translate-x-2 opacity-0 group-hover/item:translate-x-0 group-hover/item:opacity-100 cursor-pointer"
                                >
                                  <ArrowRight className="w-4 h-4" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── MODALS ── */}

        {/* 1. Create API Key Modal */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="bg-card border-border text-foreground p-6 max-w-md rounded">
            <DialogHeader className="flex flex-row items-center justify-between pb-3 ">
              <DialogTitle className="text-lg font-semibold text-foreground">Create a new key</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pt-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium">Name your key</Label>
                <Input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="bg-background border-border text-foreground focus-visible:ring-primary/20 h-10 rounded text-sm"
                  placeholder="e.g. Production API Key"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium">Gateway project</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-full bg-background border-border text-foreground h-10 rounded text-sm">
                    <SelectValue placeholder="Select gateway" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="focus:bg-muted focus:text-foreground text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded text-xs font-semibold text-primary hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={isSavingKey}
                className="px-5 py-2.5 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isSavingKey ? "Creating..." : "Create key"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 2. Key Created Success Modal */}
        <Dialog open={isCreatedSuccessOpen} onOpenChange={setIsCreatedSuccessOpen}>
          <DialogContent className="bg-card border-border text-foreground p-6 max-w-md rounded-2xl">
            <DialogHeader className="pb-3">
              <DialogTitle className="text-lg font-semibold text-foreground">API Key Created</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Copy your key and store it securely. For security, you will not be able to retrieve this full key again from this panel.
              </p>

              <div className="flex items-center gap-2 bg-muted/30 p-3 rounded border border-border font-mono text-xs select-all break-all text-primary">
                <span className="flex-1 select-all">{createdKeyVal}</span>
                <button
                  onClick={() => copyToClipboard(createdKeyVal)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors shrink-0"
                  title="Copy API key"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end pt-6">
              <button
                onClick={() => setIsCreatedSuccessOpen(false)}
                className="px-6 py-2 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Done
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 3. Show Key Modal */}
        <Dialog open={isShowKeyOpen} onOpenChange={setIsShowKeyOpen}>
          <DialogContent className="bg-card border-border text-foreground p-6 max-w-md rounded-2xl">
            <DialogHeader className="pb-3 ">
              <DialogTitle className="text-lg font-semibold text-foreground">API Key Details</DialogTitle>
            </DialogHeader>
            {activeKey && (
              <div className="space-y-4 pt-4">
                <div className="space-y-1.5 pt-2">
                  <span className="text-xs text-muted-foreground font-medium">Full key value:</span>
                  <div className="flex items-center gap-2 bg-transparent p-3 rounded border border-border font-mono text-xs select-all break-all text-primary">
                    <span className="flex-1 select-all">{activeKey.key}</span>
                    <button
                      onClick={() => copyToClipboard(activeKey.key)}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
                      title="Copy Key"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-6">
              <button
                onClick={() => {
                  setIsShowKeyOpen(false);
                  setActiveKey(null);
                }}
                className="px-5 py-2.5 rounded text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground"
              >
                Close
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 4. Rename Key Modal */}
        <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
          <DialogContent className="bg-card border-border text-foreground p-6 max-w-sm rounded-2xl">
            <DialogHeader className="pb-3 ">
              <DialogTitle className="text-lg font-semibold text-foreground">Rename API Key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Key Name</Label>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="bg-background border-border text-foreground focus-visible:ring-primary/20 h-10 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6">
              <button
                onClick={() => {
                  setIsRenameOpen(false);
                  setActiveKey(null);
                }}
                className="px-4 py-2 rounded text-xs font-semibold text-primary hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameKey}
                className="px-5 py-2.5 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Save
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 5. Delete Confirmation Modal */}
        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent className="bg-card border-border text-foreground p-6 max-w-sm rounded-2xl">
            <DialogHeader className="pb-3 ">
              <DialogTitle className="text-lg font-semibold text-destructive">Delete API Key?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to delete the key <span className="font-semibold text-foreground">"{activeKey?.name}"</span>?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6">
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setActiveKey(null);
                }}
                className="px-4 py-2 rounded text-xs font-semibold text-primary hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteKey}
                disabled={isSavingKey}
                className="px-5 py-2.5 rounded text-xs font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isSavingKey ? "Revoking..." : "Revoke key"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 6. Quickstart Modal */}
        <Dialog open={isQuickstartOpen} onOpenChange={setIsQuickstartOpen}>
          <DialogContent className="bg-card border-border text-foreground p-6 max-w-2xl rounded-2xl">
            <DialogHeader className="flex flex-row items-center justify-between pb-3 ">
              <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Code className="w-5 h-5 text-primary" />
                API Quickstart Instructions
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">
                Use your generated API Key to authenticate requests to the ApolloSMS APIs. Choose your preferred integration below:
              </p>

              {/* Quickstart Tabs */}
              <div className="flex  gap-4">
                {(["curl", "python", "node"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setQuickstartTab(tab)}
                    className={`pb-2 text-xs font-semibold capitalize border-b-2 transition-colors ${quickstartTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {tab === "curl" ? "cURL" : tab === "python" ? "Python" : "Node.js"}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="bg-muted rounded-lg border border-border p-4 relative font-mono text-xs overflow-x-auto text-primary">
                <button
                  onClick={() => {
                    const code =
                      quickstartTab === "curl"
                        ? `curl -X POST ${renultApi.baseUrl}/gateway/send \\\n  -H "X-API-Key: ${sampleKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "phones": ["+256700000000"],\n    "message": "Hello from ApolloSMS API!"\n  }'`
                        : quickstartTab === "python"
                          ? `import requests\n\nurl = "${renultApi.baseUrl}/gateway/send"\nheaders = {\n    "X-API-Key": "${sampleKey}",\n    "Content-Type": "application/json"\n}\npayload = {\n    "phones": ["+256700000000"],\n    "message": "Hello from ApolloSMS API!"\n}\n\nresponse = requests.post(url, headers=headers, json=payload)\nprint(response.json())`
                          : `const url = '${renultApi.baseUrl}/gateway/send';\nconst headers = {\n  'X-API-Key': '${sampleKey}',\n  'Content-Type': 'application/json'\n};\nconst body = JSON.stringify({\n  phones: ['+256700000000'],\n  message: 'Hello from ApolloSMS API!'\n});\n\nfetch(url, { method: 'POST', headers, body })\n  .then(res => res.json())\n  .then(json => console.log(json))\n  .catch(err => console.error(err));`;
                    copyToClipboard(code, "Code snippet");
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-background text-muted-foreground hover:text-foreground rounded hover:bg-muted border border-border transition-colors"
                  title="Copy code snippet"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                {quickstartTab === "curl" && (
                  <pre className="whitespace-pre">
                    {`curl -X POST ${renultApi.baseUrl}/gateway/send \\
  -H "X-API-Key: ${sampleKey.slice(0, 15)}..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "phones": ["+256700000000"],
    "message": "Hello from ApolloSMS API!"
  }'`}
                  </pre>
                )}

                {quickstartTab === "python" && (
                  <pre className="whitespace-pre">
                    {`import requests

url = "${renultApi.baseUrl}/gateway/send"
headers = {
    "X-API-Key": "${sampleKey.slice(0, 15)}...",
    "Content-Type": "application/json"
}
payload = {
    "phones": ["+256700000000"],
    "message": "Hello from ApolloSMS API!"
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())`}
                  </pre>
                )}

                {quickstartTab === "node" && (
                  <pre className="whitespace-pre">
                    {`const url = '${renultApi.baseUrl}/gateway/send';
const headers = {
  'X-API-Key': '${sampleKey.slice(0, 15)}...',
  'Content-Type': 'application/json'
};
const body = JSON.stringify({
  phones: ['+256700000000'],
  message: 'Hello from ApolloSMS API!'
});

fetch(url, { method: 'POST', headers, body })
  .then(res => res.json())
  .then(json => console.log(json));`}
                  </pre>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-border mt-6">
              <button
                onClick={() => setIsQuickstartOpen(false)}
                className="px-6 py-2 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Got it
              </button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </SettingsLayout>
  );
}
