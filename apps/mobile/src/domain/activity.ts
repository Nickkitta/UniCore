import type { Activity, CategoryFilter } from '@unicore/shared';

export function filterActivities(items: Activity[], category: CategoryFilter, query: string) {
  const term = query.trim().toLocaleLowerCase('ru');
  return items.filter(
    (a) =>
      (category === 'Все' || a.category === category) &&
      `${a.title} ${a.description} ${a.tags.join(' ')} ${a.location}`
        .toLocaleLowerCase('ru')
        .includes(term),
  );
}
export function participantCount(activity: Activity, joinedIds: string[]) {
  return activity.attendees + Number(joinedIds.includes(activity.id));
}
export function formatPrice(value = 0) {
  return value > 0 ? `${value.toLocaleString('ru-RU')} ₽` : 'Бесплатно';
}
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
