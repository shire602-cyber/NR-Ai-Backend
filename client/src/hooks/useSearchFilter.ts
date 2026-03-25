import { useState, useEffect } from "react";

interface UseSearchFilterOptions {
  delay?: number;
}

export function useSearchFilter({ delay = 300 }: UseSearchFilterOptions = {}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, delay);

    return () => clearTimeout(timer);
  }, [searchTerm, delay]);

  return {
    searchTerm,
    setSearchTerm,
    debouncedTerm,
  };
}
