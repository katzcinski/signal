import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// R3-6: a filter value backed by a URL search param, so every filtered view is
// shareable/deep-linkable (and the /contracts?product= deep-link works). Empty
// string clears the param.
export function useSearchParamState(key: string, fallback = ''): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;

  const setValue = useCallback((next: string) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (next) p.set(key, next);
      else p.delete(key);
      return p;
    }, { replace: true });
  }, [key, setParams]);

  return [value, setValue];
}
