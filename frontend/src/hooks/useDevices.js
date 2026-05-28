import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function useDevices(params = {}) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api
      .get('/devices', { params })
      .then(({ data }) => {
        if (!ignore) setDevices(data.devices || []);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [JSON.stringify(params)]);

  return { devices, loading };
}
