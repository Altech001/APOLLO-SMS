import { apollosmsApi } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { clearVerification } from "./verification-state";

type Status = "loading" | "success" | "error";

/** Landing page for the link in the verification email. */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<Status>(token ? "loading" : "error");
  const [error, setError] = useState(token ? "" : "This verification link is missing its token.");
  const started = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode running the effect twice and burning the token.
    if (!token || started.current) return;
    started.current = true;
    apollosmsApi.auth
      .verifyEmail(token)
      .then(() => {
        clearVerification();
        setStatus("success");
      })
      .catch((err: unknown) => {
        setError(authErrorMessage(err, "This verification link is invalid or has expired."));
        setStatus("error");
      });
  }, [token]);

  return (
    <AuthShell
      title={status === "success" ? "Email verified" : status === "error" ? "Verification failed" : "Verifying…"}
      subtitle={
        status === "success"
          ? "Your account is ready. Log in to continue."
          : status === "error"
            ? "Log in to request a new link or verify with an SMS code instead."
            : "Hold on while we confirm your email address"
      }
      seoTitle="Verify Email"
      path="/verify-email"
    >
      <div className="flex w-full flex-col items-center gap-4">
        {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />}
        {status === "success" && <CheckCircle2 className="h-12 w-12 text-emerald-500" />}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-center text-[13px] text-muted-foreground">{error}</p>
          </>
        )}
        {status !== "loading" && (
          <Button asChild className="mt-2 h-10 w-full">
            <Link to="/login" replace>
              Go to login
            </Link>
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
