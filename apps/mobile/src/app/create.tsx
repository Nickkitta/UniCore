import { useState } from 'react';
import { Image, Modal, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Chip, Field, IconButton, Row, Screen, Txt } from '../components/ui';
import { EventMap } from '../components/EventMap';
import {
  categories,
  Category,
  eventTags,
  GeoPoint,
  parseLocalDate,
  PartnerBadge,
  partnerBadges,
  PhotoDraft,
  validateInvite,
} from '@unicore/shared';
import { campusRepository } from '../services';
import { pickPhotos } from '../services/photos';
import { useCampus } from '../state/CampusProvider';
import { useTheme } from '../theme';

export default function CreateEvent() {
  const { state, run, busy } = useCampus();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const partner = state.profile.accountKind === 'partner';
  const [badge, setBadge] = useState<PartnerBadge>(partnerBadges[0]);
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('Общение');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('ru-RU');
  });
  const [time, setTime] = useState('18:00');
  const [capacity, setCapacity] = useState('6');
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const [price, setPrice] = useState('');
  const [coordinates, setCoordinates] = useState<GeoPoint | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [mapDraft, setMapDraft] = useState<(GeoPoint & { address?: string }) | null>(null);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [picking, setPicking] = useState(false);
  async function addPhotos() {
    setPicking(true);
    setError('');
    try {
      const selected = await pickPhotos(5 - photos.length);
      setPhotos((p) => [...p, ...selected].slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выбрать фотографии');
    } finally {
      setPicking(false);
    }
  }
  async function submit() {
    const startsAt = parseLocalDate(date, time);
    if (!startsAt) {
      setError('Проверь дату и время: ДД.ММ.ГГГГ и ЧЧ:ММ');
      return;
    }
    if (paid && (!/^\d+$/.test(price.trim()) || Number(price) < 1)) {
      setError('Укажи стоимость от 1 ₽');
      return;
    }
    const input = {
      title,
      category,
      location,
      description,
      startsAt,
      capacity: Number(capacity),
      priceRub: paid ? Number(price) : 0,
      coordinates,
      photos,
      organizationId,
      tags,
      partnerBadge: partner ? badge : undefined,
    };
    const validation = validateInvite(input);
    if (validation) {
      setError(validation);
      return;
    }
    setError('');
    if (
      await run(async () => {
        try {
          return await campusRepository.createInvite(input);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Не удалось опубликовать событие');
          throw e;
        }
      }, 'Событие опубликовано')
    )
      router.replace('/');
  }
  return (
    <Screen>
      <Row>
        <IconButton
          name="close"
          label="Закрыть"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Txt variant="heading">Новое событие</Txt>
      </Row>
      {partner && (
        <View style={{ gap: 8 }}>
          <Txt variant="label">{state.profile.company} · метка публикации</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            {partnerBadges.map((item) => (
              <Chip
                key={item}
                title={item}
                selected={badge === item}
                onPress={() => setBadge(item)}
              />
            ))}
          </Row>
        </View>
      )}
      {!partner && !!state.organizations?.length && (
        <View style={{ gap: 8 }}>
          <Txt variant="small" color={colors.muted}>
            От чьего имени
          </Txt>
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            <Chip
              title="От себя"
              selected={!organizationId}
              onPress={() => setOrganizationId(null)}
            />
            {state.organizations.map((o) => (
              <Chip
                key={o.id}
                title={o.name}
                selected={organizationId === o.id}
                onPress={() => setOrganizationId(o.id)}
              />
            ))}
          </Row>
        </View>
      )}
      <Field
        label="Название"
        placeholder="Например, настолки после пар"
        value={title}
        onChangeText={setTitle}
        maxLength={80}
      />
      <Field
        label="Описание"
        placeholder="Что планируешь и кого ждёшь"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1500}
      />
      <View style={{ gap: 12 }}>
        {!!photos.length && (
          <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>
            {photos.map((photo, index) => (
              <View key={`${index}:${photo.uri}`}>
                <Image
                  source={{ uri: photo.uri }}
                  style={{ width: 112, height: 112, borderRadius: 14 }}
                />
                <View style={{ position: 'absolute', top: 2, right: 2 }}>
                  <IconButton
                    name="close"
                    label={`Удалить фото ${index + 1}`}
                    disabled={busy}
                    onPress={() => setPhotos((p) => p.filter((_, i) => i !== index))}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <Button
          title={`Добавить фото${photos.length ? ` · ${photos.length}/5` : ''}`}
          secondary
          icon="images-outline"
          loading={picking}
          disabled={busy || photos.length >= 5}
          onPress={() => void addPhotos()}
        />
      </View>
      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
        {categories
          .filter((c): c is Category => c !== 'Все')
          .map((c) => (
            <Chip key={c} title={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
      </Row>
      <Txt variant="label">Теги · до четырёх</Txt>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {eventTags.map((tag) => (
          <Chip
            key={tag}
            title={tag}
            selected={tags.includes(tag)}
            onPress={() => {
              if (!tags.includes(tag) && tags.length === 4) {
                setError('Можно выбрать до четырёх тегов');
                return;
              }
              setError('');
              setTags((prev) =>
                prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
              );
            }}
          />
        ))}
      </ScrollView>
      <Field
        label="Место"
        placeholder="Адрес, аудитория или ссылка на встречу"
        value={location}
        onChangeText={setLocation}
        maxLength={120}
      />
      <>
        <Button
          title={coordinates ? 'Изменить точку на карте' : 'Добавить точку на карте'}
          secondary
          icon="location-outline"
          onPress={() => {
            setMapDraft(coordinates);
            setShowMap(true);
          }}
        />
        {coordinates && (
          <Button title="Убрать геометку" secondary onPress={() => setCoordinates(null)} />
        )}
        {showMap && (
          <Modal visible animationType="slide" onRequestClose={() => setShowMap(false)}>
            <SafeAreaView style={{ flex: 1, padding: 12, gap: 12, backgroundColor: colors.bg }}>
              <Row>
                <IconButton name="close" label="Закрыть карту" onPress={() => setShowMap(false)} />
                <Txt variant="heading">Место встречи</Txt>
              </Row>
              <EventMap point={coordinates} editable onChange={setMapDraft} />
              <Txt>
                {mapDraft?.address ||
                  (mapDraft
                    ? `${mapDraft.latitude.toFixed(5)}, ${mapDraft.longitude.toFixed(5)}`
                    : 'Коснись места или выбери центр карты')}
              </Txt>
              <Button
                title="Сохранить точку"
                icon="location"
                disabled={!mapDraft}
                onPress={() => {
                  if (!mapDraft) return;
                  setCoordinates({ latitude: mapDraft.latitude, longitude: mapDraft.longitude });
                  if (
                    process.env.EXPO_PUBLIC_STORE_MAP_ADDRESS === 'true' &&
                    mapDraft.address &&
                    !location.trim()
                  )
                    setLocation(mapDraft.address);
                  setShowMap(false);
                }}
              />
            </SafeAreaView>
          </Modal>
        )}
      </>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Дата · ДД.ММ.ГГГГ"
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
        <View style={{ flex: 0.75 }}>
          <Field
            label="Время · ЧЧ:ММ"
            value={time}
            onChangeText={setTime}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
      </Row>
      <Field
        label={partner ? 'Мест для участников' : 'Мест, включая организатора'}
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="number-pad"
        maxLength={3}
      />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="label">Платное участие</Txt>
        <Switch
          accessibilityLabel="Платное участие"
          value={paid}
          onValueChange={setPaid}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </Row>
      {paid && (
        <View style={{ gap: 8 }}>
          <Field
            label="Стоимость за человека, ₽"
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
            maxLength={7}
          />
          <Txt variant="small" color={colors.muted}>
            Оплату участники обсуждают с организатором, в приложении деньги не списываются
          </Txt>
        </View>
      )}
      {!!error && (
        <Txt color={colors.danger} accessibilityRole="alert">
          {error}
        </Txt>
      )}
      <Button
        title="Опубликовать событие"
        loading={busy}
        disabled={picking}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
