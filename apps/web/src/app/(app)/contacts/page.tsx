import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Contacts"
        description="Contact people and email addresses linked to agencies."
      />
      <EmptyState
        title="No contacts yet"
        text="Contacts appear here after the client data import and website extraction."
      />
    </>
  );
}
