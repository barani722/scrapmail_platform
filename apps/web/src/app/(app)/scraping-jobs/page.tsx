import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Scraping Jobs" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Scraping Jobs"
        description="Create and monitor agency discovery jobs."
      />
      <EmptyState
        title="No scraping jobs yet"
        text="Scraping jobs appear here once the scraping engine is released."
      />
    </>
  );
}
