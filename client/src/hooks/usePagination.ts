import { useState, useMemo, useEffect } from "react";

interface UsePaginationOptions {
  totalItems: number;
  initialPageSize?: number;
}

export function usePagination({ totalItems, initialPageSize = 25 }: UsePaginationOptions) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedSlice = useMemo(
    () => ({ start: startIndex, end: endIndex }),
    [startIndex, endIndex]
  );

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [totalItems, totalPages, page]);

  const goToPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));
  const nextPage = () => goToPage(page + 1);
  const prevPage = () => goToPage(page - 1);
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  return {
    page,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    goToPage,
    nextPage,
    prevPage,
    changePageSize,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    paginatedSlice,
  };
}
