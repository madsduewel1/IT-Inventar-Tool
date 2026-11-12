import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Modal from './Modal';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState(opts);
    });
  }, []);

  const close = useCallback((result) => {
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal open title={state.title || 'Bestätigen'} onClose={() => close(false)}>
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${state.tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                {state.tone === 'danger' ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
              </div>
              <p className="pt-1.5 text-gray-700 leading-relaxed">{state.message}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary w-full sm:w-auto" onClick={() => close(false)}>{state.cancelLabel || 'Abbrechen'}</button>
              <button
                className={`${state.tone === 'danger' ? 'btn-primary bg-red-600 hover:bg-red-700 border-red-600' : 'btn-primary'} w-full sm:w-auto`}
                onClick={() => close(true)}
                autoFocus
              >
                {state.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
