import { createContext, type ReactNode, useContext } from "react";

type SidebarChromeContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
};

const SidebarChromeContext = createContext<SidebarChromeContextValue | null>(null);

export function SidebarChromeProvider({
  collapsed,
  onToggleCollapsed,
  children,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarChromeContext.Provider value={{ collapsed, toggleCollapsed: onToggleCollapsed }}>
      {children}
    </SidebarChromeContext.Provider>
  );
}

export function useSidebarChromeOptional(): SidebarChromeContextValue | null {
  return useContext(SidebarChromeContext);
}
