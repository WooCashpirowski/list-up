-- Auth users and demo data are created through the API by scripts/local.mjs.
-- A reset must never enable the notification dispatcher before local Vault
-- entries are configured. The migrations themselves also create this job.
do $$
declare
  local_job bigint;
begin
  for local_job in
    select jobid from cron.job where jobname = 'dispatch-pending-notifications'
  loop
    perform cron.alter_job(local_job, active := false);
  end loop;
end;
$$;
