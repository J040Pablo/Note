import React from 'react';
import { AppModeProvider } from './mode';
import { initSyncBridge } from '../services/syncBridge';

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  React.useEffect(() => {
    const dispose = initSyncBridge();
    return () => {
      dispose();
    };
  }, []);

  return <AppModeProvider>{children}</AppModeProvider>;
};

export default Providers;