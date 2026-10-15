create function public.save_learn_progress(owner_id uuid, expected_revision bigint, next_payload jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_row public.learn_progress%rowtype; new_revision bigint;
begin
 if auth.uid() is null or auth.uid() <> owner_id then raise exception 'Authentication required'; end if;
 if expected_revision < 0 or next_payload->>'schema' is distinct from 'learn-progress-1' then raise exception 'Invalid progress document'; end if;
 if expected_revision = 0 then
  insert into public.learn_progress(user_id,payload) values(auth.uid(),next_payload)
  on conflict(user_id) do nothing returning revision into new_revision;
  if found then return new_revision; end if;
 end if;
 select * into current_row from public.learn_progress where user_id=auth.uid() for update;
 if not found or current_row.revision <> expected_revision then return null; end if;
 -- Keep recovery checkpoints at meaningful decisions and at most minute intervals
 -- during an otherwise unchanged replay; don't archive every tick.
 if current_row.payload#>'{slices,workspace,account}' is distinct from next_payload#>'{slices,workspace,account}'
 or current_row.payload#>'{slices,workspace,plan}' is distinct from next_payload#>'{slices,workspace,plan}'
 or current_row.payload#>'{slices,workspace,seed}' is distinct from next_payload#>'{slices,workspace,seed}'
 or not exists (select 1 from public.learn_progress_history where user_id=auth.uid() and saved_at>now()-interval '1 minute') then
  insert into public.learn_progress_history(user_id,revision,payload) values(auth.uid(),current_row.revision,current_row.payload) on conflict do nothing;
 end if;
 update public.learn_progress set payload=next_payload, revision=current_row.revision+1,updated_at=now() where user_id=auth.uid() returning revision into new_revision;
 return new_revision;
end;
$$;
revoke all on function public.save_learn_progress(uuid,bigint,jsonb) from public,anon;
grant execute on function public.save_learn_progress(uuid,bigint,jsonb) to authenticated;

revoke all on function public.save_learn_progress(bigint,jsonb) from authenticated;
