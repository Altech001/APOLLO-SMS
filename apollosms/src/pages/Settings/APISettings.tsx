import { apollosmsApi, SmsProviderSettingsResponse } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

type Provider = "local" | "julysms" | "africastalking" | "fuxx";
type SettingsSection = "general" | "julysms" | "africastalking" | "fuxx";

const emptySettings: SmsProviderSettingsResponse = {
  active_provider: "local",
  africastalking_username: "",
  africastalking_sender_id: "",
  africastalking_api_key_configured: false,
  julysms_client_id: "",
  julysms_sender_id: "",
  julysms_client_secret_configured: false,
  fuxx_base_url: "",
  fuxx_username: "",
  fuxx_password_configured: false,
  cost_per_sms: 31,
  batch_size: 100,
  updated_at: "",
};

const apiSettingsQueryKey = ["apollosms", "admin-api-settings"] as const;
const API_SETTINGS_CACHE_TIME = 30 * 60 * 1000;
const API_SETTINGS_STALE_TIME = 5 * 60 * 1000;

function APISettingsSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 5 }).map((_, index) => (
        <section key={index} className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-8 w-8 rounded" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </section>
      ))}
    </div>
  );
}

export default function APISettingsPage() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SmsProviderSettingsResponse>(emptySettings);
  const [africaApiKey, setAfricaApiKey] = useState("");
  const [julySecret, setJulySecret] = useState("");
  const [fuxxPassword, setFuxxPassword] = useState("");
  const [editingSection, setEditingSection] = useState<SettingsSection | null>(null);

  const {
    data,
    error,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery<SmsProviderSettingsResponse>({
    queryKey: apiSettingsQueryKey,
    queryFn: () => apollosmsApi.apiSettings.smsProviders(),
    staleTime: API_SETTINGS_STALE_TIME,
    gcTime: API_SETTINGS_CACHE_TIME,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ scope }: { scope: SettingsSection }) => {
      const includeJulyFields = scope === "julysms" || (scope === "general" && settings.active_provider === "julysms");
      const includeAfricaFields = scope === "africastalking" || (scope === "general" && settings.active_provider === "africastalking");
      const includeFuxxFields = scope === "fuxx" || (scope === "general" && settings.active_provider === "fuxx");

      return apollosmsApi.apiSettings.updateSmsProviders({
        update_scope: scope,
        active_provider: settings.active_provider,
        cost_per_sms: settings.cost_per_sms,
        batch_size: settings.batch_size,
        ...(includeJulyFields
          ? {
              julysms_client_id: settings.julysms_client_id,
              julysms_sender_id: settings.julysms_sender_id,
              julysms_client_secret: julySecret.trim() || (settings.julysms_client_secret_configured ? "****" : undefined),
            }
          : {}),
        ...(includeAfricaFields
          ? {
              africastalking_username: settings.africastalking_username,
              africastalking_sender_id: settings.africastalking_sender_id,
              africastalking_api_key: africaApiKey.trim() || (settings.africastalking_api_key_configured ? "****" : undefined),
            }
          : {}),
        ...(includeFuxxFields
          ? {
              fuxx_base_url: settings.fuxx_base_url,
              fuxx_username: settings.fuxx_username,
              fuxx_password: fuxxPassword.trim() || (settings.fuxx_password_configured ? "****" : undefined),
            }
          : {}),
      });
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(apiSettingsQueryKey, saved);
      setSettings(saved);
      setAfricaApiKey("");
      setJulySecret("");
      setFuxxPassword("");
      setEditingSection(null);
      toast.success(`${variables.scope === "general" ? "General" : variables.scope === "julysms" ? "JulySMS" : variables.scope === "africastalking" ? "Africa's Talking" : "FUXX"} settings saved`);
    },
    onError: (saveError) => {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save API settings");
    },
  });

  useEffect(() => {
    if (data && !editingSection && !saveMutation.isPending) {
      setSettings(data);
    }
  }, [data, editingSection, saveMutation.isPending]);

  const updateField = <K extends keyof SmsProviderSettingsResponse>(key: K, value: SmsProviderSettingsResponse[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = (section: SettingsSection) => {
    if (data) setSettings(data);
    setAfricaApiKey("");
    setJulySecret("");
    setFuxxPassword("");
    setEditingSection(section);
  };

  const cancelEdit = () => {
    if (data) setSettings(data);
    setAfricaApiKey("");
    setJulySecret("");
    setFuxxPassword("");
    setEditingSection(null);
  };

  const isEditing = (section: SettingsSection) => editingSection === section;
  const savingScope = saveMutation.isPending ? saveMutation.variables?.scope : null;

  const sectionActions = (section: SettingsSection) => {
    if (isEditing(section)) {
      return (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEdit} disabled={saveMutation.isPending} title="Cancel">
            <X className="h-4 w-4" />
          </Button>
          <Button type="button" className="h-8 px-3 text-xs" onClick={() => saveMutation.mutate({ scope: section })} disabled={saveMutation.isPending}>
            {savingScope === section ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      );
    }

    return (
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(section)} disabled={saveMutation.isPending} title="Edit settings">
        <Pencil className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <SettingsLayout title="API Settings">
      <div className="max-w-4xl mx-auto px-6 sm:px-10 py-8">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Configure the SMS gateway used when messages are dispatched from Compose and queued messages.
          </p>
          {isFetching && !isLoading ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Syncing
            </span>
          ) : null}
        </div>
        <Separator className="mb-8 bg-border/30" />

        {isLoading ? (
          <APISettingsSkeleton />
        ) : isError ? (
          <div className="py-16 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load API settings"}
            </p>
            <Button type="button" variant="outline" className="h-9 text-[13px]" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-0.5">General gateway</h3>
                  <p className="text-[13px] text-muted-foreground">
                    Choose the active provider and the platform charge rules.
                  </p>
                </div>
                {sectionActions("general")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr] gap-y-4 gap-x-12">
                <div>
                  <Label className="text-[13px] text-muted-foreground">Active SMS provider</Label>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Local records messages without calling an external SMS gateway.
                  </p>
                </div>
                <Select disabled={!isEditing("general")} value={settings.active_provider} onValueChange={(value: Provider) => updateField("active_provider", value)}>
                  <SelectTrigger className="h-10 text-sm bg-card border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local development</SelectItem>
                    <SelectItem value="julysms">JulySMS</SelectItem>
                    <SelectItem value="africastalking">Africa's Talking</SelectItem>
                    <SelectItem value="fuxx">FUXX Cloud</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Cost per SMS segment (UGX)</Label>
                  <Input
                    type="number"
                    min={1}
                    disabled={!isEditing("general")}
                    value={settings.cost_per_sms}
                    onChange={(e) => updateField("cost_per_sms", Number(e.target.value) || 1)}
                    className="h-10 text-sm bg-card border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Queue batch size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    disabled={!isEditing("general")}
                    value={settings.batch_size}
                    onChange={(e) => updateField("batch_size", Number(e.target.value) || 1)}
                    className="h-10 text-sm bg-card border-border/50"
                  />
                </div>
              </div>
            </section>

            <Separator className="bg-border/30" />

            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">JulySMS</h2>
                  <p className="text-[13px] text-muted-foreground">
                    Uses Client-ID and Client-Secret headers for the JulySMS gateway.
                  </p>
                </div>
                {sectionActions("julysms")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Client ID</Label>
                  <Input disabled={!isEditing("julysms")} value={settings.julysms_client_id} onChange={(e) => updateField("julysms_client_id", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">
                    Client Secret {settings.julysms_client_secret_configured ? "(configured)" : ""}
                  </Label>
                  <Input disabled={!isEditing("julysms")} type="password" value={julySecret} onChange={(e) => setJulySecret(e.target.value)} placeholder={settings.julysms_client_secret_configured ? "Leave blank to keep current secret" : ""} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Sender ID</Label>
                  <Input disabled={!isEditing("julysms")} value={settings.julysms_sender_id} onChange={(e) => updateField("julysms_sender_id", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
              </div>
            </section>

            <Separator className="bg-border/30" />

            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Africa's Talking</h2>
                  <p className="text-[13px] text-muted-foreground">
                    Uses username, apiKey, optional sender ID, and the Africa's Talking messaging endpoint.
                  </p>
                </div>
                {sectionActions("africastalking")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Username</Label>
                  <Input disabled={!isEditing("africastalking")} value={settings.africastalking_username} onChange={(e) => updateField("africastalking_username", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">
                    API Key {settings.africastalking_api_key_configured ? "(configured)" : ""}
                  </Label>
                  <Input disabled={!isEditing("africastalking")} type="password" value={africaApiKey} onChange={(e) => setAfricaApiKey(e.target.value)} placeholder={settings.africastalking_api_key_configured ? "Leave blank to keep current key" : ""} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Sender ID</Label>
                  <Input disabled={!isEditing("africastalking")} value={settings.africastalking_sender_id} onChange={(e) => updateField("africastalking_sender_id", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
              </div>
            </section>

            <Separator className="bg-border/30" />

            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">FUXX Cloud</h2>
                  <p className="text-[13px] text-muted-foreground">
                    Uses Basic Auth and sends JSON to the FUXX cloud SMS gateway.
                  </p>
                </div>
                {sectionActions("fuxx")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[13px] text-muted-foreground">URL</Label>
                  <Input disabled={!isEditing("fuxx")} value={settings.fuxx_base_url} onChange={(e) => updateField("fuxx_base_url", e.target.value)} placeholder="https://fuxx.renult.xyz/mobile/v1" className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Username</Label>
                  <Input disabled={!isEditing("fuxx")} value={settings.fuxx_username} onChange={(e) => updateField("fuxx_username", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">
                    Password {settings.fuxx_password_configured ? "(configured)" : ""}
                  </Label>
                  <Input disabled={!isEditing("fuxx")} type="password" value={fuxxPassword} onChange={(e) => setFuxxPassword(e.target.value)} placeholder={settings.fuxx_password_configured ? "Leave blank to keep current password" : ""} className="h-10 text-sm bg-card border-border/50" />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
