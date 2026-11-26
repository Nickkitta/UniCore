import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Row,
  Screen,
  Txt,
} from '../../components/ui';
import { PhotoGallery } from '../../components/PhotoGallery';
import { EventMap } from '../../components/EventMap';
import { EventRoomPanel } from '../../components/EventRoomPanel';
import { formatDate, formatTime, formatPrice, participantCount } from '../../domain/activity';
import { useCampus } from '../../state/CampusProvider';
import { campusRepository } from '../../services';
import { useTheme } from '../../theme';

export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, busy, run, notify } = useCampus();
  const { colors, panel } = useTheme();
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const a = state.activities.find((item) => item.id === id);
  if (!a)
    return (
      <Screen>
        <EmptyState
          title="Событие не найдено"
          description="Обнови список или выбери другое событие"
          action="К событиям"
          onPress={() => router.replace('/')}
        />
      </Screen>
    );
  const joined = state.joinedIds.includes(a.id),
    saved = state.savedIds.includes(a.id),
    own = a.hostId === state.profile.id;
  const count = participantCount(a, state.joinedIds),
    full = count >= a.capacity,
    past = Date.parse(a.startsAt) <= now;
  const changeParticipation = async () => {
    if (
      await run(
        () => campusRepository.toggleJoined(a.id, !joined),
        joined ? 'Участие отменено' : 'Добавлено в мои планы',
      )
    )
      setConfirmPaid(false);
  };
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton
          name="arrow-back"
          label="Назад"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Txt variant="small" color={colors.muted}>
          {a.category}
        </Txt>
        <IconButton
          name={saved ? 'bookmark' : 'bookmark-outline'}
          label={saved ? 'Убрать из сохранённого' : 'Сохранить событие'}
          active={saved}
          disabled={busy}
          onPress={() => void run(() => campusRepository.toggleSaved(a.id, !saved))}
        />
      </Row>
      <View style={{ borderRadius: 20, overflow: 'hidden' }}>
        <PhotoGallery urls={a.photoUrls || []} />
      </View>
      <Txt variant="title">{a.title.replace(/\n/g, ' ')}</Txt>
      {!!a.organizationName && (
        <Row>
          <Icon name="people-outline" color={colors.accent} />
          <Txt variant="label">{a.organizationName}</Txt>
        </Row>
      )}
      <Row>
        <Avatar name={a.host} />
        <View style={{ flex: 1 }}>
          <Txt variant="label">
            {a.host}
            {own ? ' · это ты' : ''}
          </Txt>
          <Txt variant="small" color={colors.muted}>
            {a.hostInfo || 'Организатор'}
          </Txt>
        </View>
      </Row>
      <Txt>{a.description}</Txt>
      {!!a.partnerBadge && (
        <View style={panel}>
          <Txt variant="label" color={colors.accent}>
            {a.partnerBadge} · Партнёр UniCore
          </Txt>
          {!!a.companyAbout && <Txt>{a.companyAbout}</Txt>}
        </View>
      )}
      {!!a.tags.length && (
        <Txt variant="small" color={colors.accent}>
          {a.tags.map((tag) => `#${tag}`).join(' · ')}
        </Txt>
      )}
      <View style={panel}>
        <Row>
          <Icon name="calendar-outline" color={colors.accent} />
          <Txt>
            {formatDate(a.startsAt)} · {formatTime(a.startsAt)}
          </Txt>
        </Row>
        <Row>
          <Icon name="location-outline" color={colors.accent} />
          <Txt style={{ flex: 1 }}>{a.location}</Txt>
        </Row>
        <Row>
          <Txt variant="heading" color={colors.accent}>
            ₽
          </Txt>
          <Txt variant="label">{formatPrice(a.priceRub)}</Txt>
        </Row>
        {(a.priceRub || 0) > 0 && (
          <Txt variant="small" color={colors.muted}>
            Платное участие — расчёт с организатором, без списания в приложении
          </Txt>
        )}
      </View>
      {a.coordinates && (
        <View style={{ gap: 12 }}>
          <EventMap point={a.coordinates} />
          <Button
            title="Открыть в Яндекс Картах"
            secondary
            icon="navigate-outline"
            onPress={() => {
              const p = a.coordinates!;
              void Linking.openURL(
                `https://yandex.ru/maps/?pt=${p.longitude},${p.latitude}&z=16&l=map`,
              ).catch(() => notify('Не удалось открыть карту'));
            }}
          />
        </View>
      )}
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt color={colors.muted}>Участники</Txt>
        <Txt variant="label">
          {count} / {a.capacity}
        </Txt>
      </Row>
      {(own || joined) && (
        <EventRoomPanel key={`${a.id}:${state.profile.id}`} id={a.id} own={own} />
      )}
      {state.profile.accountKind === 'partner' && !own ? null : confirmPaid && !joined && !own ? (
        <View style={panel}>
          <Txt variant="heading">Участие стоит {formatPrice(a.priceRub)}</Txt>
          <Txt color={colors.muted}>
            Запись не является оплатой — условия и способ расчёта уточни у организатора
          </Txt>
          <Button
            title={`Записаться за ${formatPrice(a.priceRub)}`}
            loading={busy}
            disabled={full || past}
            onPress={() => void changeParticipation()}
          />
          <Button title="Отмена" secondary disabled={busy} onPress={() => setConfirmPaid(false)} />
        </View>
      ) : (
        <Button
          title={
            own
              ? 'Ты организатор'
              : joined
                ? 'Отменить участие'
                : past
                  ? 'Событие началось'
                  : full
                    ? 'Мест нет'
                    : (a.priceRub || 0) > 0
                      ? `Участвовать · ${formatPrice(a.priceRub)}`
                      : 'Участвовать'
          }
          loading={busy}
          disabled={own || (!joined && (past || full))}
          secondary={joined}
          onPress={() => {
            if (!joined && (a.priceRub || 0) > 0) setConfirmPaid(true);
            else void changeParticipation();
          }}
        />
      )}
    </Screen>
  );
}
