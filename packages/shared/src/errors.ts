import type { ApiErrorCode } from './api/errors.ts';

export const networkErrorMessage = 'Не удалось связаться с сервером — проверь интернет и повтори';
export const unknownErrorMessage = 'Не удалось выполнить действие — попробуй ещё раз';

// Russian texts for the error codes of the API; the client shows them by code.
// `satisfies` makes a new code in api/errors.ts fail the typecheck until it gets a text.
const apiErrorMessages = {
  UNICORE_AUTH_REQUIRED: 'Войди в аккаунт ещё раз',
  UNICORE_INVALID_CREDENTIALS: 'Неверная почта или пароль',
  UNICORE_ROOM_DENIED: 'Чат доступен только организатору и участникам встречи',
  UNICORE_ORGANIZATION_FORBIDDEN: 'Создавать события от сообщества может его организатор',
  UNICORE_FORBIDDEN: 'Недостаточно прав для этого действия',
  UNICORE_EMAIL_NOT_CONFIRMED: 'Подтверди почту по ссылке в письме, затем войди',
  UNICORE_WRONG_PORTAL:
    'Этот аккаунт входит через другой портал — переключи вход студента или партнёра',
  UNICORE_BAD_SIGNATURE: 'Ссылка на фото устарела — обнови ленту',
  UNICORE_NOT_FOUND: 'Встреча больше недоступна',
  UNICORE_FULL: 'Все места уже заняты',
  UNICORE_PAST: 'Эта встреча уже началась',
  UNICORE_HOST: 'Ты организатор этой встречи',
  UNICORE_PARTNER_JOIN: 'Партнёры организуют собственные встречи',
  UNICORE_EMAIL_TAKEN: 'Этот адрес уже зарегистрирован — попробуй войти',
  UNICORE_FILE_TOO_LARGE: 'Фотография должна быть не больше 5 МБ',
  UNICORE_INVALID_INPUT: 'Проверь заполнение полей и допустимую длину текста',
  UNICORE_INVALID_GROUP: 'Выбери группу своего института',
  UNICORE_INVALID_TAGS: 'Выбери до четырёх тегов из списка',
  UNICORE_INVALID_PHOTOS: 'Не удалось прикрепить фотографии — выбери их заново',
  UNICORE_INVALID_CODE: 'Промокод не подошёл — проверь его или запроси новый у администратора',
  UNICORE_WEAK_PASSWORD: 'Пароль должен содержать хотя бы 8 символов',
  UNICORE_RATE_LIMIT: 'Слишком много попыток — подожди несколько минут',
  UNICORE_INTERNAL: unknownErrorMessage,
} as const satisfies Record<ApiErrorCode, string>;

export const errorMessages = {
  ...apiErrorMessages,
  // Raised only by the Supabase SQL functions; goes away with them in stage 9.
  UNICORE_PROFILE_REQUIRED: 'Обнови страницу и заполни профиль',
} as const;

export type ErrorCode = keyof typeof errorMessages;
