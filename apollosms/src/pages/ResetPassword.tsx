import { renultApi } from "@/api/apollosms";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setIsLoading(true);
    try {
      const auth = await renultApi.auth.resetPassword({ email, code, new_password: password });
      login(auth);
      toast.success("Password reset");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4 font-sans relative overflow-hidden">
      <Helmet><link rel="preload" as="image" href="/bg/bg.png" /></Helmet>
      <SEO title="Reset Password" path="/reset-password" />
      <img src="/bg/bg.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.04] blur-sm pointer-events-none select-none z-0" />
      <div className="w-full max-w-[360px] flex flex-col items-center z-10 pb-16">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 flex items-center justify-center mb-3">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <h2 className="text-[22px] font-bold text-slate-800 mb-1">Create new password</h2>
          <p className="text-[13px] text-slate-500">Use the 6 digit code from your email</p>
        </div>
        <form className="w-full space-y-2" onSubmit={handleSubmit}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" placeholder="youremail@mail.host" />
          <input type="text" inputMode="numeric" required minLength={6} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[16px] tracking-[0.3em] text-center text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" placeholder="000000" />
          <div className="relative">
            <input type={showPassword ? "text" : "password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 pr-10 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" placeholder="New password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button type="submit" disabled={isLoading} className="w-full h-10 mt-2 font-medium">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Reset Password
          </Button>
        </form>
        <Link to="/login" className="mt-8 text-[13px] text-slate-900 hover:underline font-medium">Back to login</Link>
      </div>
    </div>
  );
}
