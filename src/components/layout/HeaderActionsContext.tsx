'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type HeaderActionsContextValue = {
  headerActions: ReactNode;
  setHeaderActions: (actions: ReactNode) => void;
};

const HeaderActionsContext = createContext<HeaderActionsContextValue | null>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);

  return (
    <HeaderActionsContext.Provider value={{ headerActions, setHeaderActions }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

export function useHeaderActions() {
  const context = useContext(HeaderActionsContext);
  if (!context) throw new Error('useHeaderActions doit être utilisé dans HeaderActionsProvider.');
  return context;
}