import { useState } from 'react';
import { Pressable, View, Share } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Button, Chip, Row, Screen, Txt } from '../../components/ui';
import { useCampus } from '../../state/CampusProvider';
import { campusRepository, isMockMode } from '../../services';
import { themes, useTheme } from '../../theme';
import type { ThemeId } from '@unicore/shared';

export default function Profile() {
  const { state, run, busy, notify } = useCampus();
  const { colors, panel, id, setTheme } = useTheme();
  const p = state.profile;
  const [code, setCode] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  async function changeTheme(next: ThemeId) {
    const previous = id;
    setTheme(next);
    if (!(await run(() => campusRepository.setTheme(next)))) setTheme(previous);
  }
  return (
    <Screen>
      <Txt variant="title">Профиль</Txt>
      <Row>
        <Avatar name={p.name} size={64} />
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{p.name}</Txt>
          <Txt color={colors.muted}>
            {p.accountKind === 'partner' ? p.company : p.faculty || 'ВолГУ'}
          </Txt>
          {!!(p.course || p.group) && (
            <Txt variant="small" color={colors.muted}>
              {[p.course ? `${p.course} курс` : '', p.group].filter(Boolean).join(' · ')}
            </Txt>
          )}
        </View>
      </Row>
      {!!p.bio && <Txt>{p.bio}</Txt>}
      {p.accountKind === 'partner' && !!p.companyAbout && <Txt>{p.companyAbout}</Txt>}
      {p.isAdmin && (
        <View style={panel}>
          <Txt variant="heading">Пригласить партнёра</Txt>
          <Txt>Один код для одной регистрации, действует 7 дней</Txt>
          <Button
            title="Создать промокод"
            loading={issuing}
            onPress={async () => {
              setIssuing(true);
              try {
                setCode(await campusRepository.issuePartnerCode());
              } catch (error) {
                notify(error instanceof Error ? error.message : 'Не удалось создать код');
              } finally {
                setIssuing(false);
              }
            }}
          />
          {!!code && (
            <>
              <Txt selectable>{code}</Txt>
              <Button
                secondary
                title="Поделиться кодом"
                onPress={() =>
                  void Share.share({ message: code }).catch(() =>
                    notify('Не удалось поделиться кодом'),
                  )
                }
              />
            </>
          )}
        </View>
      )}
      {!!p.interests.length && (
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {p.interests.map((item) => (
            <Chip key={item} title={item} />
          ))}
        </Row>
      )}
      <Button
        title="Редактировать профиль"
        secondary
        icon="create-outline"
        onPress={() => router.push('/edit-profile')}
      />
      <View style={{ gap: 14 }}>
        <Txt variant="heading">Оформление</Txt>
        <Row style={{ gap: 10 }}>
          {(Object.keys(themes) as ThemeId[]).map((key) => {
            const theme = themes[key];
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                aria-checked={id === key}
                accessibilityLabel={`Тема: ${theme.name}`}
                accessibilityState={{ checked: id === key, disabled: busy }}
                disabled={busy}
                onPress={() => void changeTheme(key)}
                style={{ flex: 1, gap: 8, alignItems: 'center' }}
              >
                <View
                  style={{
                    width: '100%',
                    height: 78,
                    borderRadius: 16,
                    padding: 12,
                    gap: 6,
                    backgroundColor: theme.colors.bg,
                    borderWidth: 2,
                    borderColor: id === key ? colors.accent : colors.border,
                  }}
                >
                  <View
                    style={{
                      height: 10,
                      width: '50%',
                      backgroundColor: theme.colors.accent,
                      borderRadius: 6,
                    }}
                  />
                  <View
                    style={{ height: 25, backgroundColor: theme.colors.surface, borderRadius: 6 }}
                  />
                </View>
                <Txt variant="small" color={id === key ? colors.text : colors.muted}>
                  {theme.name}
                </Txt>
              </Pressable>
            );
          })}
        </Row>
      </View>
      <View style={panel}>
        <Txt variant="small" color={colors.muted}>
          Почта
        </Txt>
        <Txt>{p.email}</Txt>
      </View>
      <Button
        title="Выйти из профиля"
        secondary
        loading={busy}
        onPress={() => void run(() => campusRepository.signOut())}
      />
      {isMockMode &&
        (confirmReset ? (
          <View style={panel}>
            <Txt>Удалить локальные события и изменения профиля?</Txt>
            <Button
              title="Да, сбросить демоданные"
              disabled={busy}
              onPress={() => void run(() => campusRepository.reset())}
            />
            <Button title="Отмена" secondary onPress={() => setConfirmReset(false)} />
          </View>
        ) : (
          <Button title="Сбросить демоданные" secondary onPress={() => setConfirmReset(true)} />
        ))}
    </Screen>
  );
}
