import React from 'react';
import { AppModeProvider } from './mode';

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <AppModeProvider>{children}</AppModeProvider>;
};

export default Providers;