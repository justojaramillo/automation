"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MenuSuperior } from "./MenuSuperior";

/** Menú superior y motor de procesamiento en todas las páginas con sesión (no en /login). */
export function Cascaron({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return <>{children}</>;
  return (
    <>
      <MenuSuperior />
      {children}
    </>
  );
}
