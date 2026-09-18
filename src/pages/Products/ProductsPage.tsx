import {
  Button,
  Chip,
  Pagination,
  TableRoot,
  TableScrollContainer,
  TableContent,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  ModalRoot,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalHeading,
  ModalFooter,
  useOverlayState,
} from "@heroui/react";

import { useQuery } from "@tanstack/react-query";
import { productsApi } from "../../api/products";
import { useSearchParams } from "react-router";
import { useRef, useState } from "react";

const SORT_OPTIONS = [
  { value: "created_at", label: "Date Created" },
  { value: "name", label: "Name" },
  { value: "price", label: "Price" },
  { value: "stock", label: "Stock" },
];

const LIMIT = 10;

const inputCls =
  "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 w-full";

export const inputErrCls =
  "border border-red-400 bg-red-50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-red-400 w-full";

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? 1);
  const searchFromUrl = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery({
    queryKey: ["products", { page, limit: LIMIT, search: searchFromUrl }],
    queryFn: () =>
      productsApi.getProducts({
        page,
        limit: LIMIT,
        search: searchFromUrl,
      }),
  });
  const products = data?.data ?? [];
  const totalProducts = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 0;
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    pages.push(1);
    if (page > 3) {
      pages.push("ellipsis");
    }
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) {
      pages.push("ellipsis");
    }
    pages.push(totalPages);
    return pages;
  };

  const updateParams = (updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      return next;
    });
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      updateParams({ page: "1", search: value });
    }, 500);
  };

  const createState = useOverlayState();
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalProducts} total products
          </p>
        </div>
        <Button variant="primary" onPress={createState.open}>
          + Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name..."
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          value={searchInput}
          onChange={handleSearchInputChange}
        />
        <select
          defaultValue="created_at"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm">
          ↓ Descending
        </Button>
      </div>

      {/* Table */}
      <TableRoot className="bg-transparent">
        <TableScrollContainer>
          <TableContent
            aria-label="Products table"
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <TableHeader>
              <TableColumn id="image">IMAGE</TableColumn>
              <TableColumn id="name" isRowHeader>
                NAME
              </TableColumn>
              <TableColumn id="price">PRICE</TableColumn>
              <TableColumn id="stock">STOCK</TableColumn>
              <TableColumn id="created">CREATED</TableColumn>
              <TableColumn id="actions">ACTIONS</TableColumn>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id} id={product.id}>
                  <TableCell>
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
                        No img
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-gray-900">
                      {product.name}
                    </span>
                    {product.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-gray-400">
                        {product.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">
                      ${product.price.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip
                      color={
                        product.stock > 10
                          ? "success"
                          : product.stock > 0
                            ? "warning"
                            : "danger"
                      }
                      size="sm"
                      variant="soft"
                    >
                      {product.stock}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500">
                      {new Date(product.created_at).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary">
                        View
                      </Button>
                      <Button size="sm" variant="danger-soft">
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </TableRoot>

      {/* Pagination */}
      <div className="mt-6">
        <Pagination className="w-full">
          <Pagination.Summary>
            Showing {Math.min((page - 1) * LIMIT + 1, totalProducts)}–
            {Math.min(page * LIMIT, totalProducts)} of {totalProducts} results
          </Pagination.Summary>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={page === 1}
                onPress={() => updateParams({ page: String(page - 1) })}
              >
                <Pagination.PreviousIcon />
                <span>Previous</span>
              </Pagination.Previous>
            </Pagination.Item>
            {getPageNumbers().map((p, i) =>
              p === "ellipsis" ? (
                <Pagination.Item key={`ellipsis-${i}`}>
                  <Pagination.Ellipsis />
                </Pagination.Item>
              ) : (
                <Pagination.Item key={p}>
                  <Pagination.Link
                    isActive={p === page}
                    onPress={() => updateParams({ page: String(p) })}
                  >
                    {p}
                  </Pagination.Link>
                </Pagination.Item>
              ),
            )}
            <Pagination.Item>
              <Pagination.Next
                isDisabled={page >= totalPages}
                onPress={() => updateParams({ page: String(page + 1) })}
              >
                <span>Next</span>
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </div>

      {/* Create Product Modal */}
      <ModalRoot state={createState}>
        <ModalBackdrop>
          <ModalContainer>
            <ModalDialog>
              <ModalHeader>
                <ModalHeading>Add New Product</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Product name"
                      className={inputCls}
                    />
                    <p className="text-xs text-red-500">Error message</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      Image
                    </label>
                    <input
                      type="file"
                      placeholder="Upload image"
                      className={inputCls}
                      accept="image/*"
                    />
                    <p className="text-xs text-red-500">Error message</p>
                    <div>
                      <img
                        src=""
                        alt="Preview"
                        className="h-[150px] w-[150px] rounded-lg object-cover"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="Optional description"
                      className={inputCls}
                    />
                    <p className="text-xs text-red-500">Error message</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      Price <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      placeholder="0.00"
                      className={inputCls}
                    />
                    <p className="text-xs text-red-500">Error message</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      Stock
                    </label>
                    <input type="number" placeholder="0" className={inputCls} />
                    <p className="text-xs text-red-500">Error message</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onPress={createState.close}>
                  Cancel
                </Button>
                <Button variant="primary">Create Product</Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>
    </div>
  );
}
