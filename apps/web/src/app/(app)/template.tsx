import type { ReactNode } from "react";

/** Re-mounts on every navigation: a very short fade-in for each page. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-in duration-150 fade-in">{children}</div>;
}
