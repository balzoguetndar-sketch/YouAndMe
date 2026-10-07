-- Migration de représentation explicite des licences.
-- Les champs existants restent compatibles avec le code actuel.

alter table public.user_usage
  add column if not exists license_tier text,
  add column if not exists license_status text default 'inactive',
  add column if not exists licensed_until timestamptz,
  add column if not exists quota_unlimited boolean default false,
  add column if not exists advertising_enabled boolean default true;

update public.user_usage
set license_tier = case
      when has_license and license_key = 'stripe-supporter' then 'supporter'
      when has_license then 'legacy'
      else 'free'
    end,
    license_status = case
      when has_license then 'active'
      else 'inactive'
    end,
    quota_unlimited = case
      when has_license then true
      else false
    end,
    advertising_enabled = case
      when has_license then false
      else true
    end;

alter table public.user_usage
  add constraint user_usage_license_tier_check
  check (license_tier in ('free', 'ad_supported', 'no_ads', 'supporter', 'legacy'));
