export interface User {
  id: number
  username: string
  created_at: string
}

export interface Product {
  id: number
  name: string
  description: string | null
  price: number
  stock: number
  image: string | null
  created_at: string
  updated_at: string
}

export interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}
