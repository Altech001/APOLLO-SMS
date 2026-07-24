import { useQuery } from "@tanstack/react-query";

import { base44, renultApi, type ID, type SmsDashboardResponse } from "@/api/apollosms";

export type DashboardDateRange = "today" | "week" | "month" | "year";

const MINUTE = 60 * 1000;

const smsDashboardStaleTime: Record<DashboardDateRange, number> = {
  today: 2 * MINUTE,
  week: 10 * MINUTE,
  month: 20 * MINUTE,
  year: 60 * MINUTE,
};

const dashboardQueryOptions = {
  gcTime: 60 * MINUTE,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: 1,
} as const;

const userKey = (userId: ID | null | undefined) => String(userId || "anonymous");

export const dashboardQueryKeys = {
  all: ["dashboard"] as const,
  forms: (userId: ID | null | undefined) => ["dashboard", "forms", userKey(userId)] as const,
  smsAll: (userId: ID | null | undefined) => ["dashboard", "sms", userKey(userId)] as const,
  sms: (userId: ID | null | undefined, range: DashboardDateRange) => ["dashboard", "sms", userKey(userId), range] as const,
};

export function useDashboardForms(userId: ID | null | undefined) {
  return useQuery({
    queryKey: dashboardQueryKeys.forms(userId),
    queryFn: () => base44.entities.Form.list(),
    enabled: Boolean(userId),
    staleTime: 20 * MINUTE,
    ...dashboardQueryOptions,
  });
}

export function useDashboardSmsDashboard(userId: ID | null | undefined, range: DashboardDateRange = "month") {
  return useQuery<SmsDashboardResponse>({
    queryKey: dashboardQueryKeys.sms(userId, range),
    queryFn: () => renultApi.sms.dashboard({ range }),
    enabled: Boolean(userId),
    staleTime: smsDashboardStaleTime[range],
    placeholderData: (previousData) => previousData,
    ...dashboardQueryOptions,
  });
}
