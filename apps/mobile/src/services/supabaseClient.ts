import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';

import { backendUrl as url } from './connection';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// A publishable key identifies the app, user JWTs and database policies authorize access
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          storageKey: 'unicore:auth:v1',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          lock: processLock,
        },
      })
    : null;
