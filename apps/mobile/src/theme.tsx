import React, { createContext, useContext, useState } from 'react';
import type { ViewStyle } from 'react-native';
import type { ThemeId } from './domain/models';

export type Palette = {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  ink: string;
  purple: string;
  orange: string;
  danger: string;
};
export const themes: Record<ThemeId, { name: string; dark: boolean; colors: Palette }> = {
  violet: {
    name: 'Ночь',
    dark: true,
    colors: {
      bg: '#111116',
      surface: '#1B1B24',
      elevated: '#272733',
      border: '#343440',
      text: '#F3F1FA',
      muted: '#ACABBB',
      accent: '#C7BCF5',
      ink: '#211C34',
      purple: '#C7BCF5',
      orange: '#EBC59B',
      danger: '#FFB4AB',
    },
  },
  forest: {
    name: 'Хвоя',
    dark: true,
    colors: {
      bg: '#101613',
      surface: '#1B2420',
      elevated: '#27332D',
      border: '#35443B',
      text: '#F0F5EE',
      muted: '#A5B6AA',
      accent: '#B9D9AC',
      ink: '#17251B',
      purple: '#C5C0E2',
      orange: '#EBC59B',
      danger: '#FFB4AB',
    },
  },
  light: {
    name: 'Светлая',
    dark: false,
    colors: {
      bg: '#F5F4F8',
      surface: '#FFFFFF',
      elevated: '#ECEAF2',
      border: '#DAD7E3',
      text: '#252231',
      muted: '#696376',
      accent: '#62508D',
      ink: '#FFFFFF',
      purple: '#62508D',
      orange: '#875728',
      danger: '#B42332',
    },
  },
};
type ThemeValue = {
  id: ThemeId;
  colors: Palette;
  dark: boolean;
  panel: ViewStyle;
  setTheme: (id: ThemeId) => void;
};
const ThemeContext = createContext<ThemeValue | null>(null);
export function ThemeProvider({ children }: React.PropsWithChildren) {
  const [id, setTheme] = useState<ThemeId>('violet');
  const { colors, dark } = themes[id];
  const panel: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  };
  return (
    <ThemeContext.Provider value={{ id, colors, dark, panel, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider is required');
  return value;
}
