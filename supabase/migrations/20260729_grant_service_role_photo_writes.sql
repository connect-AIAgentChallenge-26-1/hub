-- Allows the Express server's server-only Secret Key to register approved spots
-- and guides. Browser clients remain governed by RLS and receive no write grant.

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.photo_spots to service_role;
grant select, insert, update, delete on table public.photo_guides to service_role;
