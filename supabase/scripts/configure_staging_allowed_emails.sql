begin;

do $$
declare
  first_email constant text := lower(btrim('REPLACE_WITH_FIRST_TEST_EMAIL'));
  second_email constant text := lower(btrim('REPLACE_WITH_SECOND_TEST_EMAIL'));
begin
  if first_email like 'replace_with_%'
    or second_email like 'replace_with_%'
    or position('@' in first_email) <= 1
    or position('@' in second_email) <= 1
  then
    raise exception 'Replace both test email placeholders before running this script';
  end if;

  if first_email = second_email then
    raise exception 'The two staging email addresses must be different';
  end if;

  delete from private.allowed_user_emails;

  insert into private.allowed_user_emails (email)
  values (first_email), (second_email);
end;
$$;

commit;

select email
from private.allowed_user_emails
order by email;
