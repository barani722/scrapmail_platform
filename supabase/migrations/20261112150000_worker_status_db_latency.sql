-- Workers also report their average database call time; the supervisor uses it to
-- stop adding workers (or remove one) when the database gets slow.
alter table public.worker_status add column if not exists db_latency_ms int;
