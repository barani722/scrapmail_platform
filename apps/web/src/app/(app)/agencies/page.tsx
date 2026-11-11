import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Agencies" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Agencies"
        description="Search and manage the agency database."
      />
      <EmptyState
        title="No agencies yet"
        text="Agencies appear here after the client data import and the first scraping jobs."
      />
    </>
  );
}
