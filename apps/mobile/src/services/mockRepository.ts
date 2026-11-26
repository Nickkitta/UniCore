import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSeed } from '../data/seed';
import { participantCount, validateInvite } from '../domain/activity';
import { categories, EventRoom, Snapshot } from '../domain/models';
import { starterGroups } from '../domain/catalog';
import { CampusRepository } from './contracts';

const KEY = 'unicore:demo:v1';
const toggle = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
export function isSnapshot(value: unknown): value is Snapshot {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.session !== 'boolean' ||
    !isObject(value.profile)
  )
    return false;
  const p = value.profile;
  if (
    value.organizations !== undefined &&
    (!Array.isArray(value.organizations) ||
      !value.organizations.every(
        (o) =>
          isObject(o) &&
          typeof o.id === 'string' &&
          typeof o.name === 'string' &&
          typeof o.description === 'string',
      ))
  )
    return false;
  if (p.theme !== undefined && !['violet', 'forest', 'light'].includes(p.theme as string))
    return false;
  if (
    !['id', 'name', 'email', 'faculty', 'course', 'group', 'bio'].every(
      (k) => typeof p[k] === 'string',
    ) ||
    !strings(p.interests) ||
    !p.interests.every((x) => categories.slice(1).includes(x as never))
  )
    return false;
  return (
    strings(value.joinedIds) &&
    strings(value.savedIds) &&
    Array.isArray(value.activities) &&
    value.activities.every(
      (a) =>
        isObject(a) &&
        ['id', 'title', 'description', 'startsAt', 'location', 'host', 'hostId', 'hostInfo'].every(
          (k) => typeof a[k] === 'string',
        ) &&
        (a.kind === 'invite' || a.kind === 'event') &&
        categories.slice(1).includes(a.category as never) &&
        strings(a.tags) &&
        (a.organizationId == null || typeof a.organizationId === 'string') &&
        (a.organizationName == null || typeof a.organizationName === 'string') &&
        (a.priceRub === undefined ||
          (Number.isInteger(a.priceRub) &&
            (a.priceRub as number) >= 0 &&
            (a.priceRub as number) <= 1000000)) &&
        (a.photoPaths === undefined || (strings(a.photoPaths) && a.photoPaths.length <= 5)) &&
        (a.photoUrls === undefined || (strings(a.photoUrls) && a.photoUrls.length <= 5)) &&
        (a.coordinates == null ||
          (isObject(a.coordinates) &&
            typeof a.coordinates.latitude === 'number' &&
            typeof a.coordinates.longitude === 'number' &&
            Number.isFinite(a.coordinates.latitude) &&
            Number.isFinite(a.coordinates.longitude) &&
            Math.abs(a.coordinates.latitude) <= 90 &&
            Math.abs(a.coordinates.longitude) <= 180)) &&
        Number.isFinite(Date.parse(a.startsAt as string)) &&
        Number.isInteger(a.attendees) &&
        Number.isInteger(a.capacity) &&
        (a.attendees as number) >= 0 &&
        (a.capacity as number) >= (a.attendees as number),
    )
  );
}

export function createMockRepository(
  storage: Pick<typeof AsyncStorage, 'getItem' | 'setItem'> = AsyncStorage,
): CampusRepository {
  let current: Snapshot | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  async function load() {
    if (current) return current;
    const raw = await storage.getItem(KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isSnapshot(parsed)) {
          current = parsed;
          return current;
        }
      } catch {
        /* Reset unsupported demo cache. */
      }
    }
    const fresh = createSeed();
    await storage.setItem(KEY, JSON.stringify(fresh));
    current = fresh;
    return fresh;
  }
  function mutate(update: (state: Snapshot) => Snapshot) {
    const task = queue.then(async () => {
      const state = await load();
      const next = update(state);
      await storage.setItem(KEY, JSON.stringify(next));
      current = next;
      return next;
    });
    queue = task.catch(() => undefined);
    return task;
  }
  function requireSession(state: Snapshot) {
    if (!state.session) throw new Error('Сначала войди в деморежим');
  }
  async function localRoom(id: string) {
    const state = await load();
    requireSession(state);
    const event = state.activities.find((item) => item.id === id);
    if (!event || (event.hostId !== state.profile.id && !state.joinedIds.includes(id)))
      throw new Error('Нет доступа к чату');
    const key = `${KEY}:room:${id}`;
    const room: EventRoom = JSON.parse(
      (await storage.getItem(key)) || '{"members":[],"messages":[]}',
    );
    return { state, key, room };
  }
  return {
    load,
    issuePartnerCode: async () => {
      throw new Error('Для приглашения партнёров нужно подключение к серверу');
    },
    room: async (id) => (await localRoom(id)).room,
    async postMessage(id, body) {
      const { state, key, room } = await localRoom(id);
      if (!body.trim() || body.trim().length > 1000)
        throw new Error('Сообщение должно содержать от 1 до 1000 символов');
      room.messages.push({
        id: String(Date.now()),
        body: body.trim(),
        name: state.profile.name,
        sentAt: new Date().toISOString(),
      });
      await storage.setItem(key, JSON.stringify(room));
    },
    removeMember: async () => {
      throw new Error('В локальном режиме нет зарегистрированных участников');
    },
    setCohost: async () => {
      throw new Error('В локальном режиме нет зарегистрированных участников');
    },
    signUp: () => Promise.reject(new Error('Регистрация доступна при подключении сервера')),
    resendConfirmation: () =>
      Promise.reject(new Error('Отправка писем недоступна в локальном режиме')),
    signIn: (email) =>
      mutate((s) => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          throw new Error('Проверь формат почты');
        return {
          ...s,
          session: true,
          profile: { ...s.profile, email: email.trim().toLowerCase() },
        };
      }),
    signOut: () => mutate((s) => ({ ...s, session: false })),
    setTheme: (theme) =>
      mutate((s) => {
        requireSession(s);
        if (!['violet', 'forest', 'light'].includes(theme))
          throw new Error('Выбери тему из списка');
        return { ...s, profile: { ...s.profile, theme } };
      }),
    updateProfile: (profile) =>
      mutate((s) => {
        requireSession(s);
        if (!profile.name.trim() || !profile.faculty.trim() || !profile.group.trim())
          throw new Error('Заполни имя, институт и группу');
        if (!/^[1-6]$/.test(profile.course)) throw new Error('Укажи курс от 1 до 6');
        if (
          !starterGroups.some(
            (item) => item.faculty === profile.faculty && item.group === profile.group,
          )
        )
          throw new Error('Выбери группу своего института');
        return {
          ...s,
          profile: {
            ...profile,
            id: s.profile.id,
            email: s.profile.email,
            name: profile.name.trim(),
          },
          activities: s.activities.map((a) =>
            a.hostId === s.profile.id
              ? {
                  ...a,
                  host: profile.name.trim(),
                  hostInfo: `${profile.faculty} · ${profile.course} курс`,
                }
              : a,
          ),
        };
      }),
    toggleSaved: (id, saved) =>
      mutate((s) => {
        requireSession(s);
        if (!s.activities.some((a) => a.id === id)) throw new Error('Событие не найдено');
        if (saved !== undefined && s.savedIds.includes(id) === saved) return s;
        return { ...s, savedIds: toggle(s.savedIds, id) };
      }),
    toggleJoined: (id, joined) =>
      mutate((s) => {
        requireSession(s);
        const activity = s.activities.find((a) => a.id === id);
        if (!activity) throw new Error('Событие не найдено');
        if (activity.hostId === s.profile.id) throw new Error('Ты организатор этой встречи');
        if (joined !== undefined && s.joinedIds.includes(id) === joined) return s;
        if (!s.joinedIds.includes(id)) {
          if (Date.parse(activity.startsAt) <= Date.now())
            throw new Error('Эта встреча уже началась');
          if (participantCount(activity, s.joinedIds) >= activity.capacity)
            throw new Error('Все места уже заняты');
        }
        return { ...s, joinedIds: toggle(s.joinedIds, id) };
      }),
    createInvite: (input) =>
      mutate((s) => {
        requireSession(s);
        const error = validateInvite(input);
        if (error) throw new Error(error);
        return {
          ...s,
          activities: [
            {
              ...input,
              title: input.title.trim(),
              description: input.description.trim(),
              location: input.location.trim(),
              id: `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              kind: 'event',
              photoUrls: (input.photos || []).map((p) => `data:image/jpeg;base64,${p.base64}`),
              host: s.profile.name,
              hostId: s.profile.id,
              hostInfo: `${s.profile.faculty} · ${s.profile.course} курс`,
              attendees: 1,
              tags: input.tags || [],
            },
            ...s.activities,
          ],
        };
      }),
    reset: () => mutate(() => createSeed()),
  };
}
