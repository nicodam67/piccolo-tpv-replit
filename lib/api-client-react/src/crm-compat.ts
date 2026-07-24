// Generated compatibility exports. Do not edit manually.
export {
  createCrmClient,
  createCrmPromotion,
  getCreateCrmClientMutationOptions,
  getCreateCrmClientUrl,
  getCreateCrmPromotionMutationOptions,
  getCreateCrmPromotionUrl,
  getCrmClient,
  getCrmClientHistory,
  getCrmClients,
  getCrmLoyaltyConfig,
  getCrmPromotions,
  getCrmReports,
  getGetCrmClientHistoryQueryKey,
  getGetCrmClientHistoryQueryOptions,
  getGetCrmClientHistoryUrl,
  getGetCrmClientQueryKey,
  getGetCrmClientQueryOptions,
  getGetCrmClientUrl,
  getGetCrmClientsQueryKey,
  getGetCrmClientsQueryOptions,
  getGetCrmClientsUrl,
  getGetCrmLoyaltyConfigQueryKey,
  getGetCrmLoyaltyConfigQueryOptions,
  getGetCrmLoyaltyConfigUrl,
  getGetCrmPromotionsQueryKey,
  getGetCrmPromotionsQueryOptions,
  getGetCrmPromotionsUrl,
  getGetCrmReportsQueryKey,
  getGetCrmReportsQueryOptions,
  getGetCrmReportsUrl,
  getIssueCrmPointsMutationOptions,
  getIssueCrmPointsUrl,
  getRedeemCrmPointsMutationOptions,
  getRedeemCrmPointsUrl,
  getUpdateCrmClientMutationOptions,
  getUpdateCrmClientUrl,
  getUpdateCrmLoyaltyConfigMutationOptions,
  getUpdateCrmLoyaltyConfigUrl,
  getValidateCrmPromotionMutationOptions,
  getValidateCrmPromotionUrl,
  updateCrmClient,
  updateCrmLoyaltyConfig,
  useCreateCrmClient,
  useCreateCrmPromotion,
  useGetCrmClient,
  useGetCrmClientHistory,
  useGetCrmClients,
  useGetCrmLoyaltyConfig,
  useGetCrmPromotions,
  useGetCrmReports,
  useUpdateCrmClient,
  useUpdateCrmLoyaltyConfig,
  useValidateCrmPromotion,
  validateCrmPromotion,
} from "./crm-generated/api";
export type {
  CreateCrmClientMutationBody,
  CreateCrmClientMutationError,
  CreateCrmClientMutationResult,
  CreateCrmPromotionMutationBody,
  CreateCrmPromotionMutationError,
  CreateCrmPromotionMutationResult,
  GetCrmClientHistoryQueryError,
  GetCrmClientHistoryQueryResult,
  GetCrmClientQueryError,
  GetCrmClientQueryResult,
  GetCrmClientsQueryError,
  GetCrmClientsQueryResult,
  GetCrmLoyaltyConfigQueryError,
  GetCrmLoyaltyConfigQueryResult,
  GetCrmPromotionsQueryError,
  GetCrmPromotionsQueryResult,
  GetCrmReportsQueryError,
  GetCrmReportsQueryResult,
  IssueCrmPointsMutationBody,
  IssueCrmPointsMutationError,
  IssueCrmPointsMutationResult,
  RedeemCrmPointsMutationBody,
  RedeemCrmPointsMutationError,
  RedeemCrmPointsMutationResult,
  UpdateCrmClientMutationBody,
  UpdateCrmClientMutationError,
  UpdateCrmClientMutationResult,
  UpdateCrmLoyaltyConfigMutationBody,
  UpdateCrmLoyaltyConfigMutationError,
  UpdateCrmLoyaltyConfigMutationResult,
  ValidateCrmPromotionMutationBody,
  ValidateCrmPromotionMutationError,
  ValidateCrmPromotionMutationResult,
} from "./crm-generated/api";
export type {
  CreateCrmClientInput,
  CreateCrmPromotionInput,
  CrmClient,
  CrmClientConflictError,
  CrmClientConflictErrorClienteExistente,
  CrmClientHistory,
  CrmClientHistoryOrderSummary,
  CrmClientHistoryStats,
  CrmLoyaltyConfig,
  CrmLoyaltyPoint,
  CrmPromotion,
  CrmReports,
  GetCrmClientsParams,
  IssueCrmPointsInput,
  RedeemCrmPointsInput,
  RedeemCrmPointsResult,
  UpdateCrmClientInput,
  UpdateCrmLoyaltyConfigInput,
  ValidateCrmPromotionInput,
  ValidateCrmPromotionResult,
} from "./crm-generated/api.schemas";
import {
  issueCrmPoints as generatedIssueCrmPoints,
  redeemCrmPoints as generatedRedeemCrmPoints,
  useIssueCrmPoints as useGeneratedIssueCrmPoints,
  useRedeemCrmPoints as useGeneratedRedeemCrmPoints,
} from "./crm-generated/api";
import type { IssueCrmPointsInput, RedeemCrmPointsInput } from "./crm-generated/api.schemas";
import type { BodyType } from "./custom-fetch";

export function issueCrmPoints(
  clientId: string,
  data: BodyType<IssueCrmPointsInput>,
  options?: RequestInit,
) {
  return generatedIssueCrmPoints(clientId, data, options);
}

export function redeemCrmPoints(
  clientId: string,
  data: BodyType<RedeemCrmPointsInput>,
  options?: RequestInit,
) {
  return generatedRedeemCrmPoints(clientId, data, options);
}

export interface LegacyIssueCrmPointsVariables {
  clientId: string;
  data: BodyType<IssueCrmPointsInput>;
}

export interface LegacyRedeemCrmPointsVariables {
  clientId: string;
  data: BodyType<RedeemCrmPointsInput>;
}

type GeneratedIssueMutation = ReturnType<typeof useGeneratedIssueCrmPoints>;
type GeneratedRedeemMutation = ReturnType<typeof useGeneratedRedeemCrmPoints>;

export function useIssueCrmPoints(
  options?: Parameters<typeof useGeneratedIssueCrmPoints>[0],
): Omit<GeneratedIssueMutation, "mutate" | "mutateAsync"> & {
  mutate: (variables: LegacyIssueCrmPointsVariables, options?: Parameters<GeneratedIssueMutation["mutate"]>[1]) => void;
  mutateAsync: (variables: LegacyIssueCrmPointsVariables, options?: Parameters<GeneratedIssueMutation["mutateAsync"]>[1]) => ReturnType<GeneratedIssueMutation["mutateAsync"]>;
} {
  const generated = useGeneratedIssueCrmPoints(options);
  const map = ({ clientId, data }: LegacyIssueCrmPointsVariables) => ({ id: clientId, data });
  return {
    ...generated,
    mutate: (variables, mutationOptions) => generated.mutate(map(variables), mutationOptions),
    mutateAsync: (variables, mutationOptions) => generated.mutateAsync(map(variables), mutationOptions),
  };
}

export function useRedeemCrmPoints(
  options?: Parameters<typeof useGeneratedRedeemCrmPoints>[0],
): Omit<GeneratedRedeemMutation, "mutate" | "mutateAsync"> & {
  mutate: (variables: LegacyRedeemCrmPointsVariables, options?: Parameters<GeneratedRedeemMutation["mutate"]>[1]) => void;
  mutateAsync: (variables: LegacyRedeemCrmPointsVariables, options?: Parameters<GeneratedRedeemMutation["mutateAsync"]>[1]) => ReturnType<GeneratedRedeemMutation["mutateAsync"]>;
} {
  const generated = useGeneratedRedeemCrmPoints(options);
  const map = ({ clientId, data }: LegacyRedeemCrmPointsVariables) => ({ id: clientId, data });
  return {
    ...generated,
    mutate: (variables, mutationOptions) => generated.mutate(map(variables), mutationOptions),
    mutateAsync: (variables, mutationOptions) => generated.mutateAsync(map(variables), mutationOptions),
  };
}
