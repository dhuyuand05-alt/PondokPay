import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useApiData(path, token) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api.get(path, token, { signal: controller.signal }).then((result) => {
      setData(result);
    }).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [path, token, revision]);

  return { data, setData, loading, error, refresh };
}
