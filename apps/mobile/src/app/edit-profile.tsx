import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chip, Field, IconButton, Row, Screen, Txt } from '../components/ui';
import { categories, Category } from '../domain/models';
import { useCampus } from '../state/CampusProvider';
import { campusRepository, isMockMode } from '../services';
import { instituteNames, starterGroups } from '../domain/catalog';
import { SearchSelect } from '../components/SearchSelect';

export default function EditProfile() {
  const { state, run, busy } = useCampus();
  const [profile, setProfile] = useState(state.profile);
  const groups = state.groups ?? (isMockMode ? starterGroups : []);
  const choices = (
    label: string,
    values: string[],
    value: string,
    choose: (item: string) => void,
  ) => (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        {values.map((item) => (
          <Chip key={item} title={item} selected={item === value} onPress={() => choose(item)} />
        ))}
      </Row>
    </View>
  );
  function update(key: 'name' | 'faculty' | 'course' | 'group' | 'bio', value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
  }
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  return (
    <Screen>
      <Row>
        <IconButton name="close" label="Закрыть" onPress={back} />
        <Txt variant="heading">Твой профиль</Txt>
      </Row>
      <Field
        label="Имя"
        value={profile.name}
        onChangeText={(value) => update('name', value)}
        maxLength={40}
      />
      {profile.accountKind === 'partner' ? (
        <>
          <Field
            label="Компания"
            value={profile.company || ''}
            onChangeText={(company) => setProfile((prev) => ({ ...prev, company }))}
            maxLength={80}
          />
          <Field
            label="Чем занимается компания"
            value={profile.companyAbout || ''}
            onChangeText={(companyAbout) => setProfile((prev) => ({ ...prev, companyAbout }))}
            multiline
            maxLength={400}
          />
        </>
      ) : (
        <>
          <SearchSelect
            label="Институт"
            placeholder="Выбери институт"
            options={[...Object.keys(instituteNames), ...groups.map((item) => item.faculty)]}
            names={instituteNames}
            value={profile.faculty}
            onSelect={(faculty) =>
              setProfile((prev) =>
                prev.faculty === faculty ? prev : { ...prev, faculty, group: '' },
              )
            }
          />
          <SearchSelect
            label="Группа"
            placeholder={profile.faculty ? 'Выбери группу' : 'Сначала выбери институт'}
            disabled={!profile.faculty}
            options={groups
              .filter((item) => item.faculty === profile.faculty)
              .map((item) => item.group)}
            value={profile.group}
            onSelect={(value) => update('group', value)}
          />
          {!groups.length && <Txt>Справочник пока недоступен</Txt>}
          {choices('Курс', ['1', '2', '3', '4', '5', '6'], profile.course, (value) =>
            update('course', value),
          )}
        </>
      )}
      <Field
        label="О себе"
        value={profile.bio}
        onChangeText={(value) => update('bio', value)}
        multiline
        maxLength={300}
      />
      {profile.accountKind !== 'partner' && (
        <View style={{ gap: 12 }}>
          <Txt variant="label">Твои интересы</Txt>
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            {categories
              .filter((c): c is Category => c !== 'Все')
              .map((c) => (
                <Chip
                  key={c}
                  title={c}
                  selected={profile.interests.includes(c)}
                  onPress={() =>
                    setProfile((p) => ({
                      ...p,
                      interests: p.interests.includes(c)
                        ? p.interests.filter((i) => i !== c)
                        : [...p.interests, c],
                    }))
                  }
                />
              ))}
          </Row>
        </View>
      )}
      <Button
        title="Сохранить изменения"
        loading={busy}
        icon="checkmark"
        onPress={async () => {
          if (await run(() => campusRepository.updateProfile(profile), 'Профиль обновлён')) back();
        }}
      />
    </Screen>
  );
}
