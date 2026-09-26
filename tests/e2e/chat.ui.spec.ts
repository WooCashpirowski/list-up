import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import type { Database } from '@/src/lib/supabase/database.types';

import { observeRealtimeSubscriptions } from './realtime';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const firstEmail = process.env.E2E_TEST_EMAIL;
const firstPassword = process.env.E2E_TEST_PASSWORD;
const secondEmail = process.env.E2E_SECOND_USER_EMAIL;
const secondPassword = process.env.E2E_SECOND_USER_PASSWORD;
const thirdEmail = process.env.E2E_THIRD_USER_EMAIL;
const thirdPassword = process.env.E2E_THIRD_USER_PASSWORD;

const hasConfig = Boolean(
    url &&
    anonKey &&
    serviceRoleKey &&
    firstEmail &&
    firstPassword &&
    secondEmail &&
    secondPassword &&
    thirdEmail &&
    thirdPassword,
);

async function signIn(page: Page, email: string, password: string) {
    await page.goto('/');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible();
}

test('delivers chat messages in realtime, tracks unread, and syncs an offline send', async ({
    browser,
}) => {
    test.skip(!hasConfig, 'Set three app users and the test service role');

    const firstContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
    });
    const secondContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
    });
    const thirdContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
    });
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    const thirdPage = await thirdContext.newPage();
    const firstRealtime = observeRealtimeSubscriptions(firstPage);
    const secondRealtime = observeRealtimeSubscriptions(secondPage);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const onlineMessage = `Realtime chat ${suffix}`;
    const offlineMessage = `Offline chat ${suffix}`;
    const admin = createClient<Database>(url!, serviceRoleKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    let secondUserId: string | null = null;
    let conversationId: string | null = null;
    let previousReadState:
        | Database['public']['Tables']['chat_read_state']['Row']
        | null = null;

    try {
        await Promise.all([
            signIn(firstPage, firstEmail!, firstPassword!),
            signIn(secondPage, secondEmail!, secondPassword!),
            signIn(thirdPage, thirdEmail!, thirdPassword!),
        ]);
        const { data: profiles } = await admin
            .from('profiles')
            .select('id, email')
            .in('email', [firstEmail!, secondEmail!]);
        const firstUserId = profiles?.find(
            ({ email }) => email === firstEmail,
        )?.id;
        secondUserId =
            profiles?.find(({ email }) => email === secondEmail)?.id ?? null;
        const { data: conversations } = await admin
            .from('chat_conversations')
            .select('*');
        conversationId =
            conversations?.find(
                (conversation) =>
                    [conversation.first_user_id, conversation.second_user_id]
                        .sort()
                        .join(':') ===
                    [firstUserId, secondUserId].sort().join(':'),
            )?.id ?? null;
        expect(conversationId).toBeTruthy();
        const { data: savedReadState } = await admin
            .from('chat_read_state')
            .select('*')
            .eq('conversation_id', conversationId!)
            .eq('user_id', secondUserId!)
            .maybeSingle();
        previousReadState = savedReadState;

        await firstPage
            .getByRole('button', { name: 'Chat', exact: true })
            .click();
        await expect(
            firstPage.getByRole('heading', { name: 'Chat' }),
        ).toBeVisible();
        const firstRealtimeReady = firstRealtime.waitForSubscription(
            `list-up:chat:${conversationId}:live`,
        );
        await firstPage
            .getByRole('button')
            .filter({ hasText: secondEmail! })
            .click();
        await expect(firstPage).toHaveURL(
            new RegExp(`[?&]conversation=${conversationId}`),
        );
        await firstRealtimeReady;
        await firstPage
            .getByRole('textbox', { name: 'Message', exact: true })
            .fill(onlineMessage);
        await firstPage.getByRole('button', { name: 'Send message' }).click();
        await expect(
            firstPage.getByText(onlineMessage, { exact: true }),
        ).toBeVisible();
        const firstMessageBubble = firstPage
            .getByText(onlineMessage, { exact: true })
            .locator('..');
        await test.step('updates the sender bubble after recipient delivery', async () => {
            try {
                await expect(
                    firstMessageBubble.getByLabel('Delivered'),
                ).toBeVisible();
            } catch (error) {
                const { data: sentMessage } = await admin
                    .from('chat_messages')
                    .select('sequence')
                    .eq('conversation_id', conversationId!)
                    .eq('body', onlineMessage)
                    .maybeSingle();
                const { data: recipientReceipt } = await admin
                    .from('chat_read_state')
                    .select('last_delivered_sequence, last_read_sequence')
                    .eq('conversation_id', conversationId!)
                    .eq('user_id', secondUserId!)
                    .maybeSingle();
                await test.info().attach('delivery-receipt-diagnostic', {
                    body: Buffer.from(
                        JSON.stringify({ sentMessage, recipientReceipt }),
                    ),
                    contentType: 'application/json',
                });
                throw error;
            }
        });

        await expect(
            secondPage.getByLabel(/unread chat messages/),
        ).toBeVisible();
        await expect(thirdPage.getByLabel(/unread chat messages/)).toHaveCount(
            0,
        );
        await secondPage.getByRole('button', { name: /Chat/ }).click();
        const secondRealtimeReady = secondRealtime.waitForSubscription(
            `list-up:chat:${conversationId}:live`,
        );
        await secondPage
            .getByRole('button')
            .filter({ hasText: firstEmail! })
            .click();
        await expect(secondPage).toHaveURL(
            new RegExp(`[?&]conversation=${conversationId}`),
        );
        await secondRealtimeReady;
        await expect(
            secondPage.getByText(onlineMessage, { exact: true }),
        ).toBeVisible();
        await expect(secondPage.getByLabel(/unread chat messages/)).toHaveCount(
            0,
        );
        await expect(firstMessageBubble.getByLabel('Read')).toBeVisible();
        await thirdPage.getByRole('button', { name: /Chat/ }).click();
        await expect(
            thirdPage.getByText(onlineMessage, { exact: true }),
        ).toHaveCount(0);

        await secondPage
            .getByRole('textbox', { name: 'Message', exact: true })
            .fill('Typing preview');
        await expect(firstPage.getByLabel(/is typing/)).toBeVisible();
        await secondPage
            .getByRole('textbox', { name: 'Message', exact: true })
            .fill('');
        await expect(firstPage.getByLabel(/is typing/)).toHaveCount(0);

        await firstContext.setOffline(true);
        await firstPage
            .getByRole('textbox', { name: 'Message', exact: true })
            .fill(offlineMessage);
        await firstPage.getByRole('button', { name: 'Send message' }).click();
        await expect(
            firstPage.getByText(offlineMessage, { exact: true }),
        ).toBeVisible();
        await expect(firstPage.getByLabel(/queued/i)).toBeVisible();

        await firstContext.setOffline(false);
        await expect(
            secondPage.getByText(offlineMessage, { exact: true }),
        ).toBeVisible();
    } finally {
        firstRealtime.dispose();
        secondRealtime.dispose();
        const { data: messages } = await admin
            .from('chat_messages')
            .select('id')
            .in('body', [onlineMessage, offlineMessage]);
        const ids = messages?.map(({ id }) => id) ?? [];
        if (ids.length > 0) {
            await admin
                .from('notification_events')
                .delete()
                .in('source_id', ids);
            if (secondUserId) {
                await admin
                    .from('chat_read_state')
                    .delete()
                    .eq('user_id', secondUserId)
                    .eq('conversation_id', conversationId!);
            }
            await admin.from('chat_messages').delete().in('id', ids);
            if (previousReadState) {
                await admin.from('chat_read_state').insert(previousReadState);
            }
        }
        await firstContext.close();
        await secondContext.close();
        await thirdContext.close();
    }
});
