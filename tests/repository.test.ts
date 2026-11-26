import { describe, expect, it, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
import { createMockRepository, isSnapshot } from '../src/services/mockRepository';
import { filterActivities, parseLocalDate, validateInvite } from '../src/domain/activity';
import { createSeed } from '../src/data/seed';
import { InviteInput } from '../src/domain/models';

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: vi.fn(async () => value),
    setItem: vi.fn(async (_key: string, data: string) => {
      value = data;
    }),
  };
}
const input = (): InviteInput => ({
  title: 'Кофе после пар',
  description: 'Познакомимся и обсудим идеи для проекта.',
  location: 'Кофейня у входа',
  category: 'Общение',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  capacity: 4,
});

describe('demo repository', () => {
  it('persists auth, profile, plans and invitations across repository instances', async () => {
    const storage = memoryStorage();
    const repo = createMockRepository(storage);
    expect((await repo.load()).session).toBe(false);
    await repo.signIn(' Test@example.com ');
    await repo.toggleSaved('hackathon');
    await repo.toggleJoined('volley');
    const created = await repo.createInvite(input());
    expect(created.activities[0].attendees).toBe(1);
    const state = await createMockRepository(storage).load();
    expect(state.profile.email).toBe('test@example.com');
    expect(state.session).toBe(true);
    expect(state.joinedIds).toEqual(['volley']);
    expect(state.savedIds).toEqual(['hackathon']);
    expect(state.activities[0].hostId).toBe(state.profile.id);
    await repo.signOut();
    expect((await createMockRepository(storage).load()).session).toBe(false);
    expect((await repo.signIn('test@example.com')).joinedIds).toEqual(['volley']);
  });
  it('rejects full meetings and unauthenticated changes; join is reversible', async () => {
    const repo = createMockRepository(memoryStorage());
    await expect(repo.toggleJoined('volley')).rejects.toThrow('Сначала войди');
    await repo.signIn('test@example.com');
    await expect(repo.toggleJoined('exam')).rejects.toThrow('Все места');
    await repo.toggleJoined('volley');
    expect((await repo.toggleJoined('volley')).joinedIds).toEqual([]);
    const state = await repo.createInvite(input());
    await expect(repo.toggleJoined(state.activities[0].id)).rejects.toThrow('организатор');
  });
  it('serializes concurrent writes without losing changes', async () => {
    const repo = createMockRepository(memoryStorage());
    await repo.signIn('test@example.com');
    await Promise.all([repo.toggleSaved('volley'), repo.toggleSaved('team')]);
    expect((await repo.load()).savedIds).toEqual(['volley', 'team']);
  });
  it('does not publish in-memory changes when storage fails', async () => {
    const storage = memoryStorage();
    const repo = createMockRepository(storage);
    await repo.signIn('test@example.com');
    storage.setItem.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(repo.toggleSaved('team')).rejects.toThrow('disk unavailable');
    expect((await repo.load()).savedIds).toEqual([]);
    expect((await repo.toggleSaved('team')).savedIds).toEqual(['team']);
  });
  it('recovers corrupt caches and resets demo changes', async () => {
    const storage = memoryStorage();
    await storage.setItem('key', '{broken');
    const repo = createMockRepository(storage);
    expect(isSnapshot(await repo.load())).toBe(true);
    await repo.signIn('test@example.com');
    await repo.createInvite(input());
    const reset = await repo.reset();
    expect(reset.session).toBe(false);
    expect(reset.activities).toHaveLength(7);
    expect(isSnapshot({ ...reset, profile: {} })).toBe(false);
  });
  it('updates host details on the students own invitations', async () => {
    const repo = createMockRepository(memoryStorage());
    await repo.signIn('test@example.com');
    const created = await repo.createInvite(input());
    const updated = await repo.updateProfile({ ...created.profile, name: 'Алексей' });
    expect(updated.activities[0].host).toBe('Алексей');
  });
});
describe('discovery and validation', () => {
  it('combines category and case-insensitive text search', () => {
    const activities = createSeed().activities;
    expect(filterActivities(activities, 'Спорт', ' ВОЛЕЙБОЛ ')).toHaveLength(1);
    expect(filterActivities(activities, 'Учёба', 'ВОЛЕЙБОЛ')).toHaveLength(0);
  });
  it('rejects invalid calendar dates, times and past dates', () => {
    expect(parseLocalDate('31.02.2027', '18:00')).toBeNull();
    expect(parseLocalDate('12.12.2027', '24:00')).toBeNull();
    expect(parseLocalDate('12.12.2027', '18:75')).toBeNull();
    expect(parseLocalDate('12.12.2027', '18:00')).not.toBeNull();
    expect(validateInvite({ ...input(), startsAt: '2020-01-01' })).toContain('будущем');
    expect(validateInvite({ ...input(), capacity: 1 })).toContain('от 2 до 100');
    expect(validateInvite(input())).toBeNull();
  });
});
