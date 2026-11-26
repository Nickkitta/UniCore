export const backendUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
export async function checkConnection() {
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!backendUrl || !key) return 'Не задан адрес сервера или публичный ключ';
  const controller = new AbortController();
  const start = Date.now();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${backendUrl.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: controller.signal,
    });
    if (!response.ok)
      return `Сервер ответил HTTP ${response.status} — проверь настройки подключения`;
    const data = await response.json();
    return data && typeof data.external === 'object'
      ? `Сервис входа доступен · ${Date.now() - start} мс`
      : 'Ответ не похож на ответ сервиса входа';
  } catch {
    return 'Сервис входа недоступен — сравни результат через Wi-Fi и мобильную сеть';
  } finally {
    clearTimeout(timer);
  }
}
