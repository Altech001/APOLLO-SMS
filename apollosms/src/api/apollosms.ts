/* eslint-disable @typescript-eslint/no-explicit-any */
const configuredApiUrl =
  import.meta.env.VITE_APOLLOSMS_API_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  "http://localhost:8000/api/v1";

const AUTH_TOKEN_KEY = "apollosms:auth-token";
const AUTH_USER_KEY = "apollosms:auth-user";
const SESSION_USER_ID_KEY = "apollosms:session-user-id";
const LEGACY_AUTH_TOKEN_KEY = "renult:auth-token";
const LEGACY_AUTH_USER_KEY = "renult:auth-user";

const USER_DATA_CACHE_KEYS = [
  "apollosms:branches",
  "apollosms:staff",
  "apollosms:tickets",
  "apollosms:contacts",
  "apollosms:contact-groups",
  "apollosms:airtime-topups",
  "apollosms:sms-history",
  "apollosms:sms-queue",
  "apollosms:forms",
  "apollosms:tasks",
  "apollosms:documents",
  "apollosms:cash-balance",
  "selected-workspace",
] as const;

function normalizeBaseUrl(value: string) {
  const trimmed = value.replace(/\/+$/, "");
  return /\/api\/v1$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

export const APOLLOSMS_API_BASE_URL = normalizeBaseUrl(configuredApiUrl);

export type ID = string | number;

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface ApiMessage {
  message: string;
}

export interface UserResponse {
  id: ID;
  name: string;
  email: string;
  role: "admin" | "user" | string;
  sms_balance: number;
  profile_image: string;
  is_verified: boolean;
  created_at?: string;
  full_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  auth_provider: string;
}

export interface AuthResponse {
  access_token: string;
  token?: string;
  token_type?: string;
  user: UserResponse;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  confirm_new_password: string;
}

export interface SessionResponse {
  id: ID;
  ip_address: string;
  device: string;
  location: string;
  isp: string;
  connection_type: string;
  country_flag: string;
  is_current: boolean;
  created_at: string;
  expires_at: string;
}

export interface SecurityLogResponse {
  id: ID;
  action: string;
  ip_address: string;
  device: string;
  location: string;
  isp: string;
  connection_type: string;
  country_flag: string;
  created_at: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: "admin" | "user" | string;
  sms_balance: number;
}

export interface UpdateUserRequest {
  name: string;
  email: string;
  password?: string;
  role: "admin" | "user" | string;
  sms_balance: number;
}

export interface SMSTopupRequest {
  amount?: number;
  amount_ugx?: number;
  description: string;
  reference?: string;
}

export interface SMSTopupResponse {
  id: ID;
  user_id: ID;
  amount: number;
  amount_ugx: number;
  price_per_sms: number;
  description: string;
  reference: string;
  created_at: string;
}

export interface SMSTemplateResponse {
  id: ID;
  user_id: ID;
  name: string;
  category: string;
  body: string;
  created_at: string;
  updated_at: string;
  content: string;
  variables: string[];
  usageCount: number;
  lastUsed: string;
}

export interface SMSTemplateRequest {
  name: string;
  category: string;
  body: string;
}

export interface NotificationResponse {
  id: ID;
  user_id: ID;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  category: string;
  body: string;
  read_at: string | null;
}

export interface NotificationListResponse {
  notifications: NotificationResponse[];
  unread_count: number;
  total: number;
}

export interface SendSMSRequest {
  phone?: string;
  phones?: string[];
  message: string;
}

export interface GatewaySendSMSResponse {
  success: boolean;
  message: string;
  job_group_id?: string;
}

export interface SMSConfigResponse {
  id: ID;
  active_provider: "local" | "julysms" | "africastalking" | string;
  cost_per_segment: number;
  queue_batch_size: number;
  updated_at: string;
  julysms_client_id: string;
  julysms_client_secret: string;
  julysms_sender_id: string;
  at_username: string;
  at_api_key: string;
  at_sender_id: string;
}

export interface SmsProviderSettingsResponse {
  active_provider: "local" | "julysms" | "africastalking" | string;
  africastalking_username: string;
  africastalking_sender_id: string;
  africastalking_api_key_configured: boolean;
  julysms_client_id: string;
  julysms_sender_id: string;
  julysms_client_secret_configured: boolean;
  cost_per_sms: number;
  batch_size: number;
  updated_at: string;
}

export interface SMSConfigRequest {
  active_provider: string;
  cost_per_segment: number;
  queue_batch_size: number;
  julysms_client_id?: string;
  julysms_client_secret?: string;
  julysms_sender_id?: string;
  at_username?: string;
  at_api_key?: string;
  at_sender_id?: string;
}

export interface SMSPricingRange {
  id?: ID;
  min_amount: number;
  max_amount: number | null;
  price_per_sms: number;
}

export interface SMSBalanceResponse {
  provider: string;
  balance: unknown;
}

export interface SMSDeliveryLog {
  id: ID;
  provider: string;
  message_id: string;
  phone: string;
  status: string;
  sent_at: string;
  delivered_at: string;
  raw_payload: string;
  created_at: string;
}

export interface DeveloperKey {
  id: ID;
  user_id: ID;
  name: string;
  masked_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface CreateDeveloperKeyResponse {
  id: ID;
  name: string;
  raw_key: string;
  masked_key: string;
  created_at: string;
}

export interface SMSJob {
  id: ID;
  user_id: ID;
  phone: string;
  message: string;
  segments: number;
  credits: number;
  status: string;
  error_message: string;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface SMSMessageRecord {
  id: ID;
  message_id: string;
  phone: string;
  message: string;
  segments: number;
  credits: number;
  status: string;
  error_message?: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SMSDashboardStatsResponse {
  success_count: number;
  queued_count: number;
  total_sent: number;
  failed_count: number;
  delivery_rate: number;
  chart: Array<{ date: string; delivered: number; failed: number }>;
  heatmap: Array<{ day: number; level?: number; count: number }>;
  recent: SMSMessageRecord[];
}

export interface CreateCollectionRequest {
  amount_ugx: number;
  phone_number: string;
  method: string;
  description?: string;
}

export interface CreateCollectionResponse {
  reference: string;
  status: string;
  amount_ugx: number;
  sms_credits: number;
  price_per_sms: number;
  raw_response?: Record<string, unknown>;
}

export interface PaymentTransactionResponse {
  id: ID;
  user_id: ID | null;
  type: string;
  status: string;
  amount_ugx: number;
  sms_credits: number;
  price_per_sms: number;
  phone_number: string;
  country: string;
  method: string;
  provider: string;
  provider_transaction_id: string;
  reference: string;
  transaction_uuid: string;
  description: string;
  completed_at: string | null;
  created_at: string;
}

export interface CreateWithdrawalRequest {
  amount_ugx: number;
  phone_number: string;
  description?: string;
}

export interface SMSUsageSummary {
  deposit_count: number;
  completed_deposits: number;
  failed_deposits: number;
  processing_deposits: number;
  total_deposit_ugx: number;
  sms_purchased: number;
  sms_available: number;
  sms_used: number;
  sms_pending: number;
  sms_failed: number;
}

export interface BranchResponse {
  id: string;
  name: string;
  avatar_url: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface StaffResponse {
  id: string;
  branch_id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface TicketCategoryResponse {
  id: string;
  name: string;
  description: string | null;
}

export interface TicketResponse {
  id: string;
  branch_id: string;
  category_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateResponse {
  id: string;
  name: string;
  category: "Authentication" | "Marketing" | "Transactional" | "Alert" | string;
  content: string;
  variables: string[];
  usage_count?: number;
  usageCount: number;
  last_used?: string | null;
  lastUsed: string;
  created_at: string;
  updated_at: string;
}

export interface WalletResponse {
  id: string;
  sms_balance: number;
  cash_balance: number;
  updated_at: string;
}

export interface TopupResponse {
  id: string;
  kind: "sms" | "airtime" | string;
  amount: number;
  sms_count: number;
  phone: string | null;
  network: string | null;
  cashback: number;
  status: string;
  created_at: string;
}

export interface ContactGroupResponse {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  contact_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ContactResponse {
  id: string;
  name?: string;
  full_name?: string;
  phone?: string;
  phone_number?: string;
  email?: string | null;
  groups?: string[];
  group_ids?: string[];
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
}

export interface SmsMessageResponse {
  id: string;
  recipient_name?: string | null;
  recipientName?: string | null;
  phone: string;
  message: string;
  sender_id?: string;
  senderId?: string;
  sent_at?: string;
  sentAt?: string;
  scheduled_for?: string;
  scheduledFor?: string;
  status: string;
  cost?: number;
  segments?: number;
  fail_reason?: string | null;
  failReason?: string | null;
}

export interface SmsDashboardResponse {
  success_count?: number;
  queued_count?: number;
  total_sent?: number;
  failed_count?: number;
  delivery_rate?: number;
  chart?: Array<{ date: string; delivered: number; failed: number }>;
  heatmap?: Array<{ day: number; level?: number; count: number }>;
  recent?: SmsMessageResponse[];
}

type RequestOptions = RequestInit & {
  auth?: boolean;
  apiKey?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function dispatchAuthChange(user?: UserResponse | null) {
  window.dispatchEvent(new CustomEvent("apollosms-auth-change", { detail: user || undefined }));
  window.dispatchEvent(new CustomEvent("renult-auth-change", { detail: user || undefined }));
}

function normalizeUser(user: any): UserResponse {
  return {
    ...user,
    id: user?.id,
    name: user?.name || user?.full_name || "",
    full_name: user?.full_name || user?.name || "",
    email: user?.email || "",
    role: user?.role || "user",
    sms_balance: Number(user?.sms_balance || 0),
    profile_image: user?.profile_image || user?.avatar_url || "",
    avatar_url: user?.avatar_url || user?.profile_image || null,
    phone_number: user?.phone_number || null,
    is_verified: Boolean(user?.is_verified),
    auth_provider: user?.auth_provider || "password",
  };
}

function normalizeAuth(auth: any): AuthResponse {
  const token = auth?.access_token || auth?.token || "";
  return {
    ...auth,
    access_token: token,
    token,
    token_type: auth?.token_type || "Bearer",
    user: normalizeUser(auth?.user || {}),
  };
}

function normalizeTemplate(template: any): SMSTemplateResponse {
  return {
    ...template,
    content: template?.content || template?.body || "",
    body: template?.body || template?.content || "",
    variables: template?.variables || [],
    usageCount: template?.usageCount || template?.usage_count || 0,
    lastUsed: template?.lastUsed || template?.last_used || "",
  };
}

function normalizeNotification(notification: any): NotificationResponse {
  return {
    ...notification,
    category: notification?.category || notification?.type || "info",
    body: notification?.body || notification?.message || "",
    message: notification?.message || notification?.body || "",
    read_at: notification?.read_at || null,
  };
}

function normalizeSmsConfig(config: SMSConfigResponse): SmsProviderSettingsResponse {
  return {
    active_provider: config.active_provider,
    africastalking_username: config.at_username || "",
    africastalking_sender_id: config.at_sender_id || "",
    africastalking_api_key_configured: Boolean(config.at_api_key && config.at_api_key.includes("*")),
    julysms_client_id: config.julysms_client_id || "",
    julysms_sender_id: config.julysms_sender_id || "",
    julysms_client_secret_configured: Boolean(config.julysms_client_secret && config.julysms_client_secret.includes("*")),
    cost_per_sms: config.cost_per_segment,
    batch_size: config.queue_batch_size,
    updated_at: config.updated_at,
  };
}

function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
}

function getStoredUser(): UserResponse | null {
  const raw = localStorage.getItem(AUTH_USER_KEY) || localStorage.getItem(LEGACY_AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return normalizeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

function clearUserDataCache() {
  USER_DATA_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent("apollosms-user-cache-cleared"));
}

function prepareAuthSession(user: UserResponse) {
  const nextUserId = String(user.id);
  const previousUserId = localStorage.getItem(SESSION_USER_ID_KEY);
  const userChanged = !previousUserId || previousUserId !== nextUserId;
  if (userChanged) {
    clearUserDataCache();
  }
  localStorage.setItem(SESSION_USER_ID_KEY, nextUserId);
  return userChanged;
}

function saveAuth(auth: AuthResponse) {
  const normalized = normalizeAuth(auth);
  prepareAuthSession(normalized.user);
  localStorage.setItem(AUTH_TOKEN_KEY, normalized.access_token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalized.user));
  localStorage.setItem(LEGACY_AUTH_TOKEN_KEY, normalized.access_token);
  localStorage.setItem(LEGACY_AUTH_USER_KEY, JSON.stringify(normalized.user));
  dispatchAuthChange(normalized.user);
}

function saveUser(user: UserResponse) {
  const normalized = normalizeUser(user);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalized));
  localStorage.setItem(LEGACY_AUTH_USER_KEY, JSON.stringify(normalized));
  dispatchAuthChange(normalized);
  return normalized;
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_AUTH_USER_KEY);
  localStorage.removeItem(SESSION_USER_ID_KEY);
  clearUserDataCache();
  dispatchAuthChange(null);
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(`${APOLLOSMS_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function isJsonBody(body: BodyInit | null | undefined) {
  return body !== undefined && body !== null && !(body instanceof FormData);
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, apiKey, query, headers, body, ...init } = options;
  const token = getStoredToken();
  const res = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(isJsonBody(body) ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
      ...headers,
    },
    body,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item: any) => item.msg).filter(Boolean).join(", ")
      : data?.error || data?.message || detail || data || "Request failed";
    if (res.status === 401) clearAuth();
    throw new ApiError(String(message), res.status);
  }

  if (data && typeof data === "object" && "success" in data && "data" in data) {
    return data.data as T;
  }

  return data as T;
}

const readJson = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = <T>(key: string, value: T) => localStorage.setItem(key, JSON.stringify(value));

const memoryStore = <T extends { id: string }>(key: string) => {
  const read = () => readJson<T[]>(key, []);
  const write = (items: T[]) => writeJson(key, items);
  return {
    list: async () => read(),
    create: async (data: Omit<T, "id" | "created_at" | "updated_at"> & Record<string, unknown>) => {
      const now = new Date().toISOString();
      const item = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...data } as T;
      write([item, ...read()]);
      return item;
    },
    update: async (id: string, data: Partial<T>) => {
      const items = read().map((item) => (item.id === id ? { ...item, ...data, updated_at: new Date().toISOString() } : item));
      write(items);
      return items.find((item) => item.id === id) as T;
    },
    delete: async (id: string) => {
      write(read().filter((item) => item.id !== id));
      return { message: "Deleted" };
    },
  };
};

const localBranches = memoryStore<BranchResponse>("apollosms:branches");
const localStaff = memoryStore<StaffResponse>("apollosms:staff");
const localTickets = memoryStore<TicketResponse>("apollosms:tickets");
const localContacts = memoryStore<ContactResponse>("apollosms:contacts");
const localContactGroups = memoryStore<ContactGroupResponse>("apollosms:contact-groups");
const localAirtimeTopups = memoryStore<TopupResponse>("apollosms:airtime-topups");
const localForms = memoryStore<any>("apollosms:forms");
const localTasks = memoryStore<any>("apollosms:tasks");
const localDocuments = memoryStore<any>("apollosms:documents");
const LOCAL_CASH_BALANCE_KEY = "apollosms:cash-balance";

function getCashBalance() {
  return Number(localStorage.getItem(LOCAL_CASH_BALANCE_KEY) || 0);
}

function setCashBalance(value: number) {
  localStorage.setItem(LOCAL_CASH_BALANCE_KEY, String(Math.max(0, value)));
}

async function getWallet(): Promise<WalletResponse> {
  const user = getStoredUser();
  return {
    id: user?.id ? String(user.id) : "wallet",
    sms_balance: user?.sms_balance || 0,
    cash_balance: getCashBalance(),
    updated_at: new Date().toISOString(),
  };
}

function toTemplateResponse(template: SMSTemplateResponse): TemplateResponse {
  return {
    ...template,
    id: String(template.id),
    content: template.content || template.body || "",
    variables: template.variables || [],
    usageCount: template.usageCount || 0,
    lastUsed: template.lastUsed || "",
  };
}

function toTopupResponse(topup: SMSTopupResponse): TopupResponse {
  return {
    id: String(topup.id),
    kind: "sms",
    amount: topup.amount_ugx || topup.amount,
    sms_count: topup.amount,
    phone: null,
    network: null,
    cashback: 0,
    status: "paid",
    created_at: topup.created_at,
  };
}

function toSmsMessage(job: SMSJob): SmsMessageResponse {
  const normalizedStatus = job.status === "completed" ? "Sent" : job.status === "failed" ? "Failed" : "Pending";
  return {
    id: String(job.id),
    recipient_name: null,
    recipientName: null,
    phone: job.phone,
    message: job.message,
    sender_id: "Default",
    senderId: "Default",
    sent_at: job.updated_at || job.created_at,
    sentAt: job.updated_at || job.created_at,
    scheduled_for: "Immediate",
    scheduledFor: "Immediate",
    status: normalizedStatus,
    cost: job.credits,
    segments: job.segments,
    fail_reason: job.error_message || null,
    failReason: job.error_message || null,
  };
}

const QUEUED_SMS_STATUSES = new Set(["queued", "processing"]);
const HISTORY_SMS_STATUSES = new Set(["sent", "delivered", "failed"]);

function mapSmsDisplayStatus(status: string, forQueue = false): string {
  switch (status) {
    case "queued":
      return forQueue ? "Pending" : "Enqueued";
    case "processing":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed";
    case "completed":
      return "Sent";
    default:
      return status;
  }
}

function toSmsMessageFromRecord(message: SMSMessageRecord, forQueue = false): SmsMessageResponse {
  const sentAt = message.sent_at || message.created_at;
  return {
    id: message.message_id || String(message.id),
    recipient_name: null,
    recipientName: null,
    phone: message.phone,
    message: message.message,
    sender_id: "Default",
    senderId: "Default",
    sent_at: sentAt,
    sentAt,
    scheduled_for: forQueue ? "Immediate" : "Immediate",
    scheduledFor: forQueue ? "Immediate" : "Immediate",
    status: mapSmsDisplayStatus(message.status, forQueue),
    cost: message.credits,
    segments: message.segments,
    fail_reason: message.error_message || null,
    failReason: message.error_message || null,
  };
}

function toSmsDashboardResponse(stats: SMSDashboardStatsResponse): SmsDashboardResponse {
  return {
    success_count: stats.success_count,
    queued_count: stats.queued_count,
    total_sent: stats.total_sent,
    failed_count: stats.failed_count,
    delivery_rate: stats.delivery_rate,
    chart: stats.chart,
    heatmap: stats.heatmap,
    recent: stats.recent.map((message) => toSmsMessageFromRecord(message)),
  };
}

export const apollosmsApi = {
  baseUrl: APOLLOSMS_API_BASE_URL,
  request: apiRequest,
  auth: {
    token: getStoredToken,
    storedUser: getStoredUser,
    save: saveAuth,
    clear: clearAuth,
    clearUserDataCache,
    me: async () => {
      if (!getStoredToken()) throw new ApiError("No signed in user is stored locally", 401);
      const user = normalizeUser(await apiRequest<UserResponse>("/users/me"));
      return saveUser(user);
    },
    register: async (payload: { email: string; password: string; name?: string; full_name?: string }) =>
      normalizeUser(await apiRequest<UserResponse>("/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          name: payload.name || payload.full_name || "",
          email: payload.email,
          password: payload.password,
        }),
      })),
    verifyEmail: (token: string) =>
      apiRequest<ApiMessage>("/auth/verify-email", { method: "GET", auth: false, query: { token } }),
    login: async (payload: LoginRequest) =>
      normalizeAuth(await apiRequest<AuthResponse>("/auth/login", { method: "POST", auth: false, body: JSON.stringify(payload) })),
    forgotPassword: (payload: ForgotPasswordRequest) =>
      apiRequest<ApiMessage>("/auth/forgot-password", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    resetPassword: (payload: ResetPasswordRequest) =>
      apiRequest<ApiMessage>("/auth/reset-password", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    resendVerification: (payload: ResendVerificationRequest) =>
      apiRequest<ApiMessage>("/auth/resend-verification", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    resendCode: (payload: ResendVerificationRequest) =>
      apiRequest<ApiMessage>("/auth/resend-verification", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    changePassword: (payload: ChangePasswordRequest) =>
      apiRequest<ApiMessage>("/auth/change-password", { method: "POST", body: JSON.stringify(payload) }),
    setPassword: (payload: { current_password?: string | null; new_password: string; confirm_new_password?: string }) =>
      apiRequest<ApiMessage>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: payload.current_password || "",
          new_password: payload.new_password,
          confirm_new_password: payload.confirm_new_password || payload.new_password,
        }),
      }),
    updateMe: async (payload: Partial<UserResponse>) => {
      const current = getStoredUser();
      const name = payload.name || payload.full_name || current?.name || current?.full_name || "";
      const email = payload.email || current?.email || "";
      const updated = normalizeUser(await apiRequest<UserResponse>("/users/me", {
        method: "PUT",
        body: JSON.stringify({ name, email }),
      }));
      return saveUser({ ...updated, phone_number: payload.phone_number ?? current?.phone_number ?? null });
    },
    google: async () => {
      throw new ApiError("Google authentication is not available on this backend API", 404);
    },
    googleCallback: async () => {
      throw new ApiError("Google authentication is not available on this backend API", 404);
    },
    googleLoginUrl: async () => {
      throw new ApiError("Google authentication is not available on this backend API", 404);
    },
    exchangeSubdomainHandoff: async () => {
      throw new ApiError("Subdomain handoff is not available on this backend API", 404);
    },
  },
  health: {
    check: () => apiRequest<Record<string, unknown>>("/health", { auth: false }),
  },
  security: {
    sessions: () => apiRequest<SessionResponse[]>("/security/sessions"),
    revokeOtherSessions: () => apiRequest<ApiMessage>("/security/sessions", { method: "DELETE" }),
    revokeSession: (id: ID) => apiRequest<ApiMessage>(`/security/sessions/${id}`, { method: "DELETE" }),
    logs: () => apiRequest<SecurityLogResponse[]>("/security/logs"),
  },
  users: {
    list: () => apiRequest<UserResponse[]>("/users"),
    get: (id: ID) => apiRequest<UserResponse>(`/users/${id}`),
    create: (payload: CreateUserRequest) =>
      apiRequest<UserResponse>("/users", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: ID, payload: UpdateUserRequest) =>
      apiRequest<UserResponse>(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    delete: (id: ID) => apiRequest<ApiMessage>(`/users/${id}`, { method: "DELETE" }),
    uploadProfileImage: (id: ID, file: File) => {
      const body = new FormData();
      body.append("file", file);
      return apiRequest<UserResponse>(`/users/${id}/profile-image`, { method: "POST", body }).then((user) => {
        const normalized = normalizeUser(user);
        const current = getStoredUser();
        if (current && String(current.id) === String(normalized.id)) return saveUser({ ...current, ...normalized });
        return normalized;
      });
    },
  },
  topups: {
    perform: (userId: ID, payload: SMSTopupRequest) =>
      apiRequest<SMSTopupResponse>(`/users/${userId}/topup`, { method: "POST", body: JSON.stringify(payload) }),
    share: (payload: SMSTopupRequest & { recipient_id: ID; amount: number; description: string }) =>
      apiRequest<SMSTopupResponse>("/users/share", { method: "POST", body: JSON.stringify(payload) }),
    forUser: (userId: ID) => apiRequest<SMSTopupResponse[]>(`/users/${userId}/topups`),
    all: () => apiRequest<SMSTopupResponse[]>("/users/topups"),
    mine: () => apiRequest<SMSTopupResponse[]>("/users/me/topups"),
  },
  smsTemplates: {
    list: async () => (await apiRequest<SMSTemplateResponse[]>("/sms-templates")).map(normalizeTemplate),
    get: async (id: ID) => normalizeTemplate(await apiRequest<SMSTemplateResponse>(`/sms-templates/${id}`)),
    create: async (payload: SMSTemplateRequest | { name: string; category: string; content: string; variables?: string[] }) =>
      normalizeTemplate(await apiRequest<SMSTemplateResponse>("/sms-templates", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          category: payload.category,
          body: "body" in payload ? payload.body : payload.content,
        }),
      })),
    update: async (id: ID, payload: SMSTemplateRequest | { name: string; category: string; content: string; variables?: string[] }) =>
      normalizeTemplate(await apiRequest<SMSTemplateResponse>(`/sms-templates/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: payload.name,
          category: payload.category,
          body: "body" in payload ? payload.body : payload.content,
        }),
      })),
    delete: (id: ID) => apiRequest<ApiMessage>(`/sms-templates/${id}`, { method: "DELETE" }),
  },
  notifications: {
    list: async (query?: { unread_only?: boolean }) => {
      const notifications = query?.unread_only
        ? await apiRequest<NotificationResponse[]>("/notifications/unread")
        : await apiRequest<NotificationResponse[]>("/notifications");
      const normalized = notifications.map(normalizeNotification);
      return {
        notifications: normalized,
        unread_count: normalized.filter((item) => !item.is_read).length,
        total: normalized.length,
      };
    },
    unread: async () => (await apiRequest<NotificationResponse[]>("/notifications/unread")).map(normalizeNotification),
    unreadCount: () => apiRequest<{ count: number }>("/notifications/unread/count"),
    markRead: (id: ID | ID[]) => {
      const firstId = Array.isArray(id) ? id[0] : id;
      return apiRequest<ApiMessage>(`/notifications/${firstId}/read`, { method: "PUT" });
    },
    markAllRead: () => apiRequest<ApiMessage>("/notifications/read-all", { method: "PUT" }),
    delete: async () => {
      throw new ApiError("Deleting notifications is not available on this backend API", 404);
    },
  },
  sms: {
    send: (payload: SendSMSRequest | { recipients: Array<{ phone: string }>; message: string }) => {
      const phones = "recipients" in payload ? payload.recipients.map((recipient) => recipient.phone).filter(Boolean) : payload.phones;
      return apiRequest<GatewaySendSMSResponse>("/sms-config/send", {
        method: "POST",
        body: JSON.stringify({
          phone: "phone" in payload ? payload.phone : undefined,
          phones,
          message: payload.message,
        }),
      });
    },
    messages: (query?: { limit?: number }) =>
      apiRequest<SMSMessageRecord[]>("/sms/messages", { query }),
    dashboard: (query?: { range?: string }) =>
      apiRequest<SMSDashboardStatsResponse>("/sms/dashboard", { query }),
    gatewaySend: (apiKey: string, payload: SendSMSRequest) =>
      apiRequest<GatewaySendSMSResponse>("/gateway/send", {
        method: "POST",
        auth: false,
        apiKey,
        body: JSON.stringify(payload),
      }),
  },
  smsPricing: {
    get: () => apiRequest<{ cost_per_segment: number }>("/sms-pricing"),
  },
  smsConfig: {
    get: () => apiRequest<SMSConfigResponse>("/sms-config"),
    save: (payload: SMSConfigRequest) =>
      apiRequest<SMSConfigResponse>("/sms-config", { method: "PUT", body: JSON.stringify(payload) }),
    balance: () => apiRequest<SMSBalanceResponse>("/sms-config/balance"),
    deliveryLogs: (query?: { limit?: number }) => apiRequest<SMSDeliveryLog[]>("/sms-config/delivery-logs", { query }),
    failedJobs: (query?: { limit?: number }) => apiRequest<SMSJob[]>("/sms-config/failed-jobs", { query }),
    usageSummary: () => apiRequest<SMSUsageSummary>("/sms-config/usage-summary"),
    pricingRanges: () => apiRequest<SMSPricingRange[]>("/sms-config/pricing-ranges"),
    savePricingRanges: (payload: SMSPricingRange[]) =>
      apiRequest<SMSPricingRange[]>("/sms-config/pricing-ranges", { method: "PUT", body: JSON.stringify(payload) }),
    julySmsWebhook: (payload: unknown, signature: string) =>
      apiRequest<ApiMessage>("/sms-config/webhooks/julysms", {
        method: "POST",
        auth: false,
        headers: { "X-Signature": signature },
        body: JSON.stringify(payload),
      }),
  },
  pricingRanges: {
    list: () => apiRequest<SMSPricingRange[]>("/sms-pricing-ranges"),
    save: (payload: SMSPricingRange[]) =>
      apiRequest<SMSPricingRange[]>("/sms-pricing-ranges", { method: "PUT", body: JSON.stringify(payload) }),
  },
  developerKeys: {
    create: (payload: { name: string }) =>
      apiRequest<CreateDeveloperKeyResponse>("/developer-keys", { method: "POST", body: JSON.stringify(payload) }),
    list: () => apiRequest<DeveloperKey[]>("/developer-keys"),
    revoke: (id: ID) => apiRequest<ApiMessage>(`/developer-keys/${id}`, { method: "DELETE" }),
  },
  payments: {
    createCollection: (payload: CreateCollectionRequest) =>
      apiRequest<CreateCollectionResponse>("/payments/collections", { method: "POST", body: JSON.stringify(payload) }),
    getCollection: (reference: string, options?: { sync?: boolean }) =>
      apiRequest<PaymentTransactionResponse>(`/payments/collections/${encodeURIComponent(reference)}`, {
        query: options?.sync ? { sync: "true" } : undefined,
      }),
    transactions: (query?: { limit?: number }) => apiRequest<PaymentTransactionResponse[]>("/payments/transactions", { query }),
    createWithdrawal: (payload: CreateWithdrawalRequest) =>
      apiRequest<PaymentTransactionResponse>("/payments/withdrawals", { method: "POST", body: JSON.stringify(payload) }),
    marzPayWebhook: (payload: unknown) =>
      apiRequest<ApiMessage>("/payments/webhooks/marzpay", { method: "POST", auth: false, body: JSON.stringify(payload) }),
  },
  apiSettings: {
    smsProviders: async () => normalizeSmsConfig(await apiRequest<SMSConfigResponse>("/sms-config")),
    updateSmsProviders: async (payload: Partial<{
      active_provider: string;
      africastalking_username: string;
      africastalking_api_key: string;
      africastalking_sender_id: string;
      julysms_client_id: string;
      julysms_client_secret: string;
      julysms_sender_id: string;
      cost_per_sms: number;
      batch_size: number;
    }>) => normalizeSmsConfig(await apiRequest<SMSConfigResponse>("/sms-config", {
      method: "PUT",
      body: JSON.stringify({
        active_provider: payload.active_provider,
        cost_per_segment: payload.cost_per_sms,
        queue_batch_size: payload.batch_size,
        julysms_client_id: payload.julysms_client_id,
        julysms_client_secret: payload.julysms_client_secret,
        julysms_sender_id: payload.julysms_sender_id,
        at_username: payload.africastalking_username,
        at_api_key: payload.africastalking_api_key,
        at_sender_id: payload.africastalking_sender_id,
      }),
    })),
  },
};

export const renultApi: any = {
  ...apollosmsApi,
  auth: {
    ...apollosmsApi.auth,
    verifyEmail: async (tokenOrPayload: string | { token?: string; email?: string; code?: string }) => {
      if (typeof tokenOrPayload === "string") return apollosmsApi.auth.verifyEmail(tokenOrPayload);
      if (tokenOrPayload.token) return apollosmsApi.auth.verifyEmail(tokenOrPayload.token);
      throw new ApiError("Email verification now uses the token link sent by the backend", 400);
    },
    resetPassword: async (payload: ResetPasswordRequest | { email?: string; code?: string; token?: string; new_password: string }) => {
      if ("token" in payload && payload.token) {
        return apollosmsApi.auth.resetPassword({ token: payload.token, new_password: payload.new_password });
      }
      throw new ApiError("Password reset now uses the reset token link sent by the backend", 400);
    },
  },
  branches: {
    list: async () => localBranches.list(),
    create: (payload: { name: string }) => localBranches.create({
      name: payload.name,
      avatar_url: "",
      user_id: String(getStoredUser()?.id || ""),
    }),
    update: (id: string, payload: Partial<BranchResponse>) => localBranches.update(id, payload),
    delete: (id: string) => localBranches.delete(id),
  },
  staff: {
    list: async (branchId: string) => (await localStaff.list()).filter((staff) => staff.branch_id === branchId),
    create: (branchId: string, payload: { full_name: string; email: string; phone_number?: string | null; role?: string | null }) =>
      localStaff.create({
        branch_id: branchId,
        full_name: payload.full_name,
        email: payload.email,
        phone_number: payload.phone_number || null,
        role: payload.role || "member",
        avatar_url: "",
      }),
    update: (id: string, payload: Partial<StaffResponse>) => localStaff.update(id, payload),
    delete: (id: string) => localStaff.delete(id),
  },
  notifications: {
    ...apollosmsApi.notifications,
    delete: async () => ({ message: "Notification deleted locally" }),
  },
  tickets: {
    categories: async (): Promise<TicketCategoryResponse[]> => [
      { id: "general", name: "General", description: "General support request" },
      { id: "billing", name: "Billing", description: "Billing and account support" },
      { id: "technical", name: "Technical", description: "Technical issue" },
    ],
    list: async (branchId: string) => (await localTickets.list()).filter((ticket) => ticket.branch_id === branchId),
    create: (branchId: string, payload: { category_id: string; title: string; description: string; priority?: string | null }) =>
      localTickets.create({
        branch_id: branchId,
        category_id: payload.category_id,
        title: payload.title,
        description: payload.description,
        priority: payload.priority || "medium",
        status: "open",
        assigned_staff_id: null,
      }),
    update: (id: string, payload: Partial<TicketResponse>) => localTickets.update(id, payload),
    delete: (id: string) => localTickets.delete(id),
  },
  templates: {
    list: async () => (await apollosmsApi.smsTemplates.list()).map(toTemplateResponse),
    create: async (payload: { name: string; category: string; content: string; variables?: string[] }) =>
      toTemplateResponse(await apollosmsApi.smsTemplates.create(payload)),
    update: async (id: ID, payload: { name: string; category: string; content: string; variables?: string[] }) =>
      toTemplateResponse(await apollosmsApi.smsTemplates.update(id, payload)),
    use: async (id: ID) => toTemplateResponse(await apollosmsApi.smsTemplates.get(id)),
    delete: (id: ID) => apollosmsApi.smsTemplates.delete(id),
  },
  wallet: {
    get: getWallet,
  },
  topups: {
    perform: (userId: ID, payload: { amount?: number; amount_ugx?: number; description: string; reference?: string }) =>
      apollosmsApi.topups.perform(userId, payload),
    share: (payload: { recipient_id: ID; amount: number; description: string }) =>
      apollosmsApi.topups.share(payload),
    list: async (query?: { kind?: string }) => {
      const smsTopups = query?.kind === "airtime"
        ? []
        : await apollosmsApi.topups.mine().then((items) => items.map(toTopupResponse)).catch(() => []);
      const airtimeTopups = query?.kind === "sms" ? [] : await localAirtimeTopups.list();
      return [...smsTopups, ...airtimeTopups].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    sms: async (payload: { amount: number; sms_count: number; phone?: string | null }) => {
      const wallet = await getWallet();
      await apollosmsApi.payments.createCollection({
        amount_ugx: payload.amount,
        phone_number: payload.phone || getStoredUser()?.phone_number || "",
        method: "mobile_money",
        description: `Buy ${payload.sms_count} SMS credits`,
      }).catch(() => undefined);
      return {
        topup: {
          id: crypto.randomUUID(),
          kind: "sms",
          amount: payload.amount,
          sms_count: payload.sms_count,
          phone: payload.phone || null,
          network: null,
          cashback: 0,
          status: "pending",
          created_at: new Date().toISOString(),
        } as TopupResponse,
        wallet,
      };
    },
    airtime: async (payload: { phone: string; network: string; amount: number; cashback: number }) => {
      const current = getCashBalance();
      setCashBalance(current - payload.amount + payload.cashback);
      const topup = await localAirtimeTopups.create({
        kind: "airtime",
        amount: payload.amount,
        sms_count: 0,
        phone: payload.phone,
        network: payload.network,
        cashback: payload.cashback,
        status: "paid",
      });
      return { topup, wallet: await getWallet() };
    },
  },
  contactGroups: {
    list: async () => {
      const groups = await localContactGroups.list();
      const contacts = await localContacts.list();
      return groups.map((group) => ({
        ...group,
        contact_count: contacts.filter((contact) => (contact.groups || contact.group_ids || []).includes(group.id)).length,
      }));
    },
    create: (payload: { name: string; description?: string; color?: string }) => localContactGroups.create(payload),
    update: (id: string, payload: Partial<ContactGroupResponse>) => localContactGroups.update(id, payload),
    delete: (id: string) => localContactGroups.delete(id),
  },
  contacts: {
    list: async (query?: { search?: string; group_id?: string }) => {
      const search = query?.search?.toLowerCase();
      return (await localContacts.list()).filter((contact) => {
        const inGroup = !query?.group_id || (contact.groups || contact.group_ids || []).includes(query.group_id);
        const matchesSearch = !search || [contact.name, contact.full_name, contact.phone, contact.phone_number, contact.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
        return inGroup && matchesSearch;
      });
    },
    create: (payload: { name: string; phone: string; email?: string; groups?: string[] }) =>
      localContacts.create({
        name: payload.name,
        full_name: payload.name,
        phone: payload.phone,
        phone_number: payload.phone,
        email: payload.email || null,
        groups: payload.groups || [],
        group_ids: payload.groups || [],
      }),
    bulkCreate: async (payload: { contacts: Array<{ name: string; phone: string; email?: string; groups?: string[] }> }) =>
      Promise.all(payload.contacts.map((contact) => renultApi.contacts.create(contact))),
    update: (id: string, payload: Partial<{ name: string; phone: string; email: string; groups: string[] }>) =>
      localContacts.update(id, {
        ...payload,
        full_name: payload.name,
        phone_number: payload.phone,
        group_ids: payload.groups,
      }),
    delete: (id: string) => localContacts.delete(id),
    bulkDelete: async (ids: string[]) => {
      await Promise.all(ids.map((id) => localContacts.delete(id)));
      return { message: "Deleted" };
    },
    assignGroup: async (contactIds: string[], groupId: string) => {
      const contacts = await localContacts.list();
      await Promise.all(contacts.filter((contact) => contactIds.includes(contact.id)).map((contact) => {
        const groups = Array.from(new Set([...(contact.groups || contact.group_ids || []), groupId]));
        return localContacts.update(contact.id, { groups, group_ids: groups });
      }));
      return { message: "Contacts assigned" };
    },
  },
  sms: {
    ...apollosmsApi.sms,
    dashboard: async (query?: { range?: string }): Promise<SmsDashboardResponse> => {
      const stats = await apollosmsApi.sms.dashboard({ range: query?.range || "today" });
      return toSmsDashboardResponse(stats);
    },
    history: async (query?: { limit?: number }) => {
      const messages = await apollosmsApi.sms.messages({ limit: query?.limit || 200 });
      return messages
        .filter((message) => HISTORY_SMS_STATUSES.has(message.status))
        .map((message) => toSmsMessageFromRecord(message));
    },
    queue: async (query?: { limit?: number }) => {
      const messages = await apollosmsApi.sms.messages({ limit: query?.limit || 200 });
      return messages
        .filter((message) => QUEUED_SMS_STATUSES.has(message.status))
        .map((message) => toSmsMessageFromRecord(message, true));
    },
    send: async (payload: SendSMSRequest | { recipients: Array<{ name?: string; phone: string; email?: string; groups?: string[] }>; message: string; sender_id?: string; scheduled_for?: string | null }) => {
      const phones = "recipients" in payload ? payload.recipients.map((recipient) => recipient.phone).filter(Boolean) : payload.phones;
      const message = payload.message;
      const response = await apollosmsApi.sms.send({ phone: "phone" in payload ? payload.phone : undefined, phones, message });

      const segments = Math.max(1, Math.ceil(message.length / 160));
      const creditsUsed = segments * (phones?.length || 0);
      const currentUser = getStoredUser();
      if (currentUser) {
        const optimisticBalance = Math.max(0, (currentUser.sms_balance || 0) - creditsUsed);
        saveUser({ ...currentUser, sms_balance: optimisticBalance });
      }

      apiRequest<UserResponse>("/users/me")
        .then((freshUser) => {
          saveUser(normalizeUser(freshUser));
          window.dispatchEvent(new CustomEvent("renult-wallet-change"));
        })
        .catch(() => {});

      return { ...response, wallet: await getWallet() };
    },
    cancelQueued: async () => {
      throw new ApiError("Queued messages cannot be cancelled once submitted to the gateway", 400);
    },
    rescheduleQueued: async () => {
      throw new ApiError("Rescheduling is not supported for gateway-backed SMS messages", 400);
    },
    sendQueuedNow: async () => {
      throw new ApiError("Queued messages are processed automatically by the gateway worker", 400);
    },
  },
  apiSettings: apollosmsApi.apiSettings,
};

export const base44 = {
  auth: {
    me: renultApi.auth.me,
    logout: async () => clearAuth(),
  },
  entities: {
    Form: localForms,
    Task: {
      ...localTasks,
      comment: async () => ({ message: "Comment saved" }),
      addAssignees: async () => ({ message: "Assignees added" }),
      removeAssignees: async () => ({ message: "Assignees removed" }),
    },
    Document: localDocuments,
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }: { file: File }) => ({ file_url: URL.createObjectURL(file) }),
      InvokeLLM: async () => ({ response: "AI is not configured for this API yet." }),
    },
    Connections: { status: async () => ({}) },
    Google: {
      status: async () => ({}),
      getAuthUrl: async () => ({ auth_url: "#" }),
      disconnect: async () => ({ message: "Disconnected" }),
      pushToDrive: async () => ({ url: "#" }),
    },
    Twitter: {
      getAuthUrl: async () => ({ auth_url: "#", code_verifier: "", redirect_uri: "" }),
      disconnect: async () => ({ message: "Disconnected" }),
    },
    Sheets: { push: async () => ({ url: "#" }) },
    Drive: { smartUpload: async (file: File) => ({ file_url: URL.createObjectURL(file) }) },
  },
};
