import { router } from 'expo-router';
import { EmptyState, Screen } from '../components/ui';
export default function NotFound() {
  return (
    <Screen>
      <EmptyState
        title="Кажется, здесь пусто"
        description="Вернуться к событиям"
        action="На главную"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}
