import { apollosmsApi, SmsProviderSettingsResponse } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

type Provider = "local" | "julysms" | "africastalking";

const emptySettings: SmsProviderSettingsResponse = {
  active_provider: "local",
  africastalking_username: "",
  africastalking_sender_id: "",
  africastalking_api_key_configured: false,
  julysms_client_id: "",
  julysms_sender_id: "",
  julysms_client_secret_configured: false,
  cost_per_sms: 31,
  batch_size: 100,
  updated_at: "",
};

export default function APISettingsPage() {
  const [settings, setSettings] = useState<SmsProviderSettingsResponse>(emptySettings);
  const [africaApiKey, setAfricaApiKey] = useState("");
  const [julySecret, setJulySecret] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    apollosmsApi.apiSettings.smsProviders()
      .then((data) => {
        if (mounted) setSettings(data);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to load API settings"))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const updateField = <K extends keyof SmsProviderSettingsResponse>(key: K, value: SmsProviderSettingsResponse[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await apollosmsApi.apiSettings.updateSmsProviders({
        active_provider: settings.active_provider,
        africastalking_username: settings.africastalking_username,
        africastalking_sender_id: settings.africastalking_sender_id,
        africastalking_api_key: africaApiKey,
        julysms_client_id: settings.julysms_client_id,
        julysms_sender_id: settings.julysms_sender_id,
        julysms_client_secret: julySecret,
        cost_per_sms: settings.cost_per_sms,
        batch_size: settings.batch_size,
      });
      setSettings(saved);
      setAfricaApiKey("");
      setJulySecret("");
      toast.success("SMS API settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save API settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsLayout title="API Settings">
      <div className="max-w-4xl mx-auto px-6 sm:px-10 py-8">
        <p className="text-sm text-muted-foreground mb-4">
          Configure the SMS gateway used when messages are dispatched from Compose and queued messages.
        </p>
        <Separator className="mb-8 bg-border/30" />

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
            Loading API settings
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr] gap-y-4 gap-x-12">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-0.5">Active SMS provider</h3>
                <p className="text-[13px] text-muted-foreground">
                  Local records messages without calling an external SMS gateway.
                </p>
              </div>
              <Select value={settings.active_provider} onValueChange={(value: Provider) => updateField("active_provider", value)}>
                <SelectTrigger className="h-10 text-sm bg-card border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local development</SelectItem>
                  <SelectItem value="julysms">JulySMS</SelectItem>
                  <SelectItem value="africastalking">Africa's Talking</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-border/30" />

            <section className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-foreground">Billing and queue</h2>
                <p className="text-[13px] text-muted-foreground">
                  These values control what each user is charged and how many recipients are sent per gateway batch.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Cost per SMS segment (UGX)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.cost_per_sms}
                    onChange={(e) => updateField("cost_per_sms", Number(e.target.value) || 0)}
                    className="h-10 text-sm bg-card border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Queue batch size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={settings.batch_size}
                    onChange={(e) => updateField("batch_size", Number(e.target.value) || 1)}
                    className="h-10 text-sm bg-card border-border/50"
                  />
                </div>
              </div>
            </section>

            <Separator className="bg-border/30" />

            <section className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-foreground">JulySMS</h2>
                <p className="text-[13px] text-muted-foreground">
                  Uses Client-ID and Client-Secret headers for `https://app.julysms.com/api/v1/sms/send`.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Client ID</Label>
                  <Input value={settings.julysms_client_id} onChange={(e) => updateField("julysms_client_id", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">
                    Client Secret {settings.julysms_client_secret_configured ? "(configured)" : ""}
                  </Label>
                  <Input type="password" value={julySecret} onChange={(e) => setJulySecret(e.target.value)} placeholder={settings.julysms_client_secret_configured ? "Leave blank to keep current secret" : ""} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Sender ID</Label>
                  <Input value={settings.julysms_sender_id} onChange={(e) => updateField("julysms_sender_id", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
              </div>
            </section>

            <Separator className="bg-border/30" />

            <section className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-foreground">Africa's Talking</h2>
                <p className="text-[13px] text-muted-foreground">
                  Uses username, apiKey, optional sender ID, and the Africa's Talking messaging endpoint.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Username</Label>
                  <Input value={settings.africastalking_username} onChange={(e) => updateField("africastalking_username", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">
                    API Key {settings.africastalking_api_key_configured ? "(configured)" : ""}
                  </Label>
                  <Input type="password" value={africaApiKey} onChange={(e) => setAfricaApiKey(e.target.value)} placeholder={settings.africastalking_api_key_configured ? "Leave blank to keep current key" : ""} className="h-10 text-sm bg-card border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Sender ID</Label>
                  <Input value={settings.africastalking_sender_id} onChange={(e) => updateField("africastalking_sender_id", e.target.value)} className="h-10 text-sm bg-card border-border/50" />
                </div>
              </div>
            </section>

            <Separator className="bg-border/30" />

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSaving} className="h-9 text-[13px] font-medium">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save API settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
