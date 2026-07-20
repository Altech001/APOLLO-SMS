import { apollosmsApi } from "@/api/apollosms";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function PasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await apollosmsApi.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to update password"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingsLayout title="Password">
      <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8">
        <h1 className="text-lg font-semibold text-foreground mb-0.5">
          Password
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Update your password to keep your account secure
        </p>
        <Separator className="mb-8 bg-border/30" />

        <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-muted-foreground">Current password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" className="text-sm h-10 bg-card border-border/50" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-muted-foreground">New password</Label>
            <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="text-sm h-10 bg-card border-border/50" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-muted-foreground">Confirm new password</Label>
            <Input type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="text-sm h-10 bg-card border-border/50" />
          </div>

          <Separator className="bg-border/30" />

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }} className="h-9 text-[13px] font-medium border-border/50">Cancel</Button>
            <Button disabled={isLoading} className="h-9 text-[13px] font-medium bg-primary hover:bg-primary/90">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Update password
            </Button>
          </div>
        </form>
      </div>
    </SettingsLayout>
  );
}
