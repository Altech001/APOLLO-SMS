import { renultApi } from "@/api/apollosms";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      toast.error("Google code missing");
      navigate("/login", { replace: true });
      return;
    }
    renultApi.auth.googleCallback(code)
      .then((auth) => {
        login(auth);
        navigate("/set-password", { replace: true });
      })
      .catch((err) => {
        toast.error(err.message || "Google login failed");
        navigate("/login", { replace: true });
      });
  }, [params, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-sm text-slate-600">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      Finishing Google sign in...
    </div>
  );
}
