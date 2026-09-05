-- ============================================================
-- Migration: add_cart_items_and_order_insert_policies
-- Applied directly to the existing Supabase project via MCP
-- (project ref: oakqchukpvgcskkdjdoe) on 2026-09-02.
--
-- Context: this project ALREADY had categories, brands, products,
-- profiles, addresses, orders, and order_items tables in place —
-- all with RLS enabled — before this pass. This file only contains
-- what was added/changed in this migration:
--   1. A new cart_items table (didn't exist yet), fully RLS-scoped
--      to the owning user.
--   2. INSERT policies for orders and order_items — they only had
--      SELECT (read own history) policies before, so a logged-in
--      user had no way to actually create an order from the client.
--
-- This file is a record of what's live, and is safe to re-run
-- against a fresh copy of the existing schema (categories/brands/
-- products/profiles/addresses/orders/order_items) if you ever need
-- to reproduce this project on another Supabase instance.
-- ============================================================

-- cart_items: one row per (user, product), scoped entirely to the owning user via RLS.
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists cart_items_user_id_idx on public.cart_items (user_id);
create index if not exists cart_items_product_id_idx on public.cart_items (product_id);

alter table public.cart_items enable row level security;

create policy "Users can read own cart items"
  on public.cart_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own cart items"
  on public.cart_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own cart items"
  on public.cart_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own cart items"
  on public.cart_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Keep updated_at current on every change.
create or replace function public.set_cart_items_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute procedure public.set_cart_items_updated_at();

-- orders/order_items had SELECT-only policies (read own order history) but no way
-- for a logged-in user to actually create an order from the client. Add those.
create policy "Users can insert own orders"
  on public.orders for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can insert own order items"
  on public.order_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- Migration: grant_authenticated_table_access (undocumented until now)
-- Applied directly to the existing Supabase project via MCP
-- (project ref: oakqchukpvgcskkdjdoe), date not captured at the time.
--
-- Context: the RLS policies above were correct, but the `authenticated`
-- role was still missing the underlying Postgres GRANTs on these three
-- tables — meaning every real signed-in user's add-to-cart or checkout
-- request would have failed (RLS only filters rows on an operation the
-- role is already permitted to attempt; it doesn't grant the operation
-- itself). Caught during cross-user RLS testing, fixed live at the time,
-- but never written back into this file. Verified against the live
-- project on 2026-09-03 and recorded here now so this file matches
-- reality.
-- ============================================================

grant select, insert, update, delete on public.cart_items to authenticated;
revoke select, insert, update, delete on public.cart_items from anon;

grant select, insert on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;

-- ============================================================
-- Migration: revoke_unused_anon_grants_cart_items
-- Applied 2026-09-03 via MCP (project ref: oakqchukpvgcskkdjdoe).
--
-- `anon` still held REFERENCES/TRIGGER/TRUNCATE on cart_items — leftover
-- from Supabase's default broad table grant, not something the app ever
-- used (anon carts are in-memory only, never touch this table). Real-world
-- exposure was low since PostgREST doesn't route TRUNCATE through the
-- REST API anon clients use, but there's no reason to leave standing
-- privileges an unauthenticated role has no legitimate use for. Verified
-- zero grants remain for anon on this table after applying.
-- ============================================================

revoke references, trigger, truncate on public.cart_items from anon;
