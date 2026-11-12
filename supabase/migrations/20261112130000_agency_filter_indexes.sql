-- Indexes for the agency and contact filters.

-- "What they sell" filter: agencies whose rating keywords overlap the topic's words.
create index if not exists agencies_relevance_keywords_idx
  on public.agencies using gin (relevance_keywords);

-- Search by email address ("info@…", "@agency.com") anywhere in the address.
create index if not exists agency_contacts_email_trgm_idx
  on public.agency_contacts using gin (email extensions.gin_trgm_ops);

-- Search by city.
create index if not exists agencies_city_trgm_idx
  on public.agencies using gin (city extensions.gin_trgm_ops);
