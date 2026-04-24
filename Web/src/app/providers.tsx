import React from 'react';
import { AppModeProvider } from './mode';
import { ThemeProvider } from './theme';
import { initSyncBridge } from '../services/syncBridge';

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  React.useEffect(() => {
    const dispose = initSyncBridge();
    return () => {
      dispose();
    };
  }, []);

  return (
    <ThemeProvider>
      <AppModeProvider>{children}</AppModeProvider>
    </ThemeProvider>
  );
};

export default Providers;