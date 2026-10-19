-- Run with a privileged test connection. Fixture writes are always rolled back.
begin;
do $$
declare u uuid:=gen_random_uuid(); denied boolean:=false;
begin
 begin
  insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'consent-negative@example.invalid','{}');
 exception when others then
  if sqlerrm like '%Review and accept%' then denied:=true; else raise; end if;
 end;
 if not denied then raise exception 'Missing assent accepted'; end if;
 insert into auth.users(id,email,raw_user_meta_data) values(u,'consent-positive@example.invalid','{"legal_acceptance":{"version":"2026-10-19.1","accepted":true,"adult_us":true,"privacy_received":true}}');
 if (select count(*) from public.legal_receipts where user_id=u)<>1 then raise exception 'Signup receipt missing'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 if not public.security_session_allowed() or public.account_api_allowed() then raise exception 'Incorrect first-login state'; end if;
 perform public.record_legal_receipt('2026-10-19.1','first_login_notice');
 perform public.record_legal_receipt('2026-10-19.1','first_login_notice');
 if (select count(*) from public.legal_receipts where user_id=u)<>2 then raise exception 'Receipt retry not idempotent'; end if;
 if not public.account_api_allowed() then raise exception 'Completed account blocked'; end if;
 insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret) values(gen_random_uuid(),u,'totp','verified',now(),now(),'test-only-rolled-back');
 if public.security_session_allowed() or public.account_api_allowed() then raise exception 'MFA bypass'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal2')::text,true);
 if not public.account_api_allowed() then raise exception 'Verified MFA blocked'; end if;
 if has_table_privilege('authenticated','public.legal_receipts','INSERT') or has_table_privilege('authenticated','public.legal_receipts','UPDATE') or has_table_privilege('authenticated','public.legal_receipts','DELETE') then raise exception 'Ledger mutable by client'; end if;
end $$;
rollback;
