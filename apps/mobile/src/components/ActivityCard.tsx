import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Activity } from '@unicore/shared';
import { formatDate, formatTime, formatPrice, participantCount } from '../domain/activity';
import { useCampus } from '../state/CampusProvider';
import { campusRepository } from '../services';
import { useTheme } from '../theme';
import { Avatar, Icon, IconButton, Row, Txt } from './ui';
import { PhotoGallery } from './PhotoGallery';

export function ActivityCard({ activity: a }: { activity: Activity }) {
  const { state, busy, run } = useCampus();
  const { colors } = useTheme();
  const saved = state.savedIds.includes(a.id);
  const joined = state.joinedIds.includes(a.id);
  const own = a.hostId === state.profile.id;
  const count = participantCount(a, state.joinedIds);
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <Row style={{ padding: 16 }}>
        <Avatar name={a.organizationName || a.host} size={36} />
        <View style={{ flex: 1 }}>
          <Txt variant="label">{a.organizationName || a.host}</Txt>
          <Txt variant="small" color={colors.muted}>
            {a.category}
          </Txt>
        </View>
        <IconButton
          name={saved ? 'bookmark' : 'bookmark-outline'}
          label={saved ? `Убрать из сохранённого: ${a.title}` : `Сохранить: ${a.title}`}
          active={saved}
          disabled={busy}
          onPress={() => void run(() => campusRepository.toggleSaved(a.id, !saved))}
        />
      </Row>
      <PhotoGallery urls={a.photoUrls || []} />
      {!!a.partnerBadge && (
        <View
          style={{
            alignSelf: 'flex-start',
            marginHorizontal: 16,
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 16,
            backgroundColor: colors.accent,
          }}
        >
          <Txt variant="small" color={colors.ink}>
            ✦ {a.partnerBadge}
          </Txt>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Открыть: ${a.title.replace(/\n/g, ' ')}`}
        onPress={() => router.push(`/activity/${a.id}`)}
        style={({ pressed }) => ({ padding: 16, gap: 10, opacity: pressed ? 0.7 : 1 })}
      >
        <Txt variant="heading">{a.title.replace(/\n/g, ' ')}</Txt>
        <Txt color={colors.muted} numberOfLines={3}>
          {a.description}
        </Txt>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          <Icon name="calendar-outline" size={16} color={colors.muted} />
          <Txt variant="small" color={colors.muted}>
            {formatDate(a.startsAt)} · {formatTime(a.startsAt)}
          </Txt>
        </Row>
        <Row style={{ gap: 6 }}>
          <Icon
            name={a.coordinates ? 'navigate-outline' : 'location-outline'}
            size={16}
            color={colors.muted}
          />
          <Txt variant="small" color={colors.muted} style={{ flex: 1 }}>
            {a.location}
          </Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          <Txt variant="label" color={(a.priceRub || 0) > 0 ? colors.accent : colors.muted}>
            {formatPrice(a.priceRub)}
          </Txt>
          <Txt variant="small" color={joined || own ? colors.accent : colors.muted}>
            {own ? 'Организую' : joined ? 'Участвую' : `${count} / ${a.capacity} участников`}
          </Txt>
        </Row>
      </Pressable>
    </View>
  );
}
