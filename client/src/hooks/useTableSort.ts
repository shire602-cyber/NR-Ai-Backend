import { useState, useCallback, useMemo } from "react";

type SortDirection = "asc" | "desc";

interface UseTableSortReturn<T> {
  sortKey: string | null;
  sortDirection: SortDirection;
  toggleSort: (key: string) => void;
  sortData: (data: T[], compareFn?: (a: T, b: T, key: string, direction: SortDirection) => number) => T[];
}

export function useTableSort<T = Record<string, unknown>>(): UseTableSortReturn<T> {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const toggleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }, [sortKey]);

  const sortData = useCallback(
    (data: T[], compareFn?: (a: T, b: T, key: string, direction: SortDirection) => number): T[] => {
      if (!sortKey) return data;

      return [...data].sort((a, b) => {
        if (compareFn) return compareFn(a, b, sortKey, sortDirection);

        const aVal = (a as Record<string, unknown>)[sortKey];
        const bVal = (b as Record<string, unknown>)[sortKey];

        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        let result: number;
        if (typeof aVal === "number" && typeof bVal === "number") {
          result = aVal - bVal;
        } else {
          result = String(aVal).localeCompare(String(bVal));
        }

        return sortDirection === "asc" ? result : -result;
      });
    },
    [sortKey, sortDirection]
  );

  return { sortKey, sortDirection, toggleSort, sortData };
}
