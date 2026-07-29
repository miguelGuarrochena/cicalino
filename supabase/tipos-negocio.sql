-- Cicalino — más tipos de negocio (bar, restaurante, etc.)
-- Corré en el SQL Editor de Supabase (una vez).

do $$ begin
  alter type public.business_type add value 'bar';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.business_type add value 'restaurante';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.business_type add value 'pasteleria';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.business_type add value 'food_truck';
exception when duplicate_object then null;
end $$;
