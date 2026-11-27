import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Snapshot } from '@unicore/shared';
import { campusRepository, isMockMode } from '../services';
import { supabase } from '../services/supabaseClient';
import { checkConnection } from '../services/connection';
import { useTheme, Palette } from '../theme';

type Context = {
  state: Snapshot;
  busy: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  run: (action: () => Promise<Snapshot>, message?: string) => Promise<boolean>;
  notify: (message: string) => void;
};
const CampusContext = createContext<Context | null>(null);
export function CampusProvider({ children }: React.PropsWithChildren) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [state, setState] = useState<Snapshot | null>(null);
  const [failure, setFailure] = useState('');
  const [connection, setConnection] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const request = useRef(0);
  const hasState = useRef(false);
  const alive = useRef(true);
  const reload = useCallback(async (silent = false) => {
    if (lock.current) return;
    const id = ++request.current;
    if (!silent) {
      setFailure('');
      setRefreshing(true);
    }
    try {
      const next = await campusRepository.load();
      if (alive.current && id === request.current) {
        hasState.current = true;
        setFailure('');
        setState(next);
      }
    } catch (error) {
      if (alive.current && id === request.current) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить данные';
        if (!hasState.current) setFailure(message);
        else if (!silent) setNotice(message);
      }
    } finally {
      if (alive.current && id === request.current) setRefreshing(false);
    }
  }, []);
  const refresh = useCallback(() => reload(false), [reload]);
  useEffect(() => {
    request.current++;
    alive.current = true;
    const initialLoad = setTimeout(() => void reload(), 0);
    const unsubscribe = campusRepository.subscribe?.(() => void reload(true));
    let foreground = AppState.currentState !== 'background';
    if (!isMockMode && foreground) supabase?.auth.startAutoRefresh();
    const appState = AppState.addEventListener('change', (next) => {
      foreground = next === 'active';
      if (!isMockMode) {
        if (foreground) {
          supabase?.auth.startAutoRefresh();
          void reload(true);
        } else supabase?.auth.stopAutoRefresh();
      }
    });
    const timer = !isMockMode
      ? setInterval(() => {
          if (foreground) void reload(true);
        }, 15000)
      : undefined;
    return () => {
      alive.current = false;
      clearTimeout(initialLoad);
      unsubscribe?.();
      appState.remove();
      clearInterval(timer);
      if (!isMockMode) supabase?.auth.stopAutoRefresh();
    };
  }, [reload]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const run = useCallback(async (action: () => Promise<Snapshot>, message?: string) => {
    if (lock.current) return false;
    lock.current = true;
    const id = ++request.current;
    setRefreshing(false);
    setBusy(true);
    try {
      const next = await action();
      if (!alive.current || id !== request.current) return false;
      hasState.current = true;
      setState(next);
      if (message) setNotice(message);
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Не удалось сохранить изменения. Попробуй ещё раз',
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  if (!state)
    return (
      <View style={styles.loading}>
        {failure ? (
          <>
            <Text style={styles.text}>{failure}</Text>
            {!isMockMode && (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={connection === 'Проверяем…'}
                  onPress={async () => {
                    setConnection('Проверяем…');
                    setConnection(await checkConnection());
                  }}
                >
                  <Text style={styles.text}>Проверить связь с сервером</Text>
                </Pressable>
                {!!connection && <Text style={styles.text}>{connection}</Text>}
              </>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              style={styles.retry}
            >
              <Text>Повторить</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void run(() => campusRepository.signOut())}
            >
              <Text style={styles.text}>Вернуться ко входу</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.text}>Загружаем…</Text>
          </>
        )}
      </View>
    );
  return (
    <CampusContext.Provider value={{ state, busy, refreshing, refresh, run, notify: setNotice }}>
      <View style={{ flex: 1 }}>{children}</View>
      {!!notice && (
        <Pressable
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          onPress={() => setNotice('')}
          style={styles.notice}
        >
          <Text style={styles.noticeText}>{notice}</Text>
          <Text style={styles.noticeText}>×</Text>
        </Pressable>
      )}
    </CampusContext.Provider>
  );
}
export function useCampus() {
  const value = useContext(CampusContext);
  if (!value) throw new Error('CampusProvider is required');
  return value;
}
const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    loading: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: 24,
    },
    text: { color: colors.text, textAlign: 'center' },
    retry: { backgroundColor: colors.accent, padding: 18, borderRadius: 16 },
    notice: {
      position: 'absolute',
      bottom: 105,
      left: 20,
      right: 20,
      maxWidth: 560,
      alignSelf: 'center',
      backgroundColor: colors.accent,
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      gap: 16,
      zIndex: 100,
    },
    noticeText: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  });
