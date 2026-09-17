import http from "../lib/http";
import type { ProductsResponse } from "../types";

export interface ProductsQuery {
  page?: number;
  limit?: number;
  search?: string;
  sort_by?: "name" | "price" | "stock" | "created_at";
  order?: "asc" | "desc";
}

export const productsApi = {
  getProducts: async (params: ProductsQuery = {}) => {
    const { data } = await http.get<ProductsResponse>("/products", {
      params: params,
    });
    return data;
  },
};
