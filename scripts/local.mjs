import { resolve } from 'node:path';
import {
    root,
    supabase,
    compose,
    run,
    updateLocalEnv,
    bootstrapUsers,
    configurePush,
    localAdmin,
    sql,
} from './local-runtime.mjs';

async function seedDemo() {
    await bootstrapUsers();
    const { env, client } = await localAdmin();
    // Use a signed-in user so ownership and RLS are exercised by the seed too.
    const { error: loginError } = await client.auth.signInWithPassword({
        email: env.E2E_TEST_EMAIL,
        password: env.E2E_TEST_PASSWORD,
    });
    if (loginError) throw loginError;
    try {
        const id = '00000000-0000-4000-8000-000000000001';
        const { data: existing, error: lookupError } = await client
            .from('lists')
            .select('id')
            .eq('id', id)
            .maybeSingle();
        if (lookupError) throw lookupError;
        if (!existing) {
            const { error } = await client
                .from('lists')
                .insert({ id, title: 'Lokalne zakupy', list_type: 'shopping' });
            if (error) throw error;
            const { error: itemError } = await client
                .from('list_items')
                .insert({ list_id: id, name: 'Mleko' });
            if (itemError) throw itemError;
        }
    } finally {
        await client.auth.signOut();
    }
    console.log('Local demo data ready.');
}

async function startFrontend() {
    await compose([
        'up',
        '--detach',
        '--build',
        '--wait',
        '--wait-timeout',
        '240',
    ]);
    console.log(
        'Frontend: http://localhost:3000\nSupabase Studio: http://localhost:44323\nLocal email: http://localhost:44324',
    );
}

async function main() {
    const command = process.argv[2] ?? 'up';
    switch (command) {
        case 'up': {
            console.log('Starting local Supabase (the first start downloads Docker images)...');
            await supabase(['start'], { capture: true });
            const env = await updateLocalEnv();
            await bootstrapUsers();
            await configurePush(env.LOCAL_WEB_PUSH_ENABLED === 'true');
            await startFrontend();
            break;
        }
        case 'down':
            await compose(['down']);
            await supabase(['stop'], { capture: true });
            console.log(
                'Stopped local services; database and Storage data preserved.',
            );
            break;
        case 'reset':
            await localAdmin();
            await compose(['stop', 'frontend']);
            await supabase(['db', 'reset', '--local', '--yes'], {
                capture: true,
            });
            await updateLocalEnv();
            await seedDemo();
            await configurePush(false, { persist: true });
            await startFrontend();
            break;
        case 'seed':
            await seedDemo();
            break;
        case 'status':
            await compose(['ps']);
            await sql(
                "select 'users=' || count(*) from private.app_users; select 'conversations=' || count(*) from public.chat_conversations; select 'read_states=' || count(*) from public.chat_read_state;",
            );
            break;
        case 'logs':
            await compose(['logs', '--tail', '100', '--follow', 'frontend']);
            break;
        case 'push': {
            const enabled = process.argv[3];
            if (!['on', 'off'].includes(enabled))
                throw new Error('Usage: npm run local:push -- on|off');
            await configurePush(enabled === 'on', { persist: true });
            break;
        }
        case 'test': {
            const { env } = await localAdmin();
            await configurePush(false);
            try {
                await run(
                process.execPath,
                [
                    resolve(root, 'node_modules/@playwright/test/cli.js'),
                    'test',
                    ...process.argv.slice(3),
                ],
                {
                    env: {
                        E2E_ENVIRONMENT: 'local',
                        E2E_USE_RUNNING_SERVER: '1',
                        PLAYWRIGHT_BASE_URL: 'http://localhost:3000',
                        ...Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('E2E_') || key.startsWith('NEXT_PUBLIC_SUPABASE_'))),
                    },
                },
            );
            } finally {
                await configurePush(env.LOCAL_WEB_PUSH_ENABLED === 'true');
            }
            break;
        }
        default:
            throw new Error(
                'Usage: node scripts/local.mjs up|down|reset|seed|status|logs|push|test',
            );
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
