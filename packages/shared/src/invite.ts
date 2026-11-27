import { InviteInput } from './models';
import { eventTags } from './catalog';

export function validateInvite(input: InviteInput, now = Date.now()): string | null {
  if (
    input.tags &&
    (input.tags.length > 4 ||
      new Set(input.tags).size !== input.tags.length ||
      input.tags.some((tag) => !eventTags.includes(tag)))
  )
    return 'Выбери до четырёх разных тегов из списка';
  if (
    input.priceRub !== undefined &&
    (!Number.isInteger(input.priceRub) || input.priceRub < 0 || input.priceRub > 1000000)
  )
    return 'Стоимость — целое число от 0 до 1 000 000 ₽';
  if (
    input.coordinates &&
    (!Number.isFinite(input.coordinates.latitude) ||
      !Number.isFinite(input.coordinates.longitude) ||
      Math.abs(input.coordinates.latitude) > 90 ||
      Math.abs(input.coordinates.longitude) > 180)
  )
    return 'Проверь точку на карте';
  if ((input.photos?.length || 0) > 5) return 'Можно прикрепить до 5 фотографий';
  if (
    input.photos?.some(
      (p) => !p.base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64) || p.base64.length > 6990508,
    )
  )
    return 'Фотография должна быть в формате JPEG и не больше 5 МБ';
  if (input.title.trim().length < 5) return 'Добавь название от 5 символов';
  if (input.location.trim().length < 3) return 'Укажи место встречи';
  if (input.description.trim().length < 15)
    return 'Расскажи о встрече чуть подробнее — от 15 символов';
  if (!Number.isInteger(input.capacity) || input.capacity < 2 || input.capacity > 100)
    return 'Количество участников: от 2 до 100';
  const timestamp = new Date(input.startsAt).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= now) return 'Выбери дату и время в будущем';
  return null;
}
export function parseLocalDate(date: string, time: string): string | null {
  const d = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date.trim());
  const t = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const [, day, month, year] = d.map(Number);
  const [, hour, minute] = t.map(Number);
  const value = new Date(year, month - 1, day, hour, minute);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    hour > 23 ||
    minute > 59
  )
    return null;
  return value.toISOString();
}
