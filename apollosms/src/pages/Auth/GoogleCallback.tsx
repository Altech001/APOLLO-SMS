/* eslint-disable @typescript-eslint/no-explicit-any */
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { clearGoogleRedirectUri } from "./google-auth";

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      toast.error("Google code missing");
      navigate("/login", { replace: true });
      return;
    }

    clearGoogleRedirectUri();
    toast.error("Google sign in is not available on this backend API");
    navigate("/login", { replace: true });
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      Finishing Google sign in...
    </div>
  );
}
