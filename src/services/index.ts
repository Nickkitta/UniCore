import { createMockRepository } from './mockRepository';
import { supabase } from './supabaseClient';
import { createSupabaseRepository } from './supabaseRepository';

export const isMockMode = process.env.EXPO_PUBLIC_DATA_MODE === 'mock';
// Missing configuration never silently signs users into fake data
export const campusRepository = isMockMode
  ? createMockRepository()
  : createSupabaseRepository(supabase);
