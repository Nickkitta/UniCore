import { ScrollView, TextInput, View } from 'react-native';
import { categories, CategoryFilter } from '@unicore/shared';
import { useTheme } from '../theme';
import { Chip, Icon, Row } from './ui';

export function Discovery({
  query,
  onQuery,
  category,
  onCategory,
  placeholder = 'Событие, интерес или место',
}: {
  query: string;
  onQuery: (value: string) => void;
  category: CategoryFilter;
  onCategory: (value: CategoryFilter) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 16 }}>
      <Row
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          paddingHorizontal: 16,
          borderRadius: 16,
          minHeight: 52,
        }}
      >
        <Icon name="search-outline" color={colors.muted} size={20} />
        <TextInput
          accessibilityLabel="Поиск"
          placeholder={placeholder}
          value={query}
          onChangeText={onQuery}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 14, paddingVertical: 15 }}
        />
      </Row>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {categories.map((item) => (
          <Chip
            key={item}
            title={item}
            selected={category === item}
            onPress={() => onCategory(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
