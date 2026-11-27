import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  type Activity,
  createActivityRequestSchema,
  errorBody,
  errorBodySchema,
  errorMessages,
  errorStatus,
  type EventRoom,
  eventRoomSchema,
  fileQuerySchema,
  emailSchema,
  idSchema,
  normalizeEmail,
  partnerBadges,
  postMessageRequestSchema,
  profilePatchSchema,
  signInRequestSchema,
  signUpRequestSchema,
  signUpResponseSchema,
  type Snapshot,
  activitySchema,
  snapshotSchema,
} from '../src/index.ts';

const id = '6f1c2b3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';

const activityInput = () => ({
  title: 'Кофе после пар',
  description: 'Обсудим учёбу и познакомимся поближе',
  location: 'Корпус Г',
  category: 'Общение',
  startsAt: '2026-12-01T15:00:00.000Z',
  capacity: 6,
});

describe('request schemas', () => {
  it('normalizes the email: trimmed and lower-cased', () => {
    const body = signInRequestSchema.parse({
      email: ' Test@Example.com ',
      password: 'secret',
      portal: 'student',
    });
    expect(body.email).toBe('test@example.com');
  });

  it('normalizes the email the same way as normalizeEmail, which the server uses', () => {
    expect(normalizeEmail(' Test@Example.com ')).toBe('test@example.com');
    expect(emailSchema.parse(' Test@Example.com ')).toBe(normalizeEmail(' Test@Example.com '));
  });

  it('rejects a malformed email and an unknown portal', () => {
    expect(
      signInRequestSchema.safeParse({ email: 'test', password: 'x', portal: 'student' }).success,
    ).toBe(false);
    expect(
      signInRequestSchema.safeParse({ email: 'a@b.ru', password: 'x', portal: 'admin' }).success,
    ).toBe(false);
  });

  it('leaves the password length to the server, which answers UNICORE_WEAK_PASSWORD', () => {
    const body = signUpRequestSchema.parse({ email: 'a@b.ru', password: '1', name: '  Аня ' });
    expect(body).toEqual({ email: 'a@b.ru', password: '1', name: 'Аня' });
  });

  it('checks the name and the partner company after trim', () => {
    const base = { email: 'a@b.ru', password: 'password' };
    expect(signUpRequestSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
    expect(signUpRequestSchema.safeParse({ ...base, name: 'я'.repeat(41) }).success).toBe(false);
    const result = signUpRequestSchema.safeParse({
      ...base,
      name: 'Аня',
      partner: { company: ' ', code: 'abc' },
    });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['partner', 'company']]);
  });

  it('fills the defaults of a new activity', () => {
    expect(createActivityRequestSchema.parse(activityInput())).toEqual({
      ...activityInput(),
      priceRub: 0,
      coordinates: null,
      tags: [],
      photoIds: [],
    });
  });

  it('checks the limits of a new activity', () => {
    const invalid = [
      { title: '  Кофе  ' },
      { title: 'я'.repeat(81) },
      { description: 'Коротко' },
      { location: 'Г ' },
      { category: 'Все' },
      { startsAt: '2026-12-01T15:00' },
      { capacity: 1 },
      { capacity: 101 },
      { capacity: 2.5 },
      { priceRub: -1 },
      { priceRub: 1_000_001 },
      { coordinates: { latitude: 91, longitude: 0 } },
      { coordinates: { latitude: 48.7 } },
      { partnerBadge: 'Партнёрская встреча' },
      { organizationId: 'not-a-uuid' },
      { photoIds: ['not-a-uuid'] },
    ];
    for (const patch of invalid) {
      expect(
        createActivityRequestSchema.safeParse({ ...activityInput(), ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
  });

  it('leaves tags, photos and the date in the past to the server', () => {
    const body = createActivityRequestSchema.parse({
      ...activityInput(),
      startsAt: '2001-01-01T10:00:00+03:00',
      tags: ['Кино', 'Кино', 'Нет такого', 'Музыка', 'Книги'],
      photoIds: [id, id, id, id, id, id],
      partnerBadge: partnerBadges[0],
    });
    expect(body.tags).toHaveLength(5);
    expect(body.photoIds).toHaveLength(6);
  });

  it('drops the profile fields a user may not change', () => {
    const patch = profilePatchSchema.parse({
      id,
      email: 'other@example.com',
      accountKind: 'partner',
      isAdmin: true,
      name: ' Аня ',
    });
    expect(patch).toEqual({ name: 'Аня' });
  });

  it('checks the profile fields', () => {
    const invalid = [
      { name: '' },
      { course: '7' },
      { group: 'я'.repeat(21) },
      { bio: 'я'.repeat(301) },
      { interests: ['Все'] },
      { theme: 'dark' },
      { companyAbout: 'я'.repeat(401) },
    ];
    for (const patch of invalid) {
      expect(profilePatchSchema.safeParse(patch).success, JSON.stringify(patch)).toBe(false);
    }
    expect(profilePatchSchema.parse({ course: '', faculty: '', group: '' })).toEqual({
      course: '',
      faculty: '',
      group: '',
    });
  });

  it('accepts messages of 1–1000 characters after trim', () => {
    expect(postMessageRequestSchema.parse({ body: ' Привет ' })).toEqual({ body: 'Привет' });
    expect(postMessageRequestSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(postMessageRequestSchema.safeParse({ body: 'я'.repeat(1001) }).success).toBe(false);
  });

  it('reads ids and file links from the address', () => {
    expect(idSchema.safeParse(id).success).toBe(true);
    expect(idSchema.safeParse('a1').success).toBe(false);
    expect(fileQuerySchema.parse({ exp: '1795000000', sig: 'abc' })).toEqual({
      exp: 1795000000,
      sig: 'abc',
    });
  });
});

describe('responses', () => {
  it('tells tokens from a verification request after sign-up', () => {
    expect(signUpResponseSchema.parse({ verificationRequired: true })).toEqual({
      verificationRequired: true,
    });
    const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };
    expect(signUpResponseSchema.parse(tokens)).toEqual(tokens);
  });

  it('has no Supabase photo paths in an activity', () => {
    const activity = activitySchema.parse({
      ...activityInput(),
      id,
      kind: 'event',
      host: 'Аня',
      hostId: id,
      hostInfo: 'ИМИТ · 4 курс',
      attendees: 1,
      tags: [],
      photoPaths: ['user/photo.jpg'],
      photoUrls: ['/v1/files/1?exp=1&sig=a'],
    });
    expect(activity).not.toHaveProperty('photoPaths');
    expect(activity.photoUrls).toHaveLength(1);
  });

  it('builds the error body', () => {
    const body = errorBody('UNICORE_FULL', 'capacity reached');
    expect(errorBodySchema.parse(body)).toEqual({
      error: { code: 'UNICORE_FULL', message: 'capacity reached' },
    });
  });
});

describe('error codes', () => {
  it('give every code a text and an error status', () => {
    for (const [code, status] of Object.entries(errorStatus)) {
      expect(errorMessages[code as keyof typeof errorMessages], code).toBeTruthy();
      expect(status >= 400 && status < 600, code).toBe(true);
    }
  });

  it('answer 422 for the schema errors', () => {
    expect(errorStatus.UNICORE_INVALID_INPUT).toBe(422);
  });
});

describe('types', () => {
  type ApiActivity = Omit<Activity, 'photoPaths'>;

  it('match the models of the app', () => {
    expectTypeOf<z.infer<typeof eventRoomSchema>>().toEqualTypeOf<EventRoom>();
    expectTypeOf<z.infer<typeof activitySchema>>().toEqualTypeOf<ApiActivity>();
    expectTypeOf<z.infer<typeof snapshotSchema>>().branded.toEqualTypeOf<
      Omit<Snapshot, 'activities'> & { activities: ApiActivity[] }
    >();
    // The app keeps using Snapshot: a parsed response fits it as is.
    expectTypeOf<z.infer<typeof snapshotSchema>>().toExtend<Snapshot>();
  });
});
