import { createHash, randomUUID } from 'node:crypto';
import {
    mkdirSync,
    readFileSync,
    writeFileSync,
    realpathSync,
    rmSync,
    existsSync,
} from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
    root,
    readEnv,
    migrations,
    supabase,
    compose,
    sql,
    updateLocalEnv,
    bootstrapUsers,
    configurePush,
    localAdmin,
} from './local-runtime.mjs';
import { extractSnapshot, restoreSql } from './snapshot-format.mjs';

const localDir = resolve(root, '.local');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function localPath(...parts) {
    mkdirSync(localDir, { recursive: true });
    if (realpathSync(localDir) !== localDir)
        throw new Error('.local must not be a symlink');
    const path = resolve(localDir, ...parts);
    const rel = relative(localDir, path);
    if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel))
        throw new Error('Snapshot path must stay inside .local');
    if (existsSync(path)) {
        const real = relative(localDir, realpathSync(path));
        if (real.startsWith(`..${sep}`) || real === '..' || isAbsolute(real))
            throw new Error('Snapshot symlink escapes .local');
    }
    return path;
}

async function sourceConfig() {
    const source = readEnv('.env.staging.local');
    const ref = new URL(source.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
    if (!/^[a-z0-9]{20}$/.test(ref))
        throw new Error(
            'Expected a hosted staging Supabase URL in .env.staging.local',
        );
    const linked = readFileSync(
        resolve(root, 'supabase/.temp/project-ref'),
        'utf8',
    ).trim();
    if (ref !== linked)
        throw new Error(
            'Linked project is not the staging project from .env.staging.local; refusing export',
        );
    const production = readEnv('.env.prod.local', true);
    if (
        production.NEXT_PUBLIC_SUPABASE_URL &&
        new URL(production.NEXT_PUBLIC_SUPABASE_URL).origin ===
            new URL(source.NEXT_PUBLIC_SUPABASE_URL).origin
    ) {
        throw new Error('Staging URL matches production; refusing export');
    }
    if (!source.SUPABASE_SERVICE_ROLE_KEY)
        throw new Error('Staging service-role key is required to copy Storage');
    const historyOutput = await supabase(['migration', 'list', '--linked'], {
        capture: true,
    });
    const history = JSON.parse(historyOutput);
    if (
        !history.migrations?.length ||
        history.migrations.some(
            (entry) => !entry.local || entry.local !== entry.remote,
        )
    ) {
        throw new Error(
            'Staging and repository migration histories differ; reconcile them before exporting',
        );
    }
    return {
        source,
        ref,
        client: createClient(
            source.NEXT_PUBLIC_SUPABASE_URL,
            source.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
        ),
    };
}

async function copyStorage(client, directory) {
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) throw error;
    const objects = [];
    mkdirSync(resolve(directory, 'objects'));
    for (const bucket of buckets) {
        async function visit(prefix = '') {
            for (let offset = 0; ; offset += 1000) {
                const { data: entries, error: listError } = await client.storage
                    .from(bucket.id)
                    .list(prefix, {
                        limit: 1000,
                        offset,
                        sortBy: { column: 'name', order: 'asc' },
                    });
                if (listError) throw listError;
                for (const entry of entries) {
                    const name = prefix
                        ? `${prefix}/${entry.name}`
                        : entry.name;
                    if (!entry.id) {
                        await visit(name);
                        continue;
                    }
                    const { data: blob, error: downloadError } =
                        await client.storage.from(bucket.id).download(name);
                    if (downloadError) throw downloadError;
                    const bytes = Buffer.from(await blob.arrayBuffer());
                    const file = `objects/${sha256(`${bucket.id}\0${name}`)}`;
                    writeFileSync(resolve(directory, file), bytes, {
                        mode: 0o600,
                    });
                    objects.push({
                        bucket: bucket.id,
                        name,
                        file,
                        sha256: sha256(bytes),
                        contentType: blob.type || 'application/octet-stream',
                    });
                }
                if (entries.length < 1000) break;
            }
        }
        await visit();
    }
    return {
        buckets: buckets.map(
            ({
                id,
                public: isPublic,
                file_size_limit,
                allowed_mime_types,
            }) => ({
                id,
                public: isPublic,
                file_size_limit,
                allowed_mime_types,
            }),
        ),
        objects,
    };
}

async function exportSnapshot() {
    const { client, ref } = await sourceConfig();
    const directory = localPath(
        'snapshots',
        `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`,
    );
    mkdirSync(directory, { recursive: true });
    const rawFile = resolve(directory, 'raw.sql');
    try {
        // One data dump provides a consistent PostgreSQL snapshot across all three
        // schemas. Export never executes a remote reset, push, repair or SQL write.
        await supabase(
            [
                'db',
                'dump',
                '--linked',
                '--data-only',
                '--use-copy',
                '--schema',
                'public,private,auth',
                '--file',
                rawFile,
            ],
            { capture: true },
        );
        const { sql: data, counts } = extractSnapshot(
            readFileSync(rawFile, 'utf8'),
        );
        rmSync(rawFile);
        writeFileSync(resolve(directory, 'data.sql'), data, { mode: 0o600 });
        const storage = await copyStorage(client, directory);
        const manifest = {
            format: 1,
            source: 'staging',
            projectRef: ref,
            createdAt: new Date().toISOString(),
            migrations: migrations(),
            dataSha256: sha256(data),
            counts,
            storage,
        };
        writeFileSync(
            resolve(directory, 'manifest.json'),
            JSON.stringify(manifest, null, 2) + '\n',
            { mode: 0o600 },
        );
        writeFileSync(
            localPath('latest-snapshot'),
            relative(localDir, directory),
            { mode: 0o600 },
        );
        console.log(`Staging snapshot saved in ${relative(root, directory)}.`);
        console.log(
            `Copied ${Object.values(counts).reduce((sum, count) => sum + count, 0)} persistent rows; ${storage.objects.length} Storage objects. Sessions, Vault, crons and push queues excluded.`,
        );
        return directory;
    } catch (error) {
        // Verify the absolute target remains within .local before recursive removal.
        rmSync(localPath(relative(localDir, directory)), {
            recursive: true,
            force: true,
        });
        throw error;
    }
}

async function restoreSnapshot(directory) {
    const path = directory
        ? localPath(relative(localDir, resolve(root, directory)))
        : localPath(readFileSync(localPath('latest-snapshot'), 'utf8'));
    const manifest = JSON.parse(
        readFileSync(resolve(path, 'manifest.json'), 'utf8'),
    );
    if (manifest.format !== 1 || manifest.source !== 'staging')
        throw new Error('Unsupported snapshot manifest');
    if (JSON.stringify(manifest.migrations) !== JSON.stringify(migrations()))
        throw new Error(
            'Snapshot migrations differ from this checkout; export a matching snapshot first',
        );
    const data = readFileSync(resolve(path, 'data.sql'), 'utf8');
    if (sha256(data) !== manifest.dataSha256)
        throw new Error('Snapshot data checksum mismatch');
    const statement = restoreSql(data);
    // Verify all object paths and checksums before stopping the app or resetting.
    for (const object of manifest.storage.objects) {
        if (!/^objects\/[a-f0-9]{64}$/.test(object.file))
            throw new Error('Invalid Storage snapshot path');
        const bytes = readFileSync(
            localPath(relative(localDir, resolve(path, object.file))),
        );
        if (sha256(bytes) !== object.sha256)
            throw new Error('Storage snapshot checksum mismatch');
    }
    const { client: before } = await localAdmin();
    const { data: currentBuckets, error: bucketsError } =
        await before.storage.listBuckets();
    if (bucketsError) throw bucketsError;
    // The restore command intentionally replaces local state, including Storage.
    await compose(['stop', 'frontend']);
    for (const bucket of currentBuckets) {
        const { error: emptyError } = await before.storage.emptyBucket(
            bucket.id,
        );
        if (emptyError) throw emptyError;
        const { error: deleteError } = await before.storage.deleteBucket(
            bucket.id,
        );
        if (deleteError) throw deleteError;
    }
    await supabase(['db', 'reset', '--local', '--yes'], { capture: true });
    await updateLocalEnv();
    await sql(statement, { capture: true });
    const { client } = await localAdmin();
    for (const bucket of manifest.storage.buckets) {
        const { error } = await client.storage.createBucket(bucket.id, {
            public: bucket.public,
            fileSizeLimit: bucket.file_size_limit,
            allowedMimeTypes: bucket.allowed_mime_types,
        });
        if (error) throw error;
    }
    for (const object of manifest.storage.objects) {
        const { error } = await client.storage
            .from(object.bucket)
            .upload(object.name, readFileSync(resolve(path, object.file)), {
                contentType: object.contentType,
            });
        if (error) throw error;
    }
    // Existing copied users keep UUID/history. Only the three configured test
    // accounts receive local passwords; missing test accounts are provisioned.
    await bootstrapUsers();
    await configurePush(false, { persist: true });
    await compose([
        'up',
        '--detach',
        '--build',
        '--wait',
        '--wait-timeout',
        '240',
    ]);
    console.log(
        'Staging snapshot restored locally. Test accounts ready; dispatcher disabled.',
    );
}

async function main() {
    const command = process.argv[2];
    if (command === 'export') await exportSnapshot();
    else if (command === 'restore') await restoreSnapshot(process.argv[3]);
    else if (command === 'refresh') {
        await localAdmin();
        const directory = await exportSnapshot();
        await restoreSnapshot(directory);
    } else
        throw new Error(
            'Usage: node scripts/local-snapshot.mjs export|restore|refresh [snapshot-directory]',
        );
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
