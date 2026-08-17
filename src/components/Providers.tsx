"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./ThemeContext";
import { SidebarProvider } from "./SidebarContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <SidebarProvider>
          {children}
        </SidebarProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

