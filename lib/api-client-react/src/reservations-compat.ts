// Generated compatibility exports. Do not edit manually.
export {
  arriveReservation,
  createReservation,
  deleteReservation,
  getArriveReservationMutationOptions,
  getArriveReservationUrl,
  getCreateReservationMutationOptions,
  getCreateReservationUrl,
  getDeleteReservationMutationOptions,
  getDeleteReservationUrl,
  getGetReservationsQueryKey,
  getGetReservationsQueryOptions,
  getGetReservationsUrl,
  getPatchReservationMutationOptions,
  getPatchReservationUrl,
  getReservations,
  patchReservation,
  useCreateReservation,
  useDeleteReservation,
  useGetReservations,
  usePatchReservation,
} from "./reservations-generated/api";
export type {
  ArriveReservationMutationBody,
  ArriveReservationMutationError,
  ArriveReservationMutationResult,
  CreateReservationMutationBody,
  CreateReservationMutationError,
  CreateReservationMutationResult,
  DeleteReservationMutationError,
  DeleteReservationMutationResult,
  GetReservationsQueryError,
  GetReservationsQueryResult,
  PatchReservationMutationBody,
  PatchReservationMutationError,
  PatchReservationMutationResult,
} from "./reservations-generated/api";
import { useArriveReservation as useGeneratedArriveReservation } from "./reservations-generated/api";
type GeneratedArriveMutation = ReturnType<typeof useGeneratedArriveReservation>;
export interface LegacyArriveReservationVariables { id: string; openTable?: boolean }
export function useArriveReservation(options?: Parameters<typeof useGeneratedArriveReservation>[0]): Omit<GeneratedArriveMutation, "mutate" | "mutateAsync"> & {
  mutate: (variables: LegacyArriveReservationVariables, options?: Parameters<GeneratedArriveMutation["mutate"]>[1]) => void;
  mutateAsync: (variables: LegacyArriveReservationVariables, options?: Parameters<GeneratedArriveMutation["mutateAsync"]>[1]) => ReturnType<GeneratedArriveMutation["mutateAsync"]>;
} {
  const generated = useGeneratedArriveReservation(options);
  const map = ({ id, openTable }: LegacyArriveReservationVariables) => ({ id, data: { openTable } });
  return {
    ...generated,
    mutate: (variables, mutationOptions) => generated.mutate(map(variables), mutationOptions),
    mutateAsync: (variables, mutationOptions) => generated.mutateAsync(map(variables), mutationOptions),
  };
}
