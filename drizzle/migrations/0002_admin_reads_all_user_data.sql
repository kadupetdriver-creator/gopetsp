-- Administradores passam a conseguir ler todos os dados de tutores e motoristas
-- (somente leitura: nenhuma política nova de escrita).

drop policy if exists "pets_admin_select" on public.pets;
create policy "pets_admin_select"
  on public.pets for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ride_pets_admin_select" on public.ride_pets;
create policy "ride_pets_admin_select"
  on public.ride_pets for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ride_messages_admin_select" on public.ride_messages;
create policy "ride_messages_admin_select"
  on public.ride_messages for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ride_dispatches_admin_select" on public.ride_dispatches;
create policy "ride_dispatches_admin_select"
  on public.ride_dispatches for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "credit_transactions_admin_select" on public.credit_transactions;
create policy "credit_transactions_admin_select"
  on public.credit_transactions for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "mercadopago_payments_admin_select" on public.mercadopago_payments;
create policy "mercadopago_payments_admin_select"
  on public.mercadopago_payments for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_select" on public.user_roles;
create policy "user_roles_admin_select"
  on public.user_roles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));