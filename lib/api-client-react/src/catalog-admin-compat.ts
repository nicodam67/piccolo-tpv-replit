// Entrega 60 — Catalog Admin compatibility layer over catalog-admin-generated.
export * from "./catalog-admin-adapters";

import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import {
  exportCatalogAdminProducts,
  getCatalogAdminProductAllergens,
  importCatalogAdminProducts,
  patchCatalogAdminProductSoldout,
  recalculateCatalogAdminProductAllergens,
  updateCatalogAdminProduct,
  updateCatalogProductFormat,
  useImportCatalogAdminProducts,
  createCatalogAdminModifier as createAdminModifierInternal,
  useCreateCatalogAdminModifier,
} from "./catalog-admin-generated/api";
import type {
  CatalogProductImportResult,
  CatalogTaxRate,
} from "./catalog-admin-generated/api.schemas";

export {
  getCatalogStaffCategories as getCategories,
  getGetCatalogStaffCategoriesQueryKey as getGetCategoriesQueryKey,
  getGetCatalogStaffCategoriesQueryOptions as getGetCategoriesQueryOptions,
  getGetCatalogStaffCategoriesUrl as getGetCategoriesUrl,
  useGetCatalogStaffCategories as useGetCategories,
  getCatalogStaffCategoryProducts as getCategoryProducts,
  getGetCatalogStaffCategoryProductsQueryKey as getGetCategoryProductsQueryKey,
  getGetCatalogStaffCategoryProductsQueryOptions as getGetCategoryProductsQueryOptions,
  getGetCatalogStaffCategoryProductsUrl as getGetCategoryProductsUrl,
  useGetCatalogStaffCategoryProducts as useGetCategoryProducts,
  getCatalogProductModifiers as getProductModifiers,
  getGetCatalogProductModifiersQueryKey as getGetProductModifiersQueryKey,
  getGetCatalogProductModifiersQueryOptions as getGetProductModifiersQueryOptions,
  getGetCatalogProductModifiersUrl as getGetProductModifiersUrl,
  useGetCatalogProductModifiers as useGetProductModifiers,
  getCatalogProductFormats as getProductFormats,
  getGetCatalogProductFormatsQueryKey as getGetProductFormatsQueryKey,
  getGetCatalogProductFormatsQueryOptions as getGetProductFormatsQueryOptions,
  getGetCatalogProductFormatsUrl as getGetProductFormatsUrl,
  useGetCatalogProductFormats as useGetProductFormats,
  getCatalogAdminCategories as getAdminCategories,
  getGetCatalogAdminCategoriesQueryKey as getGetAdminCategoriesQueryKey,
  getGetCatalogAdminCategoriesQueryOptions as getGetAdminCategoriesQueryOptions,
  getGetCatalogAdminCategoriesUrl as getGetAdminCategoriesUrl,
  useGetCatalogAdminCategories as useGetAdminCategories,
  createCatalogAdminCategory as createAdminCategory,
  useCreateCatalogAdminCategory as useCreateAdminCategory,
  getCreateCatalogAdminCategoryMutationOptions as getCreateAdminCategoryMutationOptions,
  getCreateCatalogAdminCategoryUrl as getCreateAdminCategoryUrl,
  updateCatalogAdminCategory as updateAdminCategory,
  useUpdateCatalogAdminCategory as useUpdateAdminCategory,
  getUpdateCatalogAdminCategoryMutationOptions as getUpdateAdminCategoryMutationOptions,
  getUpdateCatalogAdminCategoryUrl as getUpdateAdminCategoryUrl,
  deleteCatalogAdminCategory as deleteAdminCategory,
  useDeleteCatalogAdminCategory as useDeleteAdminCategory,
  getDeleteCatalogAdminCategoryMutationOptions as getDeleteAdminCategoryMutationOptions,
  getDeleteCatalogAdminCategoryUrl as getDeleteAdminCategoryUrl,
  createCatalogAdminSubcategory as createSubcategory,
  useCreateCatalogAdminSubcategory as useCreateSubcategory,
  getCreateCatalogAdminSubcategoryMutationOptions as getCreateSubcategoryMutationOptions,
  getCreateCatalogAdminSubcategoryUrl as getCreateSubcategoryUrl,
  updateCatalogAdminSubcategory as updateSubcategory,
  useUpdateCatalogAdminSubcategory as useUpdateSubcategory,
  getUpdateCatalogAdminSubcategoryMutationOptions as getUpdateSubcategoryMutationOptions,
  getUpdateCatalogAdminSubcategoryUrl as getUpdateSubcategoryUrl,
  deleteCatalogAdminSubcategory as deleteSubcategory,
  useDeleteCatalogAdminSubcategory as useDeleteSubcategory,
  getDeleteCatalogAdminSubcategoryMutationOptions as getDeleteSubcategoryMutationOptions,
  getDeleteCatalogAdminSubcategoryUrl as getDeleteSubcategoryUrl,
  getCatalogAdminProducts as getAdminProducts,
  getGetCatalogAdminProductsQueryKey as getGetAdminProductsQueryKey,
  getGetCatalogAdminProductsQueryOptions as getGetAdminProductsQueryOptions,
  getGetCatalogAdminProductsUrl as getGetAdminProductsUrl,
  useGetCatalogAdminProducts as useGetAdminProducts,
  createCatalogAdminProduct as createAdminProduct,
  useCreateCatalogAdminProduct as useCreateAdminProduct,
  getCreateCatalogAdminProductMutationOptions as getCreateAdminProductMutationOptions,
  getCreateCatalogAdminProductUrl as getCreateAdminProductUrl,
  updateCatalogAdminProduct as updateAdminProduct,
  useUpdateCatalogAdminProduct as useUpdateAdminProduct,
  getUpdateCatalogAdminProductMutationOptions as getUpdateAdminProductMutationOptions,
  getUpdateCatalogAdminProductUrl as getUpdateAdminProductUrl,
  deleteCatalogAdminProduct as deleteAdminProduct,
  useDeleteCatalogAdminProduct as useDeleteAdminProduct,
  getDeleteCatalogAdminProductMutationOptions as getDeleteAdminProductMutationOptions,
  getDeleteCatalogAdminProductUrl as getDeleteAdminProductUrl,
  createCatalogProductFormat as createProductFormatFull,
  useCreateCatalogProductFormat as useCreateProductFormatFull,
  getCreateCatalogProductFormatMutationOptions as getCreateProductFormatFullMutationOptions,
  getCreateCatalogProductFormatUrl as getCreateProductFormatFullUrl,
  updateCatalogProductFormat as updateProductFormatFull,
  useUpdateCatalogProductFormat as useUpdateProductFormatFull,
  getUpdateCatalogProductFormatMutationOptions as getUpdateProductFormatFullMutationOptions,
  getUpdateCatalogProductFormatUrl as getUpdateProductFormatFullUrl,
  deleteCatalogProductFormat as deleteProductFormat,
  useDeleteCatalogProductFormat as useDeleteProductFormat,
  getDeleteCatalogProductFormatMutationOptions as getDeleteProductFormatMutationOptions,
  getDeleteCatalogProductFormatUrl as getDeleteProductFormatUrl,
  setCatalogAdminProductModifierGroups as assignProductModifierGroups,
  useSetCatalogAdminProductModifierGroups as useAssignProductModifierGroups,
  getSetCatalogAdminProductModifierGroupsMutationOptions as getAssignProductModifierGroupsMutationOptions,
  getSetCatalogAdminProductModifierGroupsUrl as getAssignProductModifierGroupsUrl,
  getCatalogAdminModifierGroups as getAdminModifierGroups,
  getGetCatalogAdminModifierGroupsQueryKey as getGetAdminModifierGroupsQueryKey,
  getGetCatalogAdminModifierGroupsQueryOptions as getGetAdminModifierGroupsQueryOptions,
  getGetCatalogAdminModifierGroupsUrl as getGetAdminModifierGroupsUrl,
  useGetCatalogAdminModifierGroups as useGetAdminModifierGroups,
  createCatalogAdminModifierGroup as createAdminModifierGroup,
  useCreateCatalogAdminModifierGroup as useCreateAdminModifierGroup,
  getCreateCatalogAdminModifierGroupMutationOptions as getCreateAdminModifierGroupMutationOptions,
  getCreateCatalogAdminModifierGroupUrl as getCreateAdminModifierGroupUrl,
  updateCatalogAdminModifierGroup as updateAdminModifierGroup,
  useUpdateCatalogAdminModifierGroup as useUpdateAdminModifierGroup,
  getUpdateCatalogAdminModifierGroupMutationOptions as getUpdateAdminModifierGroupMutationOptions,
  getUpdateCatalogAdminModifierGroupUrl as getUpdateAdminModifierGroupUrl,
  deleteCatalogAdminModifierGroup as deleteAdminModifierGroup,
  useDeleteCatalogAdminModifierGroup as useDeleteAdminModifierGroup,
  getDeleteCatalogAdminModifierGroupMutationOptions as getDeleteAdminModifierGroupMutationOptions,
  getDeleteCatalogAdminModifierGroupUrl as getDeleteAdminModifierGroupUrl,
  updateCatalogAdminModifier as updateAdminModifier,
  useUpdateCatalogAdminModifier as useUpdateAdminModifier,
  getUpdateCatalogAdminModifierMutationOptions as getUpdateAdminModifierMutationOptions,
  getUpdateCatalogAdminModifierUrl as getUpdateAdminModifierUrl,
  deleteCatalogAdminModifier as deleteAdminModifier,
  useDeleteCatalogAdminModifier as useDeleteAdminModifier,
  getDeleteCatalogAdminModifierMutationOptions as getDeleteAdminModifierMutationOptions,
  getDeleteCatalogAdminModifierUrl as getDeleteAdminModifierUrl,
  searchCatalogProducts,
  getSearchCatalogProductsQueryKey,
  getSearchCatalogProductsQueryOptions,
  getSearchCatalogProductsUrl,
  useSearchCatalogProducts,
  getCatalogAdminProductAllergens,
  getGetCatalogAdminProductAllergensQueryKey,
  useGetCatalogAdminProductAllergens,
  recalculateCatalogAdminProductAllergens,
  useRecalculateCatalogAdminProductAllergens,
  patchCatalogAdminProductSoldout,
  usePatchCatalogAdminProductSoldout,
} from "./catalog-admin-generated/api";

export type {
  GetCatalogStaffCategoriesQueryError,
  GetCatalogStaffCategoriesQueryResult,
  GetCatalogStaffCategoryProductsQueryError,
  GetCatalogStaffCategoryProductsQueryResult,
  GetCatalogProductModifiersQueryError,
  GetCatalogProductModifiersQueryResult,
  GetCatalogProductFormatsQueryError,
  GetCatalogProductFormatsQueryResult,
  GetCatalogAdminCategoriesQueryError,
  GetCatalogAdminCategoriesQueryResult,
  GetCatalogAdminProductsQueryError,
  GetCatalogAdminProductsQueryResult,
  GetCatalogAdminModifierGroupsQueryError,
  GetCatalogAdminModifierGroupsQueryResult,
} from "./catalog-admin-generated/api";

export type {
  CatalogStaffCategory as Category,
  CatalogStaffCategoryProduct as Product,
  CatalogProductFormat as ProductFormat,
  CatalogStaffModifierGroup as ModifierGroup,
  CatalogStaffModifierOption as ModifierOption,
  CatalogCategoryWithSubcategories as AdminCategory,
  CatalogSubcategory as Subcategory,
  CatalogProduct as AdminProduct,
  CatalogModifierGroupWithModifiers as AdminModifierGroup,
  CatalogModifier as AdminModifier,
  CatalogCreateCategoryInput as CreateCategoryInput,
  CatalogUpdateCategoryInput as UpdateCategoryInput,
  CatalogCreateSubcategoryInput as CreateSubcategoryInput,
  CatalogUpdateSubcategoryInput as UpdateSubcategoryInput,
  CatalogCreateProductInput as CreateProductInput,
  CatalogUpdateProductInput as UpdateProductInput,
  CatalogCreateProductFormatInput as CreateProductFormatInput,
  CatalogCreateProductFormatInput as CreateProductFormatFullInput,
  CatalogUpdateProductFormatInput as UpdateProductFormatInput,
  CatalogUpdateProductFormatInput as UpdateProductFormatFullInput,
  CatalogCreateModifierGroupInput as CreateModifierGroupInput,
  CatalogUpdateModifierGroupInput as UpdateModifierGroupInput,
  CatalogCreateModifierInput as CreateModifierInput,
  CatalogUpdateModifierInput as UpdateModifierInput,
  CatalogProductImportResult as ImportResult,
  CatalogStaffProductSearchItem,
  CatalogProductAllergensResponse,
  CatalogTranslations,
  CatalogTaxRate,
} from "./catalog-admin-generated/api.schemas";

export type UpdateProductTaxRateInput = { taxRate: number };
export type UpdateProductFormatTaxRateInput = { taxRate: number | null };

export async function updateAdminProductTaxRate(
  productId: string,
  data: UpdateProductTaxRateInput,
  options?: RequestInit,
): Promise<Awaited<ReturnType<typeof updateCatalogAdminProduct>>> {
  return updateCatalogAdminProduct(productId, { taxRate: data.taxRate as CatalogTaxRate }, options);
}

export async function updateProductFormatTaxRate(
  formatId: string,
  data: UpdateProductFormatTaxRateInput,
  options?: RequestInit,
): Promise<Awaited<ReturnType<typeof updateCatalogProductFormat>>> {
  return updateCatalogProductFormat(formatId, { taxRate: data.taxRate as CatalogTaxRate | null }, options);
}

export function useUpdateAdminProductTaxRate<TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateAdminProductTaxRate>>,
      TError,
      { productId: string; data: UpdateProductTaxRateInput },
      TContext
    >;
    request?: RequestInit;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof updateAdminProductTaxRate>>,
  TError,
  { productId: string; data: UpdateProductTaxRateInput },
  TContext
> {
  return useMutation({
    mutationKey: ["updateAdminProductTaxRate"],
    mutationFn: ({ productId, data }) => updateAdminProductTaxRate(productId, data, options?.request),
    ...options?.mutation,
  });
}

export function useUpdateProductFormatTaxRate<TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateProductFormatTaxRate>>,
      TError,
      { formatId: string; data: UpdateProductFormatTaxRateInput },
      TContext
    >;
    request?: RequestInit;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof updateProductFormatTaxRate>>,
  TError,
  { formatId: string; data: UpdateProductFormatTaxRateInput },
  TContext
> {
  return useMutation({
    mutationKey: ["updateProductFormatTaxRate"],
    mutationFn: ({ formatId, data }) => updateProductFormatTaxRate(formatId, data, options?.request),
    ...options?.mutation,
  });
}

export async function downloadProductExport(format: "csv" | "xlsx"): Promise<void> {
  const blob = await exportCatalogAdminProducts({ format });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `productos_${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function importProducts(file: File, options?: RequestInit): Promise<CatalogProductImportResult> {
  return importCatalogAdminProducts({ file }, options);
}

export function useImportProducts<TError = unknown, TContext = unknown>(
  options?: Parameters<typeof useImportCatalogAdminProducts<TError, TContext>>[0],
) {
  const base = useImportCatalogAdminProducts(options);
  return {
    ...base,
    mutateAsync: (props: { file: File }) => base.mutateAsync({ data: { file: props.file } }),
    mutate: (props: { file: File }, mutateOptions?: unknown) =>
      base.mutate({ data: { file: props.file } }, mutateOptions as never),
  };
}

export async function recalculateAndFetchProductAllergens(productId: string) {
  await recalculateCatalogAdminProductAllergens(productId);
  return getCatalogAdminProductAllergens(productId);
}

export async function patchProductSoldout(productId: string, outOfStock: boolean) {
  return patchCatalogAdminProductSoldout(productId, { outOfStock });
}

export async function createAdminModifier(
  groupId: string,
  data: Parameters<typeof createAdminModifierInternal>[1],
  options?: RequestInit,
) {
  return createAdminModifierInternal(groupId, data, options);
}

export function useCreateAdminModifier<TError = unknown, TContext = unknown>(
  options?: Parameters<typeof useCreateCatalogAdminModifier<TError, TContext>>[0],
) {
  const base = useCreateCatalogAdminModifier(options);
  return {
    ...base,
    mutateAsync: (props: { groupId: string; data: Parameters<typeof createAdminModifierInternal>[1] }) =>
      base.mutateAsync({ id: props.groupId, data: props.data }),
    mutate: (
      props: { groupId: string; data: Parameters<typeof createAdminModifierInternal>[1] },
      mutateOptions?: unknown,
    ) => base.mutate({ id: props.groupId, data: props.data }, mutateOptions as never),
  };
}
