import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, IconButton, Row, Txt } from './ui';
import { useTheme } from '../theme';

const normalize = (value: string) =>
  value
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]/g, '');

export function SearchSelect({
  label,
  value,
  options,
  names,
  placeholder,
  onSelect,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  names?: Record<string, string>;
  placeholder: string;
  onSelect: (item: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = normalize(query);
    return [...new Set(options)]
      .filter(
        (item) =>
          normalize(item).includes(needle) || normalize(names?.[item] || '').includes(needle),
      )
      .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }));
  }, [options, names, query]);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">{label}</Txt>
      <Button
        title={value || placeholder}
        secondary
        icon="chevron-down"
        disabled={disabled}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
      />
      {open && (
        <Modal visible animationType="slide" onRequestClose={() => setOpen(false)}>
          <SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: colors.bg }}>
            <Row>
              <IconButton name="close" label="Закрыть список" onPress={() => setOpen(false)} />
              <Txt variant="heading">{label}</Txt>
            </Row>
            <Field
              label="Поиск"
              placeholder={names ? 'Название или сокращение' : 'Буквы или номер группы'}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            <FlatList
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              data={visible}
              keyExtractor={(item) => item}
              ListEmptyComponent={
                <Txt>
                  {options.length ? 'Совпадений нет' : 'Группы этого института ещё не добавлены'}
                </Txt>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item}
                  accessibilityState={{ selected: item === value }}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  style={{
                    minHeight: 48,
                    justifyContent: 'center',
                    padding: 10,
                    borderBottomWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Txt variant="label" color={item === value ? colors.accent : colors.text}>
                    {item}
                  </Txt>
                  {names?.[item] && (
                    <Txt variant="small" color={colors.muted}>
                      {names[item]}
                    </Txt>
                  )}
                </Pressable>
              )}
            />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}
