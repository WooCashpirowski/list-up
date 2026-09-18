import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const projectId = 'list-up-supabase';
export const dbContainer = `supabase_db_${projectId}`;

export function run(command, args, { capture = false, input, env = {} } = {}) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(command, args, {
            cwd: root,
            env: { ...process.env, ...env },
            stdio: [
                input === undefined ? 'ignore' : 'pipe',
                capture ? 'pipe' : 'inherit',
                'pipe',
            ],
            windowsHide: true,
        });
        let output = '';
        let errors = '';
        child.stdout?.on('data', (data) => {
            output += data;
        });
        child.stderr.on('data', (data) => {
            errors += data;
            if (!capture) process.stderr.write(data);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            // Do not include command arguments or captured output: they can contain
            // credentials, SQL records or Supabase status secrets.
            if (code !== 0)
                reject(
                    Object.assign(new Error(
                        `${command} failed (${code}). ${capture ? errors.slice(-8000) : ''}`,
                    ), { stdout: output, exitCode: code }),
                );
            else resolveRun(output);
        });
        if (input !== undefined) {
            child.stdin.on('error', () => {});
            child.stdin.end(input);
        }
    });
}

export const supabase = (args, options) =>
    run(
        process.execPath,
        [resolve(root, 'node_modules/supabase/dist/supabase.js'), ...args],
        options,
    );
export const compose = (args, options) =>
    run(
        'docker',
        [
            'compose',
            '--project-directory',
            root,
            '--file',
            resolve(root, 'compose.yaml'),
            ...args,
        ],
        options,
    );
export function readEnv(name, optional = false) {
    const path = resolve(root, name);
    return optional && !existsSync(path)
        ? {}
        : parseEnv(readFileSync(path, 'utf8'));
}

export function assertLocal(url, { allowLegacyPort = false } = {}) {
    const parsed = new URL(url);
    if (
        parsed.protocol !== 'http:' ||
        !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
        (parsed.port !== '44321' && !(allowLegacyPort && parsed.port === '54321'))
    ) {
        throw new Error(
            'This operation requires local Supabase on http://localhost:44321',
        );
    }
}

export function migrations() {
    return readdirSync(resolve(root, 'supabase/migrations'))
        .filter((name) => name.endsWith('.sql'))
        .sort();
}

export async function sql(statement, { capture = false } = {}) {
    // Hard-coded container and database. No URL/linked-project fallbacks.
    return run(
        'docker',
        [
            'exec',
            '-i',
            dbContainer,
            'psql',
            '-X',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-v',
            'ON_ERROR_STOP=1',
            '-At',
        ],
        { input: statement, capture },
    );
}

export async function updateLocalEnv() {
    const current = readEnv('.env.local', true);
    if (current.NEXT_PUBLIC_SUPABASE_URL)
        assertLocal(current.NEXT_PUBLIC_SUPABASE_URL, { allowLegacyPort: true });
    const status = JSON.parse(
        await supabase(['status', '--output', 'json'], { capture: true }),
    );
    assertLocal(status.API_URL);
    const vapid =
        current.NEXT_PUBLIC_VAPID_PUBLIC_KEY && current.VAPID_PRIVATE_KEY
            ? {
                  publicKey: current.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
                  privateKey: current.VAPID_PRIVATE_KEY,
              }
            : webPush.generateVAPIDKeys();
    const defaults = readEnv('.env.local.example');
    const env = {
        ...defaults,
        ...current,
        NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:44321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
        SUPABASE_URL: 'http://localhost:44321',
        SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        NOTIFICATION_WEBHOOK_SECRET:
            current.NOTIFICATION_WEBHOOK_SECRET ||
            randomBytes(32).toString('hex'),
        E2E_SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    };
    if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase status did not return local API keys');
    }
    saveLocalEnv(env);
    console.log(
        'Updated .env.local with local keys (staging files preserved).',
    );
    return env;
}

export async function localAdmin() {
    const env = readEnv('.env.local');
    assertLocal(env.NEXT_PUBLIC_SUPABASE_URL);
    // Check the currently running stack's key rather than accepting a remote
    // service-role copied into a local-looking configuration.
    const status = JSON.parse(
        await supabase(['status', '--output', 'json'], { capture: true }),
    );
    if (env.SUPABASE_SERVICE_ROLE_KEY !== status.SERVICE_ROLE_KEY)
        throw new Error('Run npm run local:up to refresh local keys');
    return {
        env,
        client: createClient(
            env.NEXT_PUBLIC_SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } },
        ),
    };
}

export async function bootstrapUsers() {
    const { env, client } = await localAdmin();
    const users = [];
    for (let page = 1; ; page++) {
        const { data, error } = await client.auth.admin.listUsers({
            page,
            perPage: 1000,
        });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 1000) break;
    }
    for (const prefix of ['E2E_TEST', 'E2E_SECOND_USER', 'E2E_THIRD_USER']) {
        const email = env[`${prefix}_EMAIL`];
        const password = env[`${prefix}_PASSWORD`];
        if (!email || !password)
            throw new Error(`Missing ${prefix} credentials in .env.local`);
        const existing = users.find(
            (user) => user.email?.toLowerCase() === email.toLowerCase(),
        );
        const { error } = existing
            ? await client.auth.admin.updateUserById(existing.id, {
                  password,
                  email_confirm: true,
              })
            : await client.auth.admin.createUser({
                  email,
                  password,
                  email_confirm: true,
              });
        if (error) throw error;
        console.log(`Local Auth account ready: ${email}`);
    }
}

export function saveLocalEnv(env) {
    assertLocal(env.NEXT_PUBLIC_SUPABASE_URL);
    writeFileSync(resolve(root, '.env.local'),
        '# Local Docker environment. Generated by npm run local:up.\n' +
        Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
        { mode: 0o600 });
}

export async function configurePush(enabled, { persist = false } = {}) {
    const { env } = await localAdmin();
    const literal = (value) => `'${value.replaceAll("'", "''")}'`;
    await sql(
        `begin;
    delete from vault.secrets where name in ('notification_dispatch_url', 'notification_webhook_secret');
    ${enabled ? `select vault.create_secret('http://host.docker.internal:3000/api/notifications/dispatch', 'notification_dispatch_url');
    select vault.create_secret(${literal(env.NOTIFICATION_WEBHOOK_SECRET)}, 'notification_webhook_secret');` : ''}
    select cron.alter_job(jobid, active := ${enabled ? 'true' : 'false'}) from cron.job where jobname = 'dispatch-pending-notifications';
    commit;`,
        { capture: true },
    );
    if (persist) saveLocalEnv({ ...env, LOCAL_WEB_PUSH_ENABLED: String(enabled) });
    console.log(`Local notification dispatcher ${enabled ? 'enabled' : 'disabled'}.`);
}
