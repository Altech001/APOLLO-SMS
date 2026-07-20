import { BranchResponse, renultApi, StaffResponse } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function BranchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(localStorage.getItem("selected-workspace"));
  const [isLoading, setIsLoading] = useState(true);
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [staffForm, setStaffForm] = useState({ full_name: "", email: "", phone_number: "", role: "staff" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) || branches[0],
    [branches, selectedBranchId],
  );

  const loadBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await renultApi.branches.list();
      setBranches(data);
      const next = data.find((branch) => branch.id === selectedBranchId) || data[0];
      if (next) {
        setSelectedBranchId(next.id);
        localStorage.setItem("selected-workspace", next.id);
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to load branches"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedBranchId]);

  const loadStaff = useCallback(async () => {
    if (!selectedBranch?.id) {
      setStaff([]);
      return;
    }
    try {
      setStaff(await renultApi.staff.list(selectedBranch.id));
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to load staff"));
    }
  }, [selectedBranch?.id]);

  useEffect(() => { loadBranches(); }, [loadBranches]);
  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => {
    const action = searchParams.get("new");
    if (action === "branch") setIsBranchOpen(true);
    if (action === "staff") setIsStaffOpen(true);
  }, [searchParams]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed: boolean }>).detail;
      setSidebarCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const createBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const branch = await renultApi.branches.create({ name: branchName });
      setBranches((prev) => [branch, ...prev]);
      setSelectedBranchId(branch.id);
      localStorage.setItem("selected-workspace", branch.id);
      window.dispatchEvent(new CustomEvent("renult-branch-change", { detail: branch }));
      setBranchName("");
      setIsBranchOpen(false);
      setSearchParams({});
      toast.success("Branch created");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to create branch"));
    }
  };

  const createStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBranch) return;
    try {
      const created = await renultApi.staff.create(selectedBranch.id, {
        ...staffForm,
        phone_number: staffForm.phone_number || null,
      });
      setStaff((prev) => [created, ...prev]);
      setStaffForm({ full_name: "", email: "", phone_number: "", role: "staff" });
      setIsStaffOpen(false);
      setSearchParams({});
      toast.success("Staff member added");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to add staff"));
    }
  };

  const deleteStaff = async (id: string) => {
    try {
      await renultApi.staff.delete(id);
      setStaff((prev) => prev.filter((item) => item.id !== id));
      toast.success("Staff member removed");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to delete staff"));
    }
  };

  const selectBranch = (branch: BranchResponse) => {
    setSelectedBranchId(branch.id);
    localStorage.setItem("selected-workspace", branch.id);
    window.dispatchEvent(new CustomEvent("renult-branch-change", { detail: branch }));
  };

  return (
    <div className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
      <SEO title="Branches" path="/branches" />
      <AppHeader />
      <main className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Branches & Staff</h1>
            <p className="text-sm text-muted-foreground">Manage locations and branch team members.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10 text-xs gap-1.5" onClick={() => setIsBranchOpen(true)}>
              <Plus className="w-4 h-4" />
              Create New Branch
            </Button>
            <Button className="h-9 text-xs gap-1.5" disabled={!selectedBranch} onClick={() => setIsStaffOpen(true)}>
              <UserPlus className="w-4 h-4" />
              Staff
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          <Card className="border-border/20 shadow-none rounded-none">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Branches
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {isLoading ? (
                <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading...
                </div>
              ) : branches.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">No branches yet.</div>
              ) : branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => selectBranch(branch)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-colors ${selectedBranch?.id === branch.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/80"}`}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={branch.avatar_url} />
                    <AvatarFallback>{branch.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{branch.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{new Date(branch.created_at).toLocaleDateString()}</p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border/0">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                
                {selectedBranch ? `${selectedBranch.name} Staff` : "Staff"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!selectedBranch ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Create a branch to add staff.</div>
              ) : staff.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No staff for this branch yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-7 h-7">
                              <AvatarImage src={person.avatar_url} />
                              <AvatarFallback>{person.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-xs">{person.full_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{person.email}</TableCell>
                        <TableCell className="text-xs">{person.phone_number || "-"}</TableCell>
                        <TableCell className="text-xs capitalize">{person.role}</TableCell>
                        <TableCell>
                          <button onClick={() => deleteStaff(person.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete staff">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={isBranchOpen} onOpenChange={(open) => { setIsBranchOpen(open); if (!open) setSearchParams({}); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Branch</DialogTitle></DialogHeader>
          <form onSubmit={createBranch} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Branch name</Label>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} required placeholder="Kampala Branch" />
            </div>
            <Button type="submit" className="w-full h-9">Create branch</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isStaffOpen} onOpenChange={(open) => { setIsStaffOpen(open); if (!open) setSearchParams({}); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Staff</DialogTitle></DialogHeader>
          <form onSubmit={createStaff} className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Full name</Label><Input value={staffForm.full_name} onChange={(e) => setStaffForm((p) => ({ ...p, full_name: e.target.value }))} required /></div>
            <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={staffForm.email} onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))} required /></div>
            <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={staffForm.phone_number} onChange={(e) => setStaffForm((p) => ({ ...p, phone_number: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Role</Label><Input value={staffForm.role} onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value }))} /></div>
            <Button type="submit" className="w-full h-9">Add staff</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
