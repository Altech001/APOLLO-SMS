import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apollosmsApi,
  ChangePasswordRequest,
  CreateCollectionRequest,
  CreateUserRequest,
  CreateWithdrawalRequest,
  ID,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SendSMSRequest,
  SMSConfigRequest,
  SMSPricingRange,
  SMSTemplateRequest,
  SMSTopupRequest,
  UpdateUserRequest,
} from "./apollosms";

export const apollosmsQueryKeys = {
  health: ["apollosms", "health"] as const,
  me: ["apollosms", "auth", "me"] as const,
  sessions: ["apollosms", "security", "sessions"] as const,
  securityLogs: ["apollosms", "security", "logs"] as const,
  users: ["apollosms", "users"] as const,
  user: (id: ID) => ["apollosms", "users", id] as const,
  topups: ["apollosms", "topups"] as const,
  userTopups: (id: ID) => ["apollosms", "topups", "user", id] as const,
  myTopups: ["apollosms", "topups", "me"] as const,
  templates: ["apollosms", "sms-templates"] as const,
  template: (id: ID) => ["apollosms", "sms-templates", id] as const,
  notifications: (unreadOnly?: boolean) => ["apollosms", "notifications", { unreadOnly }] as const,
  unreadNotifications: ["apollosms", "notifications", "unread"] as const,
  unreadCount: ["apollosms", "notifications", "unread-count"] as const,
  smsConfig: ["apollosms", "sms-config"] as const,
  smsBalance: ["apollosms", "sms-config", "balance"] as const,
  deliveryLogs: (limit?: number) => ["apollosms", "sms-config", "delivery-logs", { limit }] as const,
  failedJobs: (limit?: number) => ["apollosms", "sms-config", "failed-jobs", { limit }] as const,
  usageSummary: ["apollosms", "sms-config", "usage-summary"] as const,
  pricingRanges: ["apollosms", "sms-config", "pricing-ranges"] as const,
  developerKeys: ["apollosms", "developer-keys"] as const,
  collection: (reference: string) => ["apollosms", "payments", "collections", reference] as const,
  transactions: (limit?: number) => ["apollosms", "payments", "transactions", { limit }] as const,
};

export function useHealthCheck() {
  return useQuery({ queryKey: apollosmsQueryKeys.health, queryFn: apollosmsApi.health.check });
}

export function useCurrentUser() {
  return useQuery({ queryKey: apollosmsQueryKeys.me, queryFn: apollosmsApi.auth.me });
}

export function useLogin() {
  return useMutation({ mutationFn: (payload: LoginRequest) => apollosmsApi.auth.login(payload) });
}

export function useRegister() {
  return useMutation({ mutationFn: (payload: RegisterRequest) => apollosmsApi.auth.register(payload) });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (payload: { email: string }) => apollosmsApi.auth.forgotPassword(payload) });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (payload: ResetPasswordRequest) => apollosmsApi.auth.resetPassword(payload) });
}

export function useResendVerification() {
  return useMutation({ mutationFn: (payload: { email: string }) => apollosmsApi.auth.resendVerification(payload) });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (payload: ChangePasswordRequest) => apollosmsApi.auth.changePassword(payload) });
}

export function useSessions() {
  return useQuery({ queryKey: apollosmsQueryKeys.sessions, queryFn: apollosmsApi.security.sessions });
}

export function useSecurityLogs() {
  return useQuery({ queryKey: apollosmsQueryKeys.securityLogs, queryFn: apollosmsApi.security.logs });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apollosmsApi.security.revokeOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.sessions }),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => apollosmsApi.security.revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.sessions }),
  });
}

export function useUsers() {
  return useQuery({ queryKey: apollosmsQueryKeys.users, queryFn: apollosmsApi.users.list });
}

export function useUser(id: ID | null | undefined) {
  return useQuery({
    queryKey: apollosmsQueryKeys.user(id || ""),
    queryFn: () => apollosmsApi.users.get(id as ID),
    enabled: id !== null && id !== undefined && id !== "",
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserRequest) => apollosmsApi.users.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.users }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: ID; payload: UpdateUserRequest }) => apollosmsApi.users.update(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.users });
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.user(variables.id) });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => apollosmsApi.users.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.users }),
  });
}

export function useUploadProfileImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: ID; file: File }) => apollosmsApi.users.uploadProfileImage(id, file),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.users });
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.user(variables.id) });
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.me });
    },
  });
}

export function useAllTopups() {
  return useQuery({ queryKey: apollosmsQueryKeys.topups, queryFn: apollosmsApi.topups.all });
}

export function useMyTopups() {
  return useQuery({ queryKey: apollosmsQueryKeys.myTopups, queryFn: apollosmsApi.topups.mine });
}

export function useUserTopups(userId: ID | null | undefined) {
  return useQuery({
    queryKey: apollosmsQueryKeys.userTopups(userId || ""),
    queryFn: () => apollosmsApi.topups.forUser(userId as ID),
    enabled: userId !== null && userId !== undefined && userId !== "",
  });
}

export function usePerformTopup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: ID; payload: SMSTopupRequest }) => apollosmsApi.topups.perform(userId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.topups });
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.userTopups(variables.userId) });
    },
  });
}

export function useSmsTemplates() {
  return useQuery({ queryKey: apollosmsQueryKeys.templates, queryFn: apollosmsApi.smsTemplates.list });
}

export function useSmsTemplate(id: ID | null | undefined) {
  return useQuery({
    queryKey: apollosmsQueryKeys.template(id || ""),
    queryFn: () => apollosmsApi.smsTemplates.get(id as ID),
    enabled: id !== null && id !== undefined && id !== "",
  });
}

export function useCreateSmsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SMSTemplateRequest) => apollosmsApi.smsTemplates.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.templates }),
  });
}

export function useUpdateSmsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: ID; payload: SMSTemplateRequest }) => apollosmsApi.smsTemplates.update(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.templates });
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.template(variables.id) });
    },
  });
}

export function useDeleteSmsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => apollosmsApi.smsTemplates.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.templates }),
  });
}

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: apollosmsQueryKeys.notifications(unreadOnly),
    queryFn: () => apollosmsApi.notifications.list({ unread_only: unreadOnly }),
  });
}

export function useUnreadNotifications() {
  return useQuery({ queryKey: apollosmsQueryKeys.unreadNotifications, queryFn: apollosmsApi.notifications.unread });
}

export function useUnreadNotificationCount() {
  return useQuery({ queryKey: apollosmsQueryKeys.unreadCount, queryFn: apollosmsApi.notifications.unreadCount });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => apollosmsApi.notifications.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apollosms", "notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apollosmsApi.notifications.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apollosms", "notifications"] }),
  });
}

export function useSendSms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendSMSRequest) => apollosmsApi.sms.send(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.me });
      queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.usageSummary });
    },
  });
}

export function useGatewaySendSms(apiKey: string) {
  return useMutation({ mutationFn: (payload: SendSMSRequest) => apollosmsApi.sms.gatewaySend(apiKey, payload) });
}

export function useSmsConfig() {
  return useQuery({ queryKey: apollosmsQueryKeys.smsConfig, queryFn: apollosmsApi.smsConfig.get });
}

export function useSaveSmsConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SMSConfigRequest) => apollosmsApi.smsConfig.save(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.smsConfig }),
  });
}

export function useSmsGatewayBalance() {
  return useQuery({ queryKey: apollosmsQueryKeys.smsBalance, queryFn: apollosmsApi.smsConfig.balance });
}

export function useDeliveryLogs(limit = 100) {
  return useQuery({
    queryKey: apollosmsQueryKeys.deliveryLogs(limit),
    queryFn: () => apollosmsApi.smsConfig.deliveryLogs({ limit }),
  });
}

export function useFailedJobs(limit = 100) {
  return useQuery({
    queryKey: apollosmsQueryKeys.failedJobs(limit),
    queryFn: () => apollosmsApi.smsConfig.failedJobs({ limit }),
  });
}

export function useUsageSummary() {
  return useQuery({ queryKey: apollosmsQueryKeys.usageSummary, queryFn: apollosmsApi.smsConfig.usageSummary });
}

export function usePricingRanges() {
  return useQuery({ queryKey: apollosmsQueryKeys.pricingRanges, queryFn: apollosmsApi.smsConfig.pricingRanges });
}

export function useSavePricingRanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SMSPricingRange[]) => apollosmsApi.smsConfig.savePricingRanges(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.pricingRanges }),
  });
}

export function useDeveloperKeys() {
  return useQuery({ queryKey: apollosmsQueryKeys.developerKeys, queryFn: apollosmsApi.developerKeys.list });
}

export function useCreateDeveloperKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string }) => apollosmsApi.developerKeys.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.developerKeys }),
  });
}

export function useRevokeDeveloperKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => apollosmsApi.developerKeys.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.developerKeys }),
  });
}

export function useCreateCollection() {
  return useMutation({ mutationFn: (payload: CreateCollectionRequest) => apollosmsApi.payments.createCollection(payload) });
}

export function useCollection(reference: string | null | undefined) {
  return useQuery({
    queryKey: apollosmsQueryKeys.collection(reference || ""),
    queryFn: () => apollosmsApi.payments.getCollection(reference as string),
    enabled: Boolean(reference),
  });
}

export function usePaymentTransactions(limit = 100) {
  return useQuery({
    queryKey: apollosmsQueryKeys.transactions(limit),
    queryFn: () => apollosmsApi.payments.transactions({ limit }),
  });
}

export function useCreateWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWithdrawalRequest) => apollosmsApi.payments.createWithdrawal(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.transactions() }),
  });
}
