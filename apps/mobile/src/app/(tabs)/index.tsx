import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ActivityCard } from '../../components/ActivityCard';
import { Logo } from '../../components/Logo';
import { Discovery } from '../../components/Discovery';
import { EmptyState, IconButton, Row, Screen, Txt } from '../../components/ui';
import { filterActivities } from '../../domain/activity';
import { CategoryFilter } from '@unicore/shared';
import { useCampus } from '../../state/CampusProvider';
import { useTheme } from '../../theme';

export default function Events() {
  const { state } = useCampus();
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('Все');
  const items = filterActivities(state.activities, category, query).sort((a, b) => {
    const ap = Date.parse(a.startsAt) <= now,
      bp = Date.parse(b.startsAt) <= now;
    return Number(ap) - Number(bp) || a.startsAt.localeCompare(b.startsAt);
  });
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <Logo />
          <View>
            <Txt variant="heading">UniCore</Txt>
            <Txt variant="small" color={colors.muted}>
              ВолГУ
            </Txt>
          </View>
        </Row>
        <IconButton name="add" label="Создать событие" onPress={() => router.push('/create')} />
      </Row>
      <Txt variant="title">События</Txt>
      <Discovery query={query} onQuery={setQuery} category={category} onCategory={setCategory} />
      {items.map((a) => (
        <ActivityCard key={a.id} activity={a} />
      ))}
      {!items.length && (
        <EmptyState
          title="Пока нет событий"
          description={
            query || category !== 'Все'
              ? 'Попробуй другой запрос'
              : 'Создай первое и пригласи друзей'
          }
          action={query || category !== 'Все' ? 'Сбросить фильтры' : 'Создать событие'}
          onPress={() => {
            if (query || category !== 'Все') {
              setQuery('');
              setCategory('Все');
            } else router.push('/create');
          }}
        />
      )}
    </Screen>
  );
}
