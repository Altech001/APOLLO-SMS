import { Toaster } from "@/components/ui/toaster";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from "react";
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Toaster as SonnerToaster } from "sonner";
import { AdminRoute, AuthProvider, ProtectedRoute } from './lib/auth';
import OfflineBanner from './components/OfflineBanner';
import Landing from "./pages/Landing";

const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const AirTimeIndex = lazy(() => import('./pages/AirTime/index'));
const ForgotPassword = lazy(() => import('./pages/Auth/ForgotPassword'));
const GoogleCallback = lazy(() => import('./pages/Auth/GoogleCallback'));
const Login = lazy(() => import('./pages/Auth/Login'));
const ResetPassword = lazy(() => import('./pages/Auth/ResetPassword'));
const SetPassword = lazy(() => import('./pages/Auth/SetPassword'));
const Signup = lazy(() => import('./pages/Auth/Signup'));
const VerifyAccount = lazy(() => import('./pages/Auth/VerifyAccount'));
const VerifyEmail = lazy(() => import('./pages/Auth/VerifyEmail'));
const BranchesPage = lazy(() => import('./pages/Branches'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ComposeIndex = lazy(() => import('./pages/Compose/index'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MyContactsIndex = lazy(() => import('./pages/MyContacts/index'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SalesIndex = lazy(() => import('./pages/Sales/index'));
const ShareCreditsPage = lazy(() => import('./pages/ShareCredits'));
const Withdrawal = lazy(() => import('./pages/Sales/Withdrawal'));
const TemplatesIndex = lazy(() => import('./pages/Templates/index'));
const WhatsappMsgIndex = lazy(() => import('./pages/WhatsappMsg/index'));

/* ── settings sub-pages ── */
const MyDetailsPage = lazy(() => import("./pages/Settings/MyDetails"));
const PasswordPage = lazy(() => import("./pages/Settings/Password"));
const DeveloperKeysPage = lazy(() => import("./pages/Settings/DeveloperKeys"));

const BillingPage = lazy(() => import("./pages/Settings/Billing"));
const Campign = lazy(() => import("./pages/Settings/Campign"));
const SettingsPage = lazy(() => import("./pages/Settings/Settings"));
const APISettingsPage = lazy(() => import("./pages/Settings/APISettings"));
const PlanEditorPage = lazy(() => import("./pages/Settings/PlanEditor"));
const SecurityLogsPage = lazy(() => import("./pages/Settings/SecurityLogs"));
const UsersAdminPage = lazy(() => import("./pages/Settings/Users"));
const ProfitPage = lazy(() => import("./pages/Admin/Profit"));
const AdminMessagesPage = lazy(() => import("./pages/Admin/Messages"));
const AccountDeletionPage = lazy(() => import("./pages/Legal/AccountDeletion"));
const PrivacyPage = lazy(() => import("./pages/Legal/Privacy"));
const TermsPage = lazy(() => import("./pages/Legal/Terms"));
const CardCheckout = lazy(() => import("./pages/Checkout/CardCheckout"));
const CardReturn = lazy(() => import("./pages/Checkout/CardReturn"));
const MobileMoneyCheckout = lazy(() => import("./pages/Checkout/MobileMoneyCheckout"));

const queryClient = new QueryClient();

const protect = (element: ReactNode) => (
  <ProtectedRoute>
    {element}
  </ProtectedRoute>
);

const AppRoutes = () => {
  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-account" element={<VerifyAccount />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/auth/google/callback" element={<GoogleCallback />} />
        <Route path="/google/callback" element={<GoogleCallback />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/account-deletion" element={<AccountDeletionPage />} />
        <Route path="/" element={<Landing />} />

        <Route path="/dashboard" element={protect(<Dashboard />)} />
        <Route path="/profile" element={protect(<ProfilePage />)} />
        <Route path="/my-contacts" element={protect(<MyContactsIndex />)} />
        <Route path="/recents-sms" element={protect(<SalesIndex />)} />
        <Route path="/templates" element={protect(<TemplatesIndex />)} />
        <Route path="/compose" element={protect(<ComposeIndex />)} />
        <Route path="/chat" element={protect(<ChatPage />)} />
        <Route path="/whatsapp" element={protect(<WhatsappMsgIndex />)} />
        <Route path="/withdraw" element={protect(<Withdrawal />)} />
        <Route path="/sms-tp" element={protect(<Withdrawal />)} />
        <Route path="/checkout/card" element={protect(<CardCheckout />)} />
        <Route path="/checkout/card/return" element={protect(<CardReturn />)} />
        <Route path="/checkout/mobile-money" element={protect(<MobileMoneyCheckout />)} />
        <Route path="/airtime" element={protect(<AirTimeIndex />)} />
        <Route path="/branches" element={protect(<BranchesPage />)} />
        <Route path="/notifications" element={protect(<NotificationsPage />)} />
        <Route path="/share-sms" element={protect(<ShareCreditsPage />)} />

        {/* ── settings routes ── */}
        <Route path="/settings" element={protect(<MyDetailsPage />)} />
        <Route path="/settings/password" element={protect(<PasswordPage />)} />
        <Route path="/settings/api-keys" element={protect(<DeveloperKeysPage />)} />

        <Route path="/settings/billing" element={protect(<BillingPage />)} />
        <Route path="/billing" element={protect(<BillingPage />)} />
        <Route path="/settings/admin" element={<AdminRoute><APISettingsPage /></AdminRoute>} />
        <Route path="/settings/plans" element={<AdminRoute><PlanEditorPage /></AdminRoute>} />
        <Route path="/settings/users" element={<AdminRoute><UsersAdminPage /></AdminRoute>} />
        <Route path="/admin/profit" element={<AdminRoute><ProfitPage /></AdminRoute>} />
        <Route path="/admin/messages" element={<AdminRoute><AdminMessagesPage /></AdminRoute>} />
        <Route path="/settings/notifications" element={protect(<SettingsPage />)} />
        <Route path="/settings/support" element={protect(<Campign />)} />
        <Route path="/security-logs" element={protect(<SecurityLogsPage />)} />


        <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </>
  );
};

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </Router>
        <OfflineBanner />
        <Toaster />
        <SonnerToaster richColors position="top-center" className="rounded-none shadow-none" />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App
