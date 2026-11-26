import type { SupabaseClient } from '@supabase/supabase-js';
import { decode } from 'base64-arraybuffer';
import { validateInvite } from '../domain/activity';
import type { EventRoom, Snapshot } from '../domain/models';
import type { CampusRepository } from './contracts';
import { isSnapshot } from './mockRepository';

export function signedOutSnapshot(): Snapshot {
  return {
    version: 1,
    session: false,
    profile: {
      id: '',
      name: '',
      email: '',
      faculty: '',
      course: '',
      group: '',
      bio: '',
      interests: [],
    },
    activities: [],
    joinedIds: [],
    savedIds: [],
  };
}

export function backendError(error: unknown): Error {
  const value = error as { code?: string; message?: string };
  const code = value?.code || '';
  const message = value?.message || '';
  const known: Record<string, string> = {
    UNICORE_PARTNER_JOIN: 'Партнёры организуют собственные встречи',
    UNICORE_INVALID_GROUP: 'Выбери группу своего института',
    UNICORE_INVALID_TAGS: 'Выбери до четырёх тегов из списка',
    UNICORE_ROOM_DENIED: 'Чат доступен только организатору и участникам встречи',
    UNICORE_AUTH_REQUIRED: 'Войди в аккаунт ещё раз',
    UNICORE_PAST: 'Эта встреча уже началась',
    UNICORE_FULL: 'Все места уже заняты',
    UNICORE_NOT_FOUND: 'Встреча больше недоступна',
    UNICORE_HOST: 'Ты организатор этой встречи',
    UNICORE_PROFILE_REQUIRED: 'Обнови страницу и заполни профиль',
    UNICORE_INVALID_PHOTOS: 'Не удалось прикрепить фотографии — выбери их заново',
    UNICORE_ORGANIZATION_FORBIDDEN: 'Создавать события от сообщества может его организатор',
    invalid_credentials: 'Неверная почта или пароль',
    'Invalid login credentials': 'Неверная почта или пароль',
    email_not_confirmed: 'Подтверди почту по ссылке в письме, затем войди',
    'Email not confirmed': 'Подтверди почту по ссылке в письме, затем войди',
    user_already_exists: 'Этот адрес уже зарегистрирован — попробуй войти',
    weak_password: 'Выбери более сложный пароль',
    over_email_send_rate_limit: 'Письма отправляются слишком часто — попробуй позже',
    email_address_not_authorized: 'Отправка писем на этот адрес ещё недоступна',
    'Email address not authorized': 'Отправка писем на этот адрес ещё недоступна',
    'Error sending confirmation email':
      'Сервис не смог отправить письмо подтверждения — обратись к команде UniCore',
    'email rate limit exceeded': 'Лимит отправки писем исчерпан — попробуй позже',
    over_request_rate_limit: 'Слишком много попыток — подожди несколько минут',
    email_address_invalid: 'Проверь адрес почты',
    signup_disabled: 'Регистрация временно закрыта',
    '23514': 'Проверь заполнение полей и допустимую длину текста',
    '42501': 'Недостаточно прав для этого действия',
    PGRST202: 'Сервис ещё настраивается — попробуй немного позже',
    PGRST205: 'Сервис ещё настраивается — попробуй немного позже',
  };
  if (known[code]) return new Error(known[code]);
  for (const [key, text] of Object.entries(known)) {
    if (message.includes(key)) return new Error(text);
  }
  if (/network|fetch|connection|timeout/i.test(message)) {
    return new Error('Не удалось связаться с сервером — проверь интернет и повтори');
  }
  return new Error('Не удалось выполнить действие — попробуй ещё раз');
}

export function createSupabaseRepository(client: SupabaseClient | null): CampusRepository {
  const photoCache = new Map<string, { url: string; expires: number }>();
  function db() {
    if (!client) throw new Error('Подключение к серверу не настроено');
    return client;
  }
  async function load(): Promise<Snapshot> {
    const { data: auth, error: authError } = await db().auth.getSession();
    if (authError) throw backendError(authError);
    if (!auth.session) return signedOutSnapshot();
    const { data, error } = await db().rpc('unicore_snapshot');
    if (error) throw backendError(error);
    if (!isSnapshot(data)) throw new Error('Не удалось прочитать ответ сервера');
    const paths = [...new Set(data.activities.flatMap((a) => a.photoPaths || []))];
    const missing = paths.filter((path) => (photoCache.get(path)?.expires || 0) < Date.now());
    if (missing.length) {
      const { data: signed } = await db()
        .storage.from('unicore-events')
        .createSignedUrls(missing, 3600);
      signed?.forEach((item) => {
        if (item.path && item.signedUrl)
          photoCache.set(item.path, { url: item.signedUrl, expires: Date.now() + 3000000 });
      });
    }
    data.activities = data.activities.map((a) => ({
      ...a,
      photoUrls: (a.photoPaths || []).map((path) => photoCache.get(path)?.url || ''),
    }));
    return data;
  }
  async function requireUser() {
    const { data, error } = await db().auth.getSession();
    if (error) throw backendError(error);
    if (!data.session) throw new Error('Сначала войди в аккаунт');
    return data.session.user;
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    await requireUser();
    const { error } = await db().rpc(name, args);
    if (error) throw backendError(error);
    return load();
  }
  return {
    load,
    async room(id) {
      const { data, error } = await db().rpc('unicore_room', { p_activity_id: id });
      if (error) throw backendError(error);
      return data as EventRoom;
    },
    async postMessage(id, body) {
      const { error } = await db().rpc('unicore_post_message', { p_activity_id: id, p_body: body });
      if (error) throw backendError(error);
    },
    removeMember: (id, userId) =>
      rpc('unicore_remove_member', { p_activity_id: id, p_user_id: userId }),
    setCohost: (id, userId, enabled) =>
      rpc('unicore_set_cohost', { p_activity_id: id, p_user_id: userId, p_enabled: enabled }),
    async issuePartnerCode() {
      const { data, error } = await db().rpc('unicore_issue_partner_code');
      if (error) throw backendError(error);
      return data as string;
    },
    async signIn(email, password, portal) {
      if (!password) throw new Error('Введи пароль');
      const { error } = await db().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw backendError(error);
      const state = await load();
      if (portal && (state.profile.accountKind || 'student') !== portal) {
        const { error: signOutError } = await db().auth.signOut({ scope: 'local' });
        if (signOutError) throw backendError(signOutError);
        throw new Error(
          portal === 'partner'
            ? 'Для этого аккаунта выбери вход студента'
            : 'Для этого аккаунта выбери вход партнёра',
        );
      }
      return state;
    },
    async signUp(email, password, name, partner) {
      if (password.length < 8) throw new Error('Пароль должен содержать хотя бы 8 символов');
      if (!name.trim() || name.trim().length > 40) throw new Error('Введи имя до 40 символов');
      const { data, error } = await db().auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            name: name.trim(),
            ...(partner
              ? { company: partner.company.trim(), partner_code: partner.code.trim() }
              : {}),
          },
        },
      });
      if (error) {
        if (partner && /database error saving new user|UNICORE_INVALID_CODE/i.test(error.message))
          throw new Error(
            'Не удалось зарегистрировать компанию — проверь промокод или запроси новый у администратора',
          );
        throw backendError(error);
      }
      return data.session ? load() : signedOutSnapshot();
    },
    async resendConfirmation(email) {
      const { error } = await db().auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });
      if (error) throw backendError(error);
    },
    async signOut() {
      const { error } = await db().auth.signOut({ scope: 'local' });
      if (error) throw backendError(error);
      return signedOutSnapshot();
    },
    subscribe(listener) {
      if (!client) return () => {};
      // Never call another auth API synchronously from the Supabase auth callback
      let timer: ReturnType<typeof setTimeout> | undefined;
      const { data } = client.auth.onAuthStateChange(() => {
        clearTimeout(timer);
        timer = setTimeout(listener, 0);
      });
      return () => {
        clearTimeout(timer);
        data.subscription.unsubscribe();
      };
    },
    async updateProfile(profile) {
      const user = await requireUser();
      if (profile.accountKind === 'partner') {
        if (!profile.name.trim() || !profile.company?.trim())
          throw new Error('Укажи имя и компанию');
        const { error } = await db()
          .from('unicore_profiles')
          .update({
            name: profile.name.trim(),
            bio: profile.bio.trim(),
            company: profile.company.trim(),
            company_about: profile.companyAbout?.trim() || '',
          })
          .eq('id', user.id)
          .select('id')
          .single();
        if (error) throw backendError(error);
        return load();
      }
      if (!profile.name.trim() || !profile.faculty.trim() || !profile.group.trim()) {
        throw new Error('Заполни имя, институт и группу');
      }
      if (!/^[1-6]$/.test(profile.course)) throw new Error('Укажи курс от 1 до 6');
      const { data, error } = await db()
        .from('unicore_profiles')
        .update({
          name: profile.name.trim(),
          faculty: profile.faculty.trim(),
          course: profile.course,
          group_name: profile.group.trim(),
          bio: profile.bio.trim(),
          interests: profile.interests,
        })
        .eq('id', user.id)
        .select('id')
        .single();
      if (error) throw backendError(error);
      if (!data) throw new Error('Профиль не найден — обнови приложение');
      return load();
    },
    async setTheme(theme) {
      if (!['violet', 'forest', 'light'].includes(theme)) throw new Error('Выбери тему из списка');
      const user = await requireUser();
      const { error } = await db()
        .from('unicore_profiles')
        .update({ theme })
        .eq('id', user.id)
        .select('id')
        .single();
      if (error) throw backendError(error);
      return load();
    },
    async toggleSaved(id, saved) {
      const desired = saved ?? !(await load()).savedIds.includes(id);
      return rpc('unicore_set_saved', { p_activity_id: id, p_saved: desired });
    },
    async toggleJoined(id, joined) {
      const desired = joined ?? !(await load()).joinedIds.includes(id);
      return rpc('unicore_set_joined', { p_activity_id: id, p_joined: desired });
    },
    async createInvite(input) {
      const error = validateInvite(input);
      if (error) throw new Error(error);
      const user = await requireUser();
      const paths: string[] = [];
      let published = false;
      try {
        for (const [index, photo] of (input.photos || []).entries()) {
          const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${index}.jpg`;
          const { error: uploadError } = await db()
            .storage.from('unicore-events')
            .upload(path, decode(photo.base64), { contentType: 'image/jpeg', upsert: false });
          if (uploadError) throw backendError(uploadError);
          paths.push(path);
        }
        const { error: createError } = await db().rpc(
          input.partnerBadge
            ? 'unicore_create_partner_event'
            : input.tags?.length
              ? 'unicore_create_tagged_event'
              : 'unicore_create_event',
          {
            ...(input.tags?.length ? { p_tags: input.tags } : {}),
            ...(input.partnerBadge
              ? { p_badge: input.partnerBadge, p_tags: input.tags ?? [] }
              : {}),
            p_title: input.title,
            p_description: input.description,
            p_category: input.category,
            p_starts_at: input.startsAt,
            p_location: input.location,
            p_capacity: input.capacity,
            p_price_rub: input.priceRub || 0,
            p_latitude: input.coordinates?.latitude ?? null,
            p_longitude: input.coordinates?.longitude ?? null,
            p_photo_paths: paths,
            ...(input.organizationId ? { p_organization_id: input.organizationId } : {}),
          },
        );
        if (createError) throw backendError(createError);
        published = true;
        return await load();
      } catch (error) {
        if (!published && paths.length) {
          // Storage policy prevents removal if a timed-out RPC actually committed
          await db()
            .storage.from('unicore-events')
            .remove(paths)
            .catch(() => undefined);
        }
        throw error;
      }
    },
    reset: () => Promise.reject(new Error('Сброс общих данных из приложения недоступен')),
  };
}
