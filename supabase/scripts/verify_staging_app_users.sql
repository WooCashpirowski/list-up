-- Read-only verification for a staging project after applying the multi-user
-- direct-chat migration and creating confirmed users in Authentication -> Users.

select
  auth_user.id,
  auth_user.email,
  auth_user.email_confirmed_at is not null as email_confirmed,
  profile.display_name,
  membership.created_at as app_member_since,
  count(conversation.id) as direct_conversations
from auth.users as auth_user
left join public.profiles as profile on profile.id = auth_user.id
left join private.app_users as membership on membership.user_id = auth_user.id
left join public.chat_conversations as conversation
  on auth_user.id = conversation.first_user_id
  or auth_user.id = conversation.second_user_id
group by
  auth_user.id,
  auth_user.email,
  auth_user.email_confirmed_at,
  profile.display_name,
  membership.created_at
order by lower(auth_user.email);

select
  (select count(*) from private.app_users) as app_users,
  (select count(*) from public.chat_conversations) as conversations,
  (select count(*) from public.chat_read_state) as read_states,
  (
    select count(*) * (count(*) - 1) / 2
    from private.app_users
  ) as expected_conversations,
  (
    select count(*) * (count(*) - 1)
    from private.app_users
  ) as expected_read_states;
