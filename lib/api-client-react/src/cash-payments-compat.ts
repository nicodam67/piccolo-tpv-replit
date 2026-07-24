// Entrega 62 — stable Cash & Payments API over the phase61 generated client.
import {
  useMutation,
  useQuery,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as generated from "./cash-payments-generated/api";
import * as schemas from "./cash-payments-generated/api.schemas";

type MutationOptions<TResult, TError, TVariables, TContext> = {
  mutation?: UseMutationOptions<TResult, TError, TVariables, TContext>;
  request?: RequestInit;
};

type QueryOptions<TResult, TError, TData> = {
  query?: UseQueryOptions<TResult, TError, TData>;
  request?: RequestInit;
};

function mutationOptions<TResult, TError, TVariables, TContext>(
  key: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
  options?: MutationOptions<TResult, TError, TVariables, TContext>,
): UseMutationOptions<TResult, TError, TVariables, TContext> {
  return {
    mutationKey: [key],
    mutationFn,
    ...options?.mutation,
  };
}

/** Attach an explicit idempotency key without logging or placing it in a URL. */
export function idempotencyRequest(key: string, init: RequestInit = {}): RequestInit {
  if (key.length < 8 || key.length > 200) {
    throw new Error("Idempotency-Key must contain between 8 and 200 characters");
  }
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", key);
  return { ...init, headers };
}

/** Fail before sending a physical command when its mandatory key is absent. */
export function requireIdempotencyRequest(init: RequestInit | undefined): RequestInit {
  const key = new Headers(init?.headers).get("Idempotency-Key");
  if (!key) throw new Error("Idempotency-Key is required for physical cash commands");
  return idempotencyRequest(key, init);
}

/** Presentation-only label; persisted backend status is returned unchanged elsewhere. */
export function cashPaymentStatusLabel(status: string): string {
  if (status === "completed") return "Completado";
  if (status === "voided") return "Anulado";
  if (status === "completada") return "Completada";
  return status;
}

export type PaymentMethod = schemas.CashPaymentsMethod;
export type CashSession = schemas.CashPaymentsSession;
export type CashSessionWithEmployee = schemas.CashPaymentsSessionWithEmployee;
export type CashMovement = schemas.CashPaymentsMovement;
export type CashSessionSummary = schemas.CashPaymentsSessionSummary;
export type OpenCashSessionInput = schemas.CashPaymentsOpenSessionInput;
export type AddCashMovementInput = schemas.CashPaymentsCreateMovementInput;
export type AddCashMovementInputMovementType = schemas.CashPaymentsMovementType;
export type CloseCashSessionInput = schemas.CashPaymentsCloseSessionInput;
export type PaymentSummary = schemas.CashPaymentsOrderSummary;
export type AddPaymentInput = schemas.CashPaymentsCreateOrderPaymentInput;
export type AddPaymentInputMethodCode = schemas.CashPaymentsCreateOrderPaymentInputMethodCode;
export type PaymentResult = schemas.CashPaymentsResult;
export interface TicketData {
  ticket: {
    id: string;
    orderId: string;
    ticketNumber: number;
    subtotal: string;
    taxTotal: string;
    total: string;
    issuedAt: string;
  };
  order: { id: string; tableName?: string | null; createdAt?: string };
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    taxRate?: number;
  }>;
  taxBreakdown: schemas.TaxBreakdownItem[];
  payments: Array<{ amount: string; methodName: string }>;
  employeeName?: string | null;
}
export type Tip = schemas.CashPaymentsTip;
export type AddTipInput = schemas.CashPaymentsCreateTipInput;
export type SplitGroupItemDetail =
  | schemas.CashPaymentsSplitItem
  | schemas.CashPaymentsCreatedSplitGroupItemsItem;
export type SplitGroupWithItems = Omit<schemas.CashPaymentsSplitGroup, "items" | "paid"> & {
  items: SplitGroupItemDetail[];
  paid?: string;
};
export type CreateSplitGroupsInput = schemas.CashPaymentsCreateSplitsInput;
export type MarkSplitGroupPaidInput = schemas.CashPaymentsMarkSplitPaidInput;
export type ZReport = schemas.CashPaymentsZReport;
export type XReport = schemas.CashPaymentsXReport;
export type VoidPaymentInput = schemas.CashPaymentsVoidInput;
export type CashMachineConfig = schemas.CashPaymentsMachineConfig;
export type UpdateCashMachineConfigInput = schemas.CashPaymentsUpdateMachineConfigInput;
export type TestCashMachineConnectionResult = schemas.CashPaymentsMachineConnectionResult;
export type CashMachineDeviceStatus = schemas.CashPaymentsMachineStatus;
export type CashMachineCashLevel = schemas.CashPaymentsMachineCashLevel;
export type StartCashMachinePaymentInput = schemas.CashPaymentsStartMachinePaymentInput;
export type CashMachineTransaction = schemas.CashPaymentsMachineTransaction;
export type CashMachinePaymentResult = schemas.CashPaymentsMachineCommandResult;
export type CashMachineRefundInput = schemas.CashPaymentsMachineRefundInput;
export type CashMachineSessionSummary = schemas.CashPaymentsMachineSessionSummary;
export type CashSessionHistoryItem = schemas.CashPaymentsSessionHistoryItem;

export const AddCashMovementInputMovementType = schemas.CashPaymentsMovementType;

export const getPaymentMethods = generated.listCashPaymentMethods;
export const getGetPaymentMethodsQueryKey = generated.getListCashPaymentMethodsQueryKey;
export const getGetPaymentMethodsQueryOptions = generated.getListCashPaymentMethodsQueryOptions;
export const useGetPaymentMethods = generated.useListCashPaymentMethods;

export type GetCurrentCashSessionParams = schemas.GetCurrentCashPaymentsSessionParams;
export const getGetCurrentCashSessionQueryKey = (params?: GetCurrentCashSessionParams) =>
  ["/api/cash-sessions/current", ...(params?.terminal ? [params.terminal] : [])] as const;

export const getCurrentCashSession = generated.getCurrentCashPaymentsSession;
export function useGetCurrentCashSession<
  TData = Awaited<ReturnType<typeof getCurrentCashSession>>,
  TError = Error,
>(
  params?: GetCurrentCashSessionParams,
  options?: QueryOptions<Awaited<ReturnType<typeof getCurrentCashSession>>, TError, TData>,
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getGetCurrentCashSessionQueryKey(params);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getCurrentCashSession(params, { signal, ...options?.request }),
    ...options?.query,
  }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  query.queryKey = queryKey;
  return query;
}

export const getCashSessionSummary = generated.getCashPaymentsSessionSummary;
export const getGetCashSessionSummaryQueryKey = generated.getGetCashPaymentsSessionSummaryQueryKey;
export const getGetCashSessionSummaryQueryOptions = generated.getGetCashPaymentsSessionSummaryQueryOptions;
export const useGetCashSessionSummary = generated.useGetCashPaymentsSessionSummary;

export const getCashSessionReport = generated.getCashPaymentsSessionReport;
export const getGetCashSessionReportQueryKey = generated.getGetCashPaymentsSessionReportQueryKey;
export const getGetCashSessionReportQueryOptions = generated.getGetCashPaymentsSessionReportQueryOptions;
export const useGetCashSessionReport = generated.useGetCashPaymentsSessionReport;

export const getCashSessionXReport = generated.getCashPaymentsSessionXReport;
export const getGetCashSessionXReportQueryKey = generated.getGetCashPaymentsSessionXReportQueryKey;
export const getGetCashSessionXReportQueryOptions = generated.getGetCashPaymentsSessionXReportQueryOptions;
export const useGetCashSessionXReport = generated.useGetCashPaymentsSessionXReport;

export const getCashSessionHistory = generated.listCashPaymentsSessionHistory;
export const getGetCashSessionHistoryQueryKey = generated.getListCashPaymentsSessionHistoryQueryKey;
export const getGetCashSessionHistoryQueryOptions = generated.getListCashPaymentsSessionHistoryQueryOptions;
export const useGetCashSessionHistory = generated.useListCashPaymentsSessionHistory;

export const getOrderPaymentSummary = generated.getOrderCashPaymentSummary;
export const getGetOrderPaymentSummaryQueryKey = generated.getGetOrderCashPaymentSummaryQueryKey;
export const getGetOrderPaymentSummaryQueryOptions = generated.getGetOrderCashPaymentSummaryQueryOptions;
export const useGetOrderPaymentSummary = generated.useGetOrderCashPaymentSummary;

export async function getOrderTicket(orderId: string, options?: RequestInit): Promise<TicketData> {
  return generated.getOrderCashPaymentTicket(orderId, options) as unknown as Promise<TicketData>;
}
export const getGetOrderTicketQueryKey = generated.getGetOrderCashPaymentTicketQueryKey;
export function useGetOrderTicket<TData = TicketData, TError = Error>(
  orderId: string,
  options?: QueryOptions<TicketData, TError, TData>,
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getGetOrderTicketQueryKey(orderId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getOrderTicket(orderId, { signal, ...options?.request }),
    enabled: Boolean(orderId),
    ...options?.query,
  }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  query.queryKey = queryKey;
  return query;
}

export async function getOrderSplits(
  orderId: string,
  options?: RequestInit,
): Promise<SplitGroupWithItems[]> {
  return generated.listOrderCashPaymentSplits(orderId, options) as unknown as Promise<SplitGroupWithItems[]>;
}
export const getGetOrderSplitsQueryKey = generated.getListOrderCashPaymentSplitsQueryKey;
export function useGetOrderSplits<TData = SplitGroupWithItems[], TError = Error>(
  orderId: string,
  options?: QueryOptions<SplitGroupWithItems[], TError, TData>,
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getGetOrderSplitsQueryKey(orderId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getOrderSplits(orderId, { signal, ...options?.request }),
    enabled: Boolean(orderId),
    ...options?.query,
  }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  query.queryKey = queryKey;
  return query;
}

export const getCashMachineConfig = generated.getCashPaymentsMachineConfig;
export const getGetCashMachineConfigQueryKey = generated.getGetCashPaymentsMachineConfigQueryKey;
export const getGetCashMachineConfigQueryOptions = generated.getGetCashPaymentsMachineConfigQueryOptions;
export const useGetCashMachineConfig = generated.useGetCashPaymentsMachineConfig;

export const getCashMachineStatus = generated.getCashPaymentsMachineStatus;
export const getGetCashMachineStatusQueryKey = generated.getGetCashPaymentsMachineStatusQueryKey;
export const getGetCashMachineStatusQueryOptions = generated.getGetCashPaymentsMachineStatusQueryOptions;
export const useGetCashMachineStatus = generated.useGetCashPaymentsMachineStatus;

export const getCashMachineCashLevels = generated.getCashPaymentsMachineCashLevels;
export const getGetCashMachineCashLevelsQueryKey = generated.getGetCashPaymentsMachineCashLevelsQueryKey;
export const getGetCashMachineCashLevelsQueryOptions = generated.getGetCashPaymentsMachineCashLevelsQueryOptions;
export const useGetCashMachineCashLevels = generated.useGetCashPaymentsMachineCashLevels;

export const getCashMachinePayment = generated.getCashPaymentsMachinePayment;
export const getGetCashMachinePaymentQueryKey = generated.getGetCashPaymentsMachinePaymentQueryKey;
export const getGetCashMachinePaymentQueryOptions = generated.getGetCashPaymentsMachinePaymentQueryOptions;
export const useGetCashMachinePayment = generated.useGetCashPaymentsMachinePayment;

export const getCashMachineSessionSummary = generated.getCashPaymentsMachineSessionSummary;
export const getGetCashMachineSessionSummaryQueryKey = generated.getGetCashPaymentsMachineSessionSummaryQueryKey;
export const getGetCashMachineSessionSummaryQueryOptions = generated.getGetCashPaymentsMachineSessionSummaryQueryOptions;
export const useGetCashMachineSessionSummary = generated.useGetCashPaymentsMachineSessionSummary;

export function useOpenCashSession(
  options?: Parameters<typeof generated.useOpenCashPaymentsSession>[0],
) {
  return generated.useOpenCashPaymentsSession({
    ...options,
    mutation: { mutationKey: ["openCashSession"], ...options?.mutation },
  });
}

export function useAddCashMovement(
  options?: Parameters<typeof generated.useCreateCashPaymentMovement>[0],
) {
  return generated.useCreateCashPaymentMovement({
    ...options,
    mutation: { mutationKey: ["addCashMovement"], ...options?.mutation },
  });
}

export function useCloseCashSession(
  options?: Parameters<typeof generated.useCloseCashPaymentsSession>[0],
) {
  return generated.useCloseCashPaymentsSession({
    ...options,
    mutation: { mutationKey: ["closeCashSession"], ...options?.mutation },
  });
}

export function useAddPayment(
  options?: Parameters<typeof generated.useCreateOrderCashPayment>[0],
) {
  return generated.useCreateOrderCashPayment({
    ...options,
    mutation: { mutationKey: ["addPayment"], ...options?.mutation },
  });
}

export function useReopenCashSession(
  options?: Parameters<typeof generated.useReopenCashPaymentsSession>[0],
) {
  return generated.useReopenCashPaymentsSession({
    ...options,
    mutation: { mutationKey: ["reopenCashSession"], ...options?.mutation },
  });
}

export function useCancelCashMachinePayment(
  options?: Parameters<typeof generated.useCancelCashPaymentsMachinePayment>[0],
) {
  return generated.useCancelCashPaymentsMachinePayment({
    ...options,
    mutation: { mutationKey: ["cancelCashMachinePayment"], ...options?.mutation },
  });
}

export function useUpdateCashMachineConfig(
  options?: Parameters<typeof generated.useUpsertCashPaymentsMachineConfig>[0],
) {
  return generated.useUpsertCashPaymentsMachineConfig({
    ...options,
    mutation: { mutationKey: ["updateCashMachineConfig"], ...options?.mutation },
  });
}

export async function startCashMachinePayment(
  data: schemas.CashPaymentsStartMachinePaymentInput,
  options?: RequestInit,
) {
  return generated.startCashPaymentsMachinePayment(data, requireIdempotencyRequest(options));
}

export async function createCashMachineRefund(
  data: schemas.CashPaymentsMachineRefundInput,
  options?: RequestInit,
) {
  return generated.createCashPaymentsMachineRefund(data, requireIdempotencyRequest(options));
}

export function useStartCashMachinePayment<
  TError = Error,
  TContext = unknown,
>(
  options?: MutationOptions<
    schemas.CashPaymentsMachineCommandResult,
    TError,
    { data: schemas.CashPaymentsStartMachinePaymentInput },
    TContext
  >,
) {
  return useMutation(mutationOptions(
    "startCashMachinePayment",
    ({ data }) => startCashMachinePayment(data, options?.request),
    options,
  ));
}

export function useCreateCashMachineRefund<
  TError = Error,
  TContext = unknown,
>(
  options?: MutationOptions<
    schemas.CashPaymentsMachineCommandResult,
    TError,
    { data: schemas.CashPaymentsMachineRefundInput },
    TContext
  >,
) {
  return useMutation(mutationOptions(
    "createCashMachineRefund",
    ({ data }) => createCashMachineRefund(data, options?.request),
    options,
  ));
}

export function useAddTip<TError = Error, TContext = unknown>(
  options?: MutationOptions<
    schemas.CashPaymentsTip,
    TError,
    { paymentId: string; data: schemas.CashPaymentsCreateTipInput },
    TContext
  >,
): UseMutationResult<
  schemas.CashPaymentsTip,
  TError,
  { paymentId: string; data: schemas.CashPaymentsCreateTipInput },
  TContext
> {
  return useMutation(mutationOptions(
    "addTip",
    ({ paymentId, data }) => generated.createCashPaymentTip(paymentId, data, options?.request),
    options,
  ));
}

export function useCreateOrderSplits<TError = Error, TContext = unknown>(
  options?: MutationOptions<
    SplitGroupWithItems[],
    TError,
    { orderId: string; data: schemas.CashPaymentsCreateSplitsInput },
    TContext
  >,
) {
  return useMutation(mutationOptions(
    "createOrderSplits",
    async ({ orderId, data }) =>
      generated.createOrderCashPaymentSplits(orderId, data, options?.request) as unknown as Promise<SplitGroupWithItems[]>,
    options,
  ));
}

export function useMarkSplitGroupPaid<TError = Error, TContext = unknown>(
  options?: MutationOptions<
    schemas.CashPaymentsSplitGroup,
    TError,
    { orderId: string; groupId: string; data: schemas.CashPaymentsMarkSplitPaidInput },
    TContext
  >,
) {
  return useMutation(mutationOptions(
    "markSplitGroupPaid",
    ({ orderId, groupId, data }) =>
      generated.markOrderCashPaymentSplitPaid(orderId, groupId, data, options?.request),
    options,
  ));
}

export function useVoidPayment<TError = Error, TContext = unknown>(
  options?: MutationOptions<
    schemas.CashPaymentsVoid,
    TError,
    { sessionId: string; data: schemas.CashPaymentsVoidInput },
    TContext
  >,
) {
  return useMutation(mutationOptions(
    "voidPayment",
    ({ sessionId, data }) => generated.voidCashSessionPayment(sessionId, data, options?.request),
    options,
  ));
}

export function useTestCashMachineConnection<TError = Error, TContext = unknown>(
  options?: MutationOptions<
    schemas.CashPaymentsMachineConnectionResult,
    TError,
    { data: Record<string, unknown> },
    TContext
  >,
) {
  return useMutation(mutationOptions(
    "testCashMachineConnection",
    () => generated.testCashPaymentsMachineConnection(options?.request),
    options,
  ));
}

export const getCashPaymentsMethodReport = generated.getCashPaymentsMethodReport;
export const getCashPaymentsMethodReportQueryKey = (
  params: schemas.GetCashPaymentsMethodReportParams,
) => ["reports", "payments", params.from, params.to] as const;
export function useGetCashPaymentsMethodReport(
  params: schemas.GetCashPaymentsMethodReportParams,
) {
  return generated.useGetCashPaymentsMethodReport(params, {
    query: { queryKey: getCashPaymentsMethodReportQueryKey(params) },
  });
}

export const getCashPaymentsSessionReportList = generated.getCashPaymentsSessionReportList;
export const getCashPaymentsSessionReportListQueryKey = (
  params: schemas.GetCashPaymentsSessionReportListParams,
) => ["reports", "cash", params.from, params.to] as const;
export function useGetCashPaymentsSessionReportList(
  params: schemas.GetCashPaymentsSessionReportListParams,
) {
  return generated.useGetCashPaymentsSessionReportList(params, {
    query: { queryKey: getCashPaymentsSessionReportListQueryKey(params) },
  });
}

export const listOrderCashPaymentTips = generated.listOrderCashPaymentTips;
export const useListOrderCashPaymentTips = generated.useListOrderCashPaymentTips;
export const reconcileCashPaymentsMachinePayment = generated.reconcileCashPaymentsMachinePayment;
export const useReconcileCashPaymentsMachinePayment = generated.useReconcileCashPaymentsMachinePayment;
export const listCashPaymentsMachineTransactions = generated.listCashPaymentsMachineTransactions;
export const useListCashPaymentsMachineTransactions = generated.useListCashPaymentsMachineTransactions;
