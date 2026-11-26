import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ActivityCard } from '../../components/ActivityCard';
import { Chip, EmptyState, Screen, Txt } from '../../components/ui';
import { useCampus } from '../../state/CampusProvider';

const filters = ['Участвую', 'Сохранённое', 'Организую'] as const;
export default function Plans() {
  const { state } = useCampus();
  const partner = state.profile.accountKind === 'partner';
  const [filter, setFilter] = useState<(typeof filters)[number]>(
    partner ? 'Организую' : 'Участвую',
  );
  const items = state.activities
    .filter((a) =>
      filter === 'Участвую'
        ? state.joinedIds.includes(a.id)
        : filter === 'Сохранённое'
          ? state.savedIds.includes(a.id)
          : a.hostId === state.profile.id,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <Screen>
      <Txt variant="title">Мои планы</Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {filters
          .filter((item) => !partner || item !== 'Участвую')
          .map((item) => (
            <Chip
              key={item}
              title={item}
              selected={filter === item}
              onPress={() => setFilter(item)}
            />
          ))}
      </ScrollView>
      {items.map((a) => (
        <ActivityCard key={a.id} activity={a} />
      ))}
      {!items.length && (
        <EmptyState
          title={
            filter === 'Сохранённое'
              ? 'Сохрани что-нибудь интересное'
              : filter === 'Организую'
                ? 'У каждого плана есть начало'
                : 'Оставим место для впечатлений'
          }
          description={
            filter === 'Сохранённое'
              ? 'Нажми на закладку у события — и он появится здесь'
              : filter === 'Организую'
                ? 'Создай встречу и найди людей, которые разделяют твои интересы'
                : 'Присоединись к встрече, и мы добавим её в твои планы'
          }
          action={filter === 'Организую' ? 'Создать событие' : 'Найти свою компанию'}
          onPress={() => router.push(filter === 'Организую' ? '/create' : '/')}
        />
      )}
    </Screen>
  );
}
