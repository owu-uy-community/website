import { useState, useEffect, useCallback, useRef } from "react";
import { createLayoutCache } from "../utils/calculations";

interface LayoutCache {
  isMobile: boolean;
  timeColumnWidth: number;
  cellWidth: number;
  cellHeight: number;
}

/**
 * Custom hook for managing layout cache and board dimensions
 */
export const useLayoutCache = () => {
  const [layoutCache, setLayoutCache] = useState<LayoutCache>(createLayoutCache);
  const boardRectRef = useRef<DOMRect | null>(null);
  const cellCacheRef = useRef<Map<string, Element>>(new Map());

  const updateBoardRect = useCallback((boardElement: HTMLDivElement | null) => {
    if (boardElement) {
      boardRectRef.current = boardElement.getBoundingClientRect();
    }
  }, []);

  const getCachedElement = useCallback((key: string): Element | null => {
    let element = cellCacheRef.current.get(key);

    if (!element) {
      const foundElement = document.querySelector(`[data-cell="${key}"]`);
      if (foundElement) {
        cellCacheRef.current.set(key, foundElement);
        element = foundElement;
      }
    }

    return element || null;
  }, []);

  const clearElementCache = useCallback(() => {
    cellCacheRef.current.clear();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const newLayoutCache = createLayoutCache();
      setLayoutCache(newLayoutCache);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    layoutCache,
    boardRectRef,
    updateBoardRect,
    getCachedElement,
    clearElementCache,
  };
};
