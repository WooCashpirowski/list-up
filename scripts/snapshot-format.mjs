// Accept only pg_dump COPY records for the persistent application/Auth tables.
// Sessions, secrets and delivery queues are discarded, even if new tables are
// introduced in the managed Supabase schemas in the future.
export const snapshotTables = [
    'auth.users',
    'auth.identities',
    'private.app_users',
    'public.profiles',
    'public.categories',
    'public.lists',
    'public.list_items',
    'public.chat_conversations',
    'public.chat_messages',
    'public.chat_read_state',
];

export function extractSnapshot(dump) {
    const lines = dump.replaceAll('\r\n', '\n').split('\n');
    const records = [];
    const counts = {};
    const sequences = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const copy =
            /^COPY ("?[a-z_][a-z0-9_]*"?\."?[a-z_][a-z0-9_]*"?) \(([^\n]+)\) FROM stdin;$/.exec(
                line,
            );
        if (copy) {
            const table = copy[1].replaceAll('"', '');
            const start = index;
            while (++index < lines.length && lines[index] !== '\\.') {
                /* COPY payload */
            }
            if (index >= lines.length)
                throw new Error(`Truncated COPY block for ${copy[1]}`);
            if (!snapshotTables.includes(table)) continue;
            if (
                !/^"?[a-z_][a-z0-9_]*"?(?:, "?[a-z_][a-z0-9_]*"?)*$/.test(
                    copy[2],
                )
            )
                throw new Error('Unexpected COPY column syntax');
            if (Object.hasOwn(counts, table))
                throw new Error(`Duplicate COPY block for ${copy[1]}`);
            counts[table] = index - start - 1;
            records.push(lines.slice(start, index + 1).join('\n'));
        } else if (
            /^SELECT pg_catalog\.setval\('"?public"?\."?[a-z_][a-z0-9_]*"?', [0-9]+, (?:true|false)\);$/.test(
                line,
            )
        ) {
            sequences.push(line);
        }
    }
    const missing = snapshotTables.filter(
        (table) => !Object.hasOwn(counts, table),
    );
    if (missing.length)
        throw new Error(`Snapshot missing tables: ${missing.join(', ')}`);
    return { sql: records.concat(sequences).join('\n\n') + '\n', counts };
}

export function restoreSql(data) {
    // Re-parse rather than executing arbitrary SQL from the snapshot file.
    const filtered = extractSnapshot(data).sql;
    return `begin;
set local session_replication_role = replica;
truncate ${snapshotTables.join(', ')} cascade;
${filtered}
update auth.users set confirmation_token = '', recovery_token = '',
  email_change_token_new = '', email_change_token_current = '',
  reauthentication_token = '', email_change = '', phone_change = '', phone_change_token = '';
set local session_replication_role = origin;
-- Foreign-key triggers were disabled during COPY. Validate the actual rows,
-- including already-validated constraints (VALIDATE CONSTRAINT alone skips them).
do $verify$
declare
  fk record;
  non_null text;
  matches text;
  invalid boolean;
begin
  for fk in
    select conname, conrelid, confrelid, conkey, confkey
    from pg_constraint
    where contype = 'f' and conrelid in (
      ${snapshotTables.map((table) => `'${table}'::regclass`).join(', ')}
    )
  loop
    select string_agg(format('child.%I is not null', child.attname), ' and '),
      string_agg(format('parent.%I = child.%I', parent.attname, child.attname), ' and ')
    into non_null, matches
    from generate_subscripts(fk.conkey, 1) as position(n)
    join pg_attribute as child on child.attrelid = fk.conrelid and child.attnum = fk.conkey[position.n]
    join pg_attribute as parent on parent.attrelid = fk.confrelid and parent.attnum = fk.confkey[position.n];
    execute format('select exists (select 1 from %s child where %s and not exists (select 1 from %s parent where %s))',
      fk.conrelid::regclass, non_null, fk.confrelid::regclass, matches) into invalid;
    if invalid then raise exception 'Snapshot violates foreign key %', fk.conname; end if;
  end loop;
  if exists (
    select 1 from private.app_users member
    left join auth.users account on account.id = member.user_id
    left join public.profiles profile on profile.id = member.user_id
    where account.email_confirmed_at is null or profile.id is null or lower(profile.email) <> lower(account.email)
  ) then raise exception 'Snapshot contains an inconsistent app membership'; end if;
end;
$verify$;
commit;`;
}
