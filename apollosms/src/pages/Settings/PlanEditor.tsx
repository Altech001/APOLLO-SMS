import { apollosmsApi, BillingPlan, BillingPlanRequest, ID } from "@/api/apollosms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

const NUMBER_FIELDS: Array<{ key: keyof BillingPlanRequest; label: string; hint: string }> = [
    { key: "price_ugx", label: "Plan price (UGX)", hint: "0 for the free plan" },
    { key: "duration_days", label: "Duration (days)", hint: "7 weekly, 30 monthly, 365 yearly" },
    { key: "sms_price_ugx", label: "SMS price (UGX)", hint: "Per SMS credit; 0 = standard pricing" },
    { key: "whatsapp_credits", label: "WhatsApp messages included", hint: "Added when the plan is bought" },
    { key: "daily_free_sms", label: "Free SMS per day", hint: "Used before paid credits" },
    { key: "daily_free_whatsapp", label: "Free WhatsApp per day", hint: "Used before paid credits" },
    { key: "whatsapp_per_sms", label: "Bonus WhatsApp per SMS bought", hint: "Added on each SMS purchase" },
    { key: "whatsapp_price_ugx", label: "Extra WhatsApp credit price (UGX)", hint: "0 = not for sale" },
    { key: "sort_order", label: "Display order", hint: "Lower shows first" },
];

const EMPTY_PLAN: BillingPlanRequest = {
    code: "",
    name: "",
    description: "",
    price_ugx: 0,
    duration_days: 30,
    sms_price_ugx: 0,
    whatsapp_credits: 0,
    daily_free_sms: 0,
    daily_free_whatsapp: 0,
    whatsapp_per_sms: 0,
    whatsapp_price_ugx: 0,
    features: "",
    is_popular: false,
    is_active: true,
    sort_order: 10,
};

type Draft = BillingPlanRequest & { id?: ID };

const toDraft = (plan: BillingPlan): Draft => {
    const { created_at: _created, updated_at: _updated, ...rest } = plan;
    return rest;
};

export default function PlanEditorPage() {
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const load = async (selectId?: ID) => {
        try {
            const data = await apollosmsApi.billing.adminPlans();
            setPlans(data);
            const selected = data.find((p) => String(p.id) === String(selectId)) || data[0];
            setDraft(selected ? toDraft(selected) : null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to load plans");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
        setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    const handleSave = async () => {
        if (!draft) return;
        setIsSaving(true);
        try {
            const { id, ...payload } = draft;
            const saved = id !== undefined
                ? await apollosmsApi.billing.updatePlan(id, payload)
                : await apollosmsApi.billing.createPlan(payload);
            toast.success(`${saved.name} plan saved`);
            await load(saved.id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save plan");
        } finally {
            setIsSaving(false);
        }
    };

    const isFree = draft?.code === "free";

    return (
        <SettingsLayout title="Plan Editor">
            <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <div>
                        <h1 className="text-base font-bold text-foreground">Plan Editor</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Changes apply to new purchases right away. Active subscriptions keep their current end date.
                        </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => setDraft({ ...EMPTY_PLAN })}>
                        <Plus className="w-3.5 h-3.5" />
                        New plan
                    </Button>
                </div>

                {isLoading ? (
                    <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
                        {/* Plan list */}
                        <div className="space-y-2">
                            {plans.map((plan) => (
                                <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => setDraft(toDraft(plan))}
                                    className={cn(
                                        "w-full text-left p-3 rounded border transition-colors",
                                        String(draft?.id) === String(plan.id) ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/20"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold">{plan.name}</span>
                                        {!plan.is_active && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Hidden</Badge>}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {plan.price_ugx > 0 ? `UGX ${plan.price_ugx.toLocaleString()} / ${plan.duration_days}d` : "Free"}
                                    </p>
                                </button>
                            ))}
                            {draft && draft.id === undefined && (
                                <div className="w-full p-3 rounded border border-dashed border-primary text-sm text-primary">New plan</div>
                            )}
                        </div>

                        {/* Editor */}
                        {draft && (
                            <div className="rounded border border-border/40 p-5 space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="plan-name" className="text-xs font-semibold">Name</Label>
                                        <Input id="plan-name" value={draft.name} onChange={(e) => update("name", e.target.value)} className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="plan-code" className="text-xs font-semibold">Code</Label>
                                        <Input
                                            id="plan-code"
                                            value={draft.code}
                                            disabled={isFree}
                                            onChange={(e) => update("code", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                                            className="h-9 text-sm font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label htmlFor="plan-description" className="text-xs font-semibold">Description</Label>
                                        <Input id="plan-description" value={draft.description} onChange={(e) => update("description", e.target.value)} className="h-9 text-sm" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {NUMBER_FIELDS.map(({ key, label, hint }) => {
                                        const locked = isFree && (key === "price_ugx" || key === "duration_days");
                                        return (
                                            <div key={key} className="space-y-1">
                                                <Label htmlFor={`plan-${key}`} className="text-xs font-semibold">{label}</Label>
                                                <Input
                                                    id={`plan-${key}`}
                                                    type="number"
                                                    min={0}
                                                    disabled={locked}
                                                    value={String(draft[key] ?? 0)}
                                                    onChange={(e) => update(key, Math.max(0, parseInt(e.target.value, 10) || 0) as never)}
                                                    className="h-9 text-sm font-mono"
                                                />
                                                <p className="text-[10px] text-muted-foreground">{hint}</p>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="plan-features" className="text-xs font-semibold">Features (one per line, shown on the plan card)</Label>
                                    <Textarea
                                        id="plan-features"
                                        value={draft.features}
                                        onChange={(e) => update("features", e.target.value)}
                                        className="min-h-28 text-sm"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-6">
                                    <label className="flex items-center gap-2 text-xs">
                                        <Switch checked={draft.is_popular} onCheckedChange={(v) => update("is_popular", v)} />
                                        Highlight as popular
                                    </label>
                                    <label className={cn("flex items-center gap-2 text-xs", isFree && "opacity-50")}>
                                        <Switch checked={draft.is_active} disabled={isFree} onCheckedChange={(v) => update("is_active", v)} />
                                        Visible to users
                                    </label>
                                </div>

                                <div className="flex justify-end pt-2 border-t border-border/20">
                                    <Button onClick={handleSave} disabled={isSaving} className="h-10 text-xs gap-1.5">
                                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        Save plan
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </SettingsLayout>
    );
}
