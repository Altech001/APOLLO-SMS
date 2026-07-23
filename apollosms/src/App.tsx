import { Toaster } from "@/components/ui/toaster";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Toaster as SonnerToaster } from "sonner";
import { AdminRoute, AuthProvider, ProtectedRoute } from './lib/auth';
import PageNotFound from './lib/PageNotFound';

import AirTimeIndex from './pages/AirTime/index';
import ForgotPassword from './pages/Auth/ForgotPassword';
import GoogleCallback from './pages/Auth/GoogleCallback';
import Login from './pages/Auth/Login';
import ResetPassword from './pages/Auth/ResetPassword';
import SetPassword from './pages/Auth/SetPassword';
import Signup from './pages/Auth/Signup';
import BranchesPage from './pages/Branches';
import ComposeIndex from './pages/Compose/index';
import Dashboard from './pages/Dashboard';
import MyContactsIndex from './pages/MyContacts/index';
import NotificationsPage from './pages/Notifications';
import ProfilePage from './pages/ProfilePage';
import SalesIndex from './pages/Sales/index';
import ShareCreditsPage from './pages/ShareCredits';
import Withdrawal from './pages/Sales/Withdrawal';
import TemplatesIndex from './pages/Templates/index';

/* ── settings sub-pages ── */
import MyDetailsPage from "./pages/Settings/MyDetails";
import PasswordPage from "./pages/Settings/Password";
import DeveloperKeysPage from "./pages/Settings/DeveloperKeys";

import BillingPage from "./pages/Settings/Billing";
import Campign from "./pages/Settings/Campign";
import SettingsPage from "./pages/Settings/Settings";
import APISettingsPage from "./pages/Settings/APISettings";
import SecurityLogsPage from "./pages/Settings/SecurityLogs";

const queryClient = new QueryClient();

const protect = (element: React.ReactNode) => (
  <ProtectedRoute>
    {element}
  </ProtectedRoute>
);

const AppRoutes = () => {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/auth/google/callback" element={<GoogleCallback />} />
        <Route path="/google/callback" element={<GoogleCallback />} />

        <Route path="/" element={protect(<Dashboard />)} />
        <Route path="/profile" element={protect(<ProfilePage />)} />
        <Route path="/my-contacts" element={protect(<MyContactsIndex />)} />
        <Route path="/recents-sms" element={protect(<SalesIndex />)} />
        <Route path="/templates" element={protect(<TemplatesIndex />)} />
        <Route path="/compose" element={protect(<ComposeIndex />)} />
        <Route path="/withdraw" element={protect(<Withdrawal />)} />
        <Route path="/sms-tp" element={protect(<Withdrawal />)} />
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
        <Route path="/settings/notifications" element={protect(<SettingsPage />)} />
        <Route path="/settings/support" element={protect(<Campign />)} />
        <Route path="/security-logs" element={protect(<SecurityLogsPage />)} />


        <Route path="*" element={<PageNotFound />} />
      </Routes>
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
        <Toaster />
        <SonnerToaster richColors position="top-center" className="rounded-none shadow-none" />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App
