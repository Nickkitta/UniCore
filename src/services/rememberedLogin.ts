import AsyncStorage from '@react-native-async-storage/async-storage';

type LoginHint = { email: string; portal: 'student' | 'partner' };
const key = 'unicore:login-hint:v1';

export async function readLoginHint(): Promise<LoginHint | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const hint = JSON.parse(raw);
    if (typeof hint?.email === 'string' && ['student', 'partner'].includes(hint.portal))
      return { email: hint.email, portal: hint.portal };
  } catch {}
  return null;
}

export function storeLoginHint(hint: LoginHint | null) {
  return hint
    ? AsyncStorage.setItem(
        key,
        JSON.stringify({ email: hint.email.trim().toLowerCase(), portal: hint.portal }),
      )
    : AsyncStorage.removeItem(key);
}
