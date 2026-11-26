import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
import { backendError, createSupabaseRepository } from '../src/services/supabaseRepository';
import { createSeed } from '../src/data/seed';

function setup(session = true) {
  const snapshot = { ...createSeed(), session: true };
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: session ? { user: { id: 'current-user' } } : null },
        error: null,
      })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async (name: string) => ({
      data: name === 'unicore_snapshot' ? snapshot : null,
      error: null,
    })),
  };
  return { client, repo: createSupabaseRepository(client as unknown as SupabaseClient) };
}
describe('remote repository', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'Неверная почта или пароль'],
    [{ message: 'Email not confirmed' }, 'Подтверди почту'],
    [{ message: 'Email address not authorized' }, 'Отправка писем на этот адрес ещё недоступна'],
    [{ message: 'Error sending confirmation email' }, 'Сервис не смог отправить письмо'],
    [{ message: 'email rate limit exceeded' }, 'Лимит отправки писем исчерпан'],
  ])('distinguishes sign-in and email delivery failures: %j', (error, message) => {
    expect(backendError(error).message).toContain(message);
  });
  it('does not fetch protected data or fake an account before sign in', async () => {
    const { repo, client } = setup(false);
    const state = await repo.load();
    expect(state.session).toBe(false);
    expect(state.activities).toEqual([]);
    expect(state.profile.id).toBe('');
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('keeps email confirmation separate from an authenticated session', async () => {
    const { repo, client } = setup(false);
    const state = await repo.signUp('  USER@example.com ', 'long-password', 'Никита');
    expect(state.session).toBe(false);
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'long-password',
      options: { data: { name: 'Никита' } },
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('loads the authenticated profile immediately when signup returns a session', async () => {
    const { repo, client } = setup();
    client.auth.signUp.mockResolvedValueOnce({
      data: { session: { user: { id: 'current-user' } } },
      error: null,
    } as never);
    const state = await repo.signUp('user@example.com', 'long-password', 'Никита');
    expect(state.session).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('unicore_snapshot');
    expect(state).toEqual((await client.rpc.mock.results[0].value).data);
  });
  it('sends the intended membership state on repeated requests', async () => {
    const { repo, client } = setup();
    await repo.toggleJoined('meeting', true);
    await repo.toggleJoined('meeting', true);
    const calls = client.rpc.mock.calls.filter(([name]) => name === 'unicore_set_joined');
    expect(calls).toEqual([
      ['unicore_set_joined', { p_activity_id: 'meeting', p_joined: true }],
      ['unicore_set_joined', { p_activity_id: 'meeting', p_joined: true }],
    ]);
  });
  it('does not turn a server failure into successful local data', async () => {
    const { repo, client } = setup();
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'UNICORE_FULL' } } as never);
    await expect(repo.toggleJoined('meeting', true)).rejects.toThrow('Все места уже заняты');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed server snapshots and missing configuration', async () => {
    const { repo, client } = setup();
    client.rpc.mockResolvedValueOnce({ data: { profile: {} }, error: null } as never);
    await expect(repo.load()).rejects.toThrow('ответ сервера');
    await expect(createSupabaseRepository(null).load()).rejects.toThrow('не настроено');
  });
});
