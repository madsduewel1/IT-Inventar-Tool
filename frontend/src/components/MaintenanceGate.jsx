import { useEffect, useState } from 'react';
import { api } from '../api/client';
import MaintenanceScreen from './MaintenanceScreen';

const EXPECTED_KEY = 'maintenanceExpected';
// Notfallzugang fuer Administratoren, um einen haengenden Wartungsmodus ueber
// die Update-Seite zu beenden. Die API bleibt weiterhin geschuetzt.
const BYPASS = new URLSearchParams(window.location.search).has('bypassMaintenance');

// Prueft regelmaessig den oeffentlichen Health-Endpunkt. Waehrend eines
// Updates (oder wenn das Backend kurz nicht erreichbar ist) wird der
// Wartungsbildschirm angezeigt. Nach Abschluss laedt die Seite automatisch neu.
export default function MaintenanceGate({ children }) {
  const [maintenance, setMaintenance] = useState(null);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const { data } = await api.get('/health');
        if (!active) return;
        if (data?.maintenance?.enabled) {
          sessionStorage.setItem(EXPECTED_KEY, '1');
          if (!BYPASS) setMaintenance({ ...data.maintenance, enabled: true });
          return;
        }
        if (BYPASS && window.location.search) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        if (sessionStorage.getItem(EXPECTED_KEY) === '1') {
          sessionStorage.removeItem(EXPECTED_KEY);
          window.location.reload();
          return;
        }
        setMaintenance(null);
      } catch {
        if (!active) return;
        if (!BYPASS && sessionStorage.getItem(EXPECTED_KEY) === '1') {
          setMaintenance({
            enabled: true,
            message: 'Das System wird aktualisiert. Bitte warten Sie einen Moment.'
          });
        }
      }
    }

    check();
    const timer = setInterval(check, 5000);

    function onMaintenance(event) {
      sessionStorage.setItem(EXPECTED_KEY, '1');
      if (!BYPASS) setMaintenance({ ...(event.detail || {}), enabled: true });
    }
    window.addEventListener('maintenance-mode', onMaintenance);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('maintenance-mode', onMaintenance);
    };
  }, []);

  if (maintenance?.enabled) return <MaintenanceScreen maintenance={maintenance} />;
  return children;
}
