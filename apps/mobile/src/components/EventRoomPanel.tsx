import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { EventRoom } from '../domain/models';
import { campusRepository } from '../services';
import { useCampus } from '../state/CampusProvider';
import { Button, Field, IconButton, Row, Txt } from './ui';

export function EventRoomPanel({ id, own }: { id: string; own: boolean }) {
  const { run, busy, notify } = useCampus();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState<EventRoom | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const request = useRef(0);
  const invalidate = useCallback(() => {
    request.current += 1;
  }, []);
  const refresh = useCallback(async () => {
    const turn = ++request.current;
    try {
      const next = await campusRepository.room(id);
      if (turn === request.current) {
        setRoom(next);
        setError('');
      }
    } catch (cause) {
      if (turn === request.current) {
        setRoom(null);
        setError(cause instanceof Error ? cause.message : 'Чат недоступен');
      }
    }
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (AppState.currentState !== 'background') void refresh();
    }, 6000);
    return () => {
      invalidate();
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [open, refresh, invalidate]);
  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await campusRepository.postMessage(id, draft.trim());
      setDraft('');
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Button
        title={open ? 'Свернуть' : own ? 'Список участников и чат' : 'Чат встречи'}
        secondary
        icon="chatbubbles-outline"
        onPress={() => setOpen((value) => !value)}
      />
      {open && (
        <>
          {!!error && (
            <>
              <Txt accessibilityRole="alert">{error}</Txt>
              <Button title="Повторить" secondary onPress={() => void refresh()} />
            </>
          )}
          {!room && !error && <Txt>Загружаем чат…</Txt>}
          {room && (
            <>
              {(own || room.isCohost) && (
                <>
                  {room.isCohost && <Txt variant="label">Ты соорганизатор этой встречи</Txt>}
                  <Txt variant="heading">Записались · {room.members.length}</Txt>
                  {!room.members.length && <Txt>Пока никто не записался</Txt>}
                  {room.members.map((member) => (
                    <View key={member.id} style={{ gap: 8 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Txt style={{ flex: 1 }}>
                          {member.name}
                          {member.isCohost ? ' · соорганизатор' : ''}
                        </Txt>
                        {(own || !member.isCohost) && (
                          <IconButton
                            name="person-remove-outline"
                            label={`Исключить: ${member.name}`}
                            onPress={() => setRemove(member.id)}
                          />
                        )}
                      </Row>
                      {own && (
                        <Button
                          compact
                          secondary
                          disabled={busy}
                          title={member.isCohost ? 'Снять роль' : 'Назначить соорганизатором'}
                          onPress={async () => {
                            if (
                              await run(
                                () => campusRepository.setCohost(id, member.id, !member.isCohost),
                                member.isCohost ? 'Роль снята' : 'Соорганизатор назначен',
                              )
                            )
                              await refresh();
                          }}
                        />
                      )}
                      {remove === member.id && (own || !member.isCohost) && (
                        <>
                          <Txt>
                            После исключения встреча и чат станут недоступны для {member.name}
                          </Txt>
                          <Button
                            title="Исключить участника"
                            disabled={busy}
                            onPress={async () => {
                              if (
                                await run(
                                  () => campusRepository.removeMember(id, member.id),
                                  'Участник исключён',
                                )
                              ) {
                                setRemove(null);
                                await refresh();
                              }
                            }}
                          />
                          <Button title="Оставить" secondary onPress={() => setRemove(null)} />
                        </>
                      )}
                    </View>
                  ))}
                </>
              )}
              <Txt variant="heading">Общий чат встречи</Txt>
              {!room.messages.length && (
                <Txt>Здесь можно уточнить детали у организатора и других участников</Txt>
              )}
              {room.messages.map((message) => (
                <View key={message.id} style={{ gap: 3 }}>
                  <Txt variant="label">
                    {message.name} ·{' '}
                    {new Date(message.sentAt).toLocaleTimeString('ru', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Txt>
                  <Txt>{message.body}</Txt>
                </View>
              ))}
              <Field
                label="Сообщение участникам"
                value={draft}
                editable={!sending}
                onChangeText={setDraft}
                multiline
                maxLength={1000}
              />
              <Button
                title="Отправить"
                loading={sending}
                disabled={!draft.trim()}
                onPress={() => void send()}
              />
            </>
          )}
        </>
      )}
    </View>
  );
}
