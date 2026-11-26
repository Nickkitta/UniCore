import { useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { readLoginHint, storeLoginHint } from '../services/rememberedLogin';
import { Button, Chip, Field, Row, Screen, Txt } from '../components/ui';
import { Logo } from '../components/Logo';
import { useCampus } from '../state/CampusProvider';
import { campusRepository, isMockMode } from '../services';
import { useTheme } from '../theme';
import { checkConnection } from '../services/connection';

export default function SignIn() {
  const { colors, panel } = useTheme();
  const { run, busy, notify } = useCampus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [register, setRegister] = useState(false);
  const [partner, setPartner] = useState(false);
  const [remember, setRemember] = useState(false);
  const touched = useRef(false);
  useEffect(() => {
    if (isMockMode) return;
    let active = true;
    void readLoginHint()
      .then((hint) => {
        if (active && !touched.current && hint) {
          setEmail(hint.email);
          setPartner(hint.portal === 'partner');
          setRemember(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const [company, setCompany] = useState('');
  const [code, setCode] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('');
  async function signIn() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Введи почту в формате name@example.com');
      return;
    }
    if (!isMockMode && !password) {
      setError('Введи пароль');
      return;
    }
    if (!isMockMode && register && password.length < 8) {
      setError('Пароль должен содержать хотя бы 8 символов');
      return;
    }
    if (!isMockMode && register && !name.trim()) {
      setError('Введи имя');
      return;
    }
    setError('');
    if (partner && register && (!company.trim() || !/^[a-f0-9]{32}$/i.test(code.trim()))) {
      setError('Укажи компанию и промокод из приглашения');
      return;
    }
    await run(async () => {
      try {
        const next =
          register && !isMockMode
            ? await campusRepository.signUp(
                email,
                password,
                name,
                partner ? { company, code } : undefined,
              )
            : await campusRepository.signIn(email, password, partner ? 'partner' : 'student');
        if (!next.session && register) {
          setConfirmationEmail(email.trim());
          setPassword('');
        }
        if (next.session && !isMockMode && remember) {
          await storeLoginHint({
            email: next.profile.email || email,
            portal: partner ? 'partner' : 'student',
          }).catch(() => notify('Не удалось запомнить почту на этом устройстве'));
        }
        return next;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Не удалось войти — попробуй ещё раз');
        throw error;
      }
    });
  }
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 9 }}>
          <Logo />
          <Txt variant="heading">UniCore</Txt>
        </Row>
        <Chip title="ВОЛГУ" />
      </Row>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <Logo size={180} full />
      </View>
      <View style={{ gap: 8 }}>
        <Txt variant="title">{partner ? 'Кабинет партнёра' : 'Твои люди рядом'}</Txt>
        <Txt color={colors.muted}>
          {partner ? 'События от имени компании' : 'События и встречи студентов ВолГУ'}
        </Txt>
        {!isMockMode && !confirmationEmail && (
          <Row>
            {['Студент', 'Партнёр'].map((label, index) => (
              <Chip
                key={label}
                title={label}
                selected={partner === Boolean(index)}
                onPress={() => {
                  touched.current = true;
                  if (partner !== Boolean(index)) setPassword('');
                  setPartner(Boolean(index));
                  setError('');
                  setRegister(false);
                  setCode('');
                }}
              />
            ))}
          </Row>
        )}
      </View>
      <View style={{ gap: 14 }}>
        {!!confirmationEmail && (
          <View style={panel}>
            <Txt variant="heading">Подтверди почту</Txt>
            <Txt>
              Проверь письмо на {confirmationEmail} и перейди по ссылке, затем вернись сюда и войди
            </Txt>
            <Button
              title="Перейти ко входу"
              onPress={() => {
                setRegister(false);
                setConfirmationEmail('');
                setError('');
              }}
            />
            <Button
              title="Отправить письмо ещё раз"
              secondary
              loading={resending}
              disabled={busy}
              onPress={async () => {
                setError('');
                setResending(true);
                try {
                  await campusRepository.resendConfirmation(confirmationEmail);
                  notify('Запрос отправлен — проверь почту');
                } catch (error) {
                  setError(error instanceof Error ? error.message : 'Не удалось отправить письмо');
                } finally {
                  setResending(false);
                }
              }}
            />
            {!!error && <Txt accessibilityRole="alert">{error}</Txt>}
          </View>
        )}
        {!confirmationEmail && (
          <>
            {!isMockMode && register && (
              <Field
                label="Имя"
                value={name}
                onChangeText={setName}
                maxLength={40}
                autoComplete="name"
              />
            )}
            {partner && register && (
              <>
                <Field label="Компания" value={company} onChangeText={setCompany} maxLength={80} />
                <Field
                  label="Промокод партнёра"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={code}
                  onChangeText={setCode}
                />
              </>
            )}
            <Field
              label="Почта"
              placeholder="name@example.com"
              value={email}
              onChangeText={(value) => {
                touched.current = true;
                setEmail(value);
              }}
              autoComplete="username"
              importantForAutofill="yes"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={isMockMode ? error : undefined}
              onSubmitEditing={() => void signIn()}
            />
            {!isMockMode && (
              <Field
                label="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                importantForAutofill="yes"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'Не менее 8 символов' : 'Твой пароль'}
                onSubmitEditing={() => void signIn()}
                error={error}
              />
            )}
            {!isMockMode && (
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt>Запомнить почту на устройстве</Txt>
                <Switch
                  accessibilityLabel="Запомнить почту на устройстве"
                  value={remember}
                  disabled={busy}
                  onValueChange={async (value) => {
                    touched.current = true;
                    setRemember(value);
                    if (!value)
                      try {
                        await storeLoginHint(null);
                      } catch {
                        setRemember(true);
                        notify('Не удалось удалить сохранённую почту');
                      }
                  }}
                />
              </Row>
            )}
            <Button
              title={
                isMockMode ? 'Войти по почте · демо' : register ? 'Зарегистрироваться' : 'Войти'
              }
              onPress={() => void signIn()}
              loading={busy}
              icon="arrow-forward"
            />
            {isMockMode ? (
              <Button
                title="Попробовать без заполнения"
                secondary
                onPress={() => void run(() => campusRepository.signIn('student@example.com'))}
                disabled={busy}
              />
            ) : (
              <Button
                title={register ? 'Уже есть аккаунт — войти' : 'Создать аккаунт'}
                secondary
                disabled={busy}
                onPress={() => {
                  touched.current = true;
                  setRegister(!register);
                  setError('');
                }}
              />
            )}
          </>
        )}
      </View>
      {!isMockMode && (
        <>
          <Button
            title="Проверить связь с сервером"
            secondary
            disabled={connection === 'Проверяем…'}
            onPress={async () => {
              setConnection('Проверяем…');
              setConnection(await checkConnection());
            }}
          />
          {!!connection && <Txt variant="small">{connection}</Txt>}
        </>
      )}
      {isMockMode && (
        <Row style={{ alignItems: 'flex-start', gap: 9 }}>
          <Txt variant="small" color={colors.muted} style={{ flex: 1 }}>
            Это прототип: вход без пароля и проверки почты. Письма не отправляются, все события
            вымышленные. Данные сохраняются только на этом устройстве
          </Txt>
        </Row>
      )}
    </Screen>
  );
}
