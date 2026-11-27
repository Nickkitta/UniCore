import { describe, expect, it } from 'vitest';
import { type InviteInput, parseLocalDate, validateInvite } from '../src/index.ts';

const input = (): InviteInput => ({
  title: 'Кофе после пар',
  description: 'Познакомимся и обсудим идеи для проекта.',
  location: 'Кофейня у входа',
  category: 'Общение',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  capacity: 4,
});

describe('invite validation', () => {
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
