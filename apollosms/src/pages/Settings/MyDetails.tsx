import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { renultApi } from "@/api/apollosms";
import { Camera, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

function splitName(name: string | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function diceBearUrl(name: string, size = 128) {
  const seed = encodeURIComponent(name || "User");
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&backgroundColor=6d28d9,7c3aed,8b5cf6&textColor=ffffff&fontSize=40&size=${size}`;
}

export default function MyDetailsPage() {
  const { user, refreshUser } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const names = useMemo(() => splitName(user?.full_name), [user?.full_name]);
  const [firstName, setFirstName] = useState(names.firstName);
  const [lastName, setLastName] = useState(names.lastName);
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone_number || "");

  useEffect(() => {
    setFirstName(names.firstName);
    setLastName(names.lastName);
    setEmail(user?.email || "");
    setPhone(user?.phone_number || "");
  }, [names.firstName, names.lastName, user?.email, user?.phone_number]);

  /* ─── avatar source (uploaded preview → saved url → dicebear) ─── */
  const displayName = user?.full_name || "User";
  const avatarSrc = avatarPreview || user?.avatar_url || diceBearUrl(displayName);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);
    setIsUploadingAvatar(true);

    try {
      if (!user?.id) throw new Error("User profile is not loaded");
      const updated = await renultApi.users.uploadProfileImage(user.id, file);
      setAvatarPreview(updated.avatar_url || updated.profile_image || localUrl);
      await refreshUser();
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
      setAvatarPreview(null);
    } finally {
      setIsUploadingAvatar(false);
      // reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUser();
      toast.success("Account details refreshed");
    } catch {
      toast.error("Failed to refresh account details");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSave = async () => {
    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName) {
      toast.error("Full name is required");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setIsSaving(true);
    try {
      await renultApi.auth.updateMe({
        name: fullName,
        full_name: fullName,
        email: email.trim(),
        phone_number: phone.trim() || null,
      });
      await refreshUser();
      toast.success("Account details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save account details");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsLayout title="My Details">
      <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8">

        {/* ── header row with avatar on the right ── */}
        <div className="flex items-start justify-between gap-6 mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground mb-0.5">
              My Profile
            </h1>
            <p className="text-sm text-muted-foreground">
              Update your profile information and account details
            </p>
          </div>

          {/* ── avatar with upload overlay ── */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="relative group w-16 h-16 rounded-full overflow-hidden ring-2 ring-border/40 hover:ring-primary/60 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <img
                src={avatarSrc}
                alt={displayName}
                className="w-full h-full object-cover"
              />
              {/* dark overlay + camera icon */}
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center">
                {isUploadingAvatar ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                )}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <Separator className="mb-8 bg-border/30" />

        <div className="space-y-6">
          {/* name row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Full name
              </h3>
              <p className="text-[13px] text-muted-foreground">
                This will be displayed on your profile.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <Label className="text-[13px] text-muted-foreground">First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="text-sm h-10 bg-card border-border/50" />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <Label className="text-[13px] text-muted-foreground">Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="text-sm h-10 bg-card border-border/50" />
              </div>
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* email row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Email address
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Used for sign-in and notifications.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="text-sm h-10 bg-card border-border/50" />
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* phone row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Phone number
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Used for account verification and branch alerts.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-sm h-10 bg-card border-border/50" />
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* timezone row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Timezone
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Your local timezone for scheduling.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input defaultValue="East Africa Time (UTC+3)" className="text-sm h-10 bg-card border-border/50" readOnly />
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing || isSaving} className="h-9 text-[13px] font-medium">
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Refresh details
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isRefreshing} className="h-9 text-[13px] font-medium bg-primary hover:bg-primary/90">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}
