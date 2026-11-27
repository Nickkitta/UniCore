// Russian texts for the error codes the backend returns; the client shows them by code
export const errorMessages = {
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
} as const;

export type ErrorCode = keyof typeof errorMessages;

export const networkErrorMessage = 'Не удалось связаться с сервером — проверь интернет и повтори';
export const unknownErrorMessage = 'Не удалось выполнить действие — попробуй ещё раз';
