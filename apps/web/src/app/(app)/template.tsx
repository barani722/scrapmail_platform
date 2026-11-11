import type { ReactNode } from "react";

/** Re-mounts on every navigation: a short fade/slide-in for each page. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-2">
      {children}
    </div>
  );
}
