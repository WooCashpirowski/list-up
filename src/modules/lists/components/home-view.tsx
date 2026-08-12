'use client';

import {
    Check,
    ChevronRight,
    ListChecks,
    Pencil,
    Plus,
    ShoppingBasket,
    Trash2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { LanguageToggle, useI18n } from '@/src/modules/i18n';
import type { ListItem } from '@/src/modules/list-items/types/list-item.types';

import type { List, ListType } from '../types/list.types';
import { ListTypeSelector } from './list-type-selector';

type HomeViewProps = {
    lists: List[];
    items: ListItem[];
    onOpenList: (id: string) => void;
    onCreateList: (title: string, listType: ListType) => Promise<string | null>;
    onRenameList: (id: string, title: string) => Promise<void>;
    onDeleteList: (id: string) => Promise<void>;
};

function timeAgo(timestamp: string, locale: 'en' | 'pl'): string {
    const difference = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.round(difference / 60_000);
    const formatter = new Intl.RelativeTimeFormat(locale, {
        numeric: 'auto',
        style: 'narrow',
    });

    if (minutes < 1) return formatter.format(0, 'minute');
    if (minutes < 60) return formatter.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return formatter.format(-hours, 'hour');
    return formatter.format(-Math.round(hours / 24), 'day');
}

export function HomeView({
    lists,
    items,
    onOpenList,
    onCreateList,
    onRenameList,
    onDeleteList,
}: HomeViewProps) {
    const { locale, t } = useI18n();
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [listType, setListType] = useState<ListType>('shopping');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftTitle, setDraftTitle] = useState('');
    const createWidgetRef = useRef<HTMLDivElement>(null);
    const mounted = useSyncExternalStore(
        () => () => undefined,
        () => true,
        () => false,
    );

    useEffect(() => {
        if (!creating) return;

        const animationFrame = window.requestAnimationFrame(() => {
            createWidgetRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
            });
        });

        return () => window.cancelAnimationFrame(animationFrame);
    }, [creating]);

    const counts = useMemo(() => {
        const result = new Map<string, { total: number; remaining: number }>();

        for (const item of items) {
            const current = result.get(item.list_id) ?? {
                total: 0,
                remaining: 0,
            };
            current.total += 1;
            if (!item.is_done) current.remaining += 1;
            result.set(item.list_id, current);
        }

        return result;
    }, [items]);

    async function submitCreate() {
        const id = await onCreateList(title, listType);
        if (!id) return;
        setTitle('');
        setListType('shopping');
        setCreating(false);
        onOpenList(id);
    }

    async function submitRename(id: string) {
        if (!draftTitle.trim()) return;
        await onRenameList(id, draftTitle);
        setEditingId(null);
    }

    return (
        <div className='mx-auto flex w-full max-w-md flex-col px-5 pb-28 pt-14'>
            <header className='mb-7 flex items-start justify-between gap-4'>
                <div>
                    <p className='text-sm font-semibold text-primary'>
                        {t('home.greeting')}
                    </p>
                    <h1 className='text-pretty text-3xl font-semibold tracking-tight text-foreground'>
                        {t('home.title')}
                    </h1>
                </div>
                <div className='flex shrink-0 gap-2'>
                    <LanguageToggle />
                    <ThemeToggle />
                </div>
            </header>

            <div className='flex flex-col gap-3'>
                {lists.map((list) => {
                    const count = counts.get(list.id) ?? {
                        total: 0,
                        remaining: 0,
                    };
                    const isEditing = editingId === list.id;
                    const isTodo = list.list_type === 'todo';

                    return (
                        <article
                            key={list.id}
                            className={cn(
                                'surface-card rounded-3xl border bg-card/95 p-3 transition-colors',
                                isTodo
                                    ? 'border-todo/18 hover:border-todo/35'
                                    : 'border-shopping/18 hover:border-shopping/35',
                            )}
                        >
                            <div className='flex items-center gap-2'>
                                <button
                                    onClick={() => onOpenList(list.id)}
                                    className='group flex min-w-0 flex-1 items-center gap-4 rounded-2xl p-1 text-left transition-all active:scale-[0.98]'
                                >
                                    <span
                                        role='img'
                                        aria-label={
                                            list.list_type === 'todo'
                                                ? t('home.typeTodo')
                                                : t('home.typeShopping')
                                        }
                                        className={cn(
                                            'flex size-12 shrink-0 items-center justify-center rounded-2xl transition-colors',
                                            isTodo
                                                ? 'bg-todo-soft text-todo'
                                                : 'bg-shopping-soft text-shopping',
                                        )}
                                    >
                                        {list.list_type === 'todo' ? (
                                            <Check
                                                className='size-6'
                                                strokeWidth={2.5}
                                            />
                                        ) : (
                                            <ShoppingBasket
                                                className='size-6'
                                                strokeWidth={2}
                                            />
                                        )}
                                    </span>
                                    <span className='min-w-0 flex-1'>
                                        <span className='block truncate text-base font-semibold text-foreground'>
                                            {list.title}
                                        </span>
                                        <span
                                            className='mt-0.5 block text-sm text-muted-foreground'
                                            dangerouslySetInnerHTML={{
                                                __html: `${
                                                    count.total === 0
                                                        ? mounted
                                                            ? t(
                                                                  'home.emptyUpdated',
                                                                  {
                                                                      time: timeAgo(
                                                                          list.updated_at,
                                                                          locale,
                                                                      ),
                                                                  },
                                                              )
                                                            : t('home.empty')
                                                        : mounted
                                                          ? t(
                                                                'home.itemsLeftUpdated',
                                                                {
                                                                    remaining:
                                                                        count.remaining,
                                                                    total: count.total,
                                                                    time: timeAgo(
                                                                        list.updated_at,
                                                                        locale,
                                                                    ),
                                                                },
                                                            )
                                                          : t(
                                                                'home.itemsLeft',
                                                                {
                                                                    remaining:
                                                                        count.remaining,
                                                                    total: count.total,
                                                                },
                                                            )
                                                }`,
                                            }}
                                        ></span>
                                    </span>
                                    <ChevronRight className='size-5 shrink-0 text-muted-foreground/60' />
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingId(list.id);
                                        setDraftTitle(list.title);
                                    }}
                                    aria-label={t('home.rename', {
                                        title: list.title,
                                    })}
                                    className='flex size-9 items-center justify-center rounded-full text-muted-foreground active:text-primary'
                                >
                                    <Pencil className='size-4' />
                                </button>
                                <button
                                    onClick={() => {
                                        if (
                                            window.confirm(
                                                t('home.deleteConfirm', {
                                                    title: list.title,
                                                }),
                                            )
                                        ) {
                                            void onDeleteList(list.id);
                                        }
                                    }}
                                    aria-label={t('home.delete', {
                                        title: list.title,
                                    })}
                                    className='flex size-9 items-center justify-center rounded-full text-muted-foreground active:text-destructive'
                                >
                                    <Trash2 className='size-4' />
                                </button>
                            </div>

                            {isEditing && (
                                <div className='mt-3 flex gap-2 border-t border-border/70 pt-3'>
                                    <input
                                        autoFocus
                                        value={draftTitle}
                                        onChange={(event) =>
                                            setDraftTitle(event.target.value)
                                        }
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter')
                                                void submitRename(list.id);
                                            if (event.key === 'Escape')
                                                setEditingId(null);
                                        }}
                                        aria-label={t('home.newName', {
                                            title: list.title,
                                        })}
                                        className='min-w-0 flex-1 rounded-xl border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-primary'
                                    />
                                    <button
                                        onClick={() =>
                                            void submitRename(list.id)
                                        }
                                        aria-label={t('home.saveName')}
                                        className='flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground'
                                    >
                                        <Check className='size-4' />
                                    </button>
                                    <button
                                        onClick={() => setEditingId(null)}
                                        aria-label={t('home.cancelRename')}
                                        className='flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground'
                                    >
                                        <X className='size-4' />
                                    </button>
                                </div>
                            )}
                        </article>
                    );
                })}

                {lists.length === 0 && (
                    <div className='rounded-3xl border border-dashed border-border px-5 py-10 text-center'>
                        <ListChecks className='mx-auto size-8 text-muted-foreground' />
                        <p className='mt-3 font-semibold'>
                            {t('home.noLists')}
                        </p>
                        <p className='mt-1 text-sm text-muted-foreground'>
                            {t('home.noListsDescription')}
                        </p>
                    </div>
                )}
            </div>

            <div
                ref={createWidgetRef}
                data-testid='create-list-widget'
                className='mt-4 scroll-mb-28'
            >
                {creating ? (
                    <div className='surface-card rounded-3xl border border-primary/25 bg-card/95 p-4 backdrop-blur-sm'>
                        <label
                            htmlFor='new-list'
                            className='mb-2 block text-sm font-medium text-foreground'
                        >
                            {t('home.listName')}
                        </label>
                        <input
                            id='new-list'
                            autoFocus
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') void submitCreate();
                                if (event.key === 'Escape') {
                                    setCreating(false);
                                    setTitle('');
                                    setListType('shopping');
                                }
                            }}
                            placeholder={t('home.listPlaceholder')}
                            className='w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary'
                        />
                        <ListTypeSelector
                            name='new-list-type'
                            value={listType}
                            onChange={setListType}
                        />
                        <div className='mt-3 flex gap-2'>
                            <button
                                onClick={() => {
                                    setCreating(false);
                                    setTitle('');
                                    setListType('shopping');
                                }}
                                className='flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground'
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={() => void submitCreate()}
                                className='primary-action flex-1 rounded-2xl py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]'
                            >
                                {t('common.create')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setCreating(true)}
                        className='flex w-full items-center gap-4 rounded-3xl border-2 border-dashed border-border bg-card/35 p-4 text-left transition-all hover:border-primary/35 hover:bg-primary/5 active:scale-[0.98]'
                    >
                        <span className='brand-mark flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary-foreground'>
                            <Plus className='size-6' strokeWidth={2.5} />
                        </span>
                        <span>
                            <span className='block text-base font-semibold text-foreground'>
                                {t('home.createList')}
                            </span>
                            <span className='mt-0.5 flex items-center gap-1 text-sm text-muted-foreground'>
                                <ListChecks className='size-3.5' />{' '}
                                {t('home.createListDescription')}
                            </span>
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
}
