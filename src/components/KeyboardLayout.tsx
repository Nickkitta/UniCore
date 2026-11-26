import React from 'react';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardProvider } from 'react-native-keyboard-controller';

export function AppKeyboardProvider({ children }: React.PropsWithChildren) {
  return (
    <KeyboardProvider
      statusBarTranslucent
      navigationBarTranslucent
      preserveEdgeToEdge
      preload={false}
    >
      {children}
    </KeyboardProvider>
  );
}

export function ScreenScrollView(props: ScrollViewProps) {
  return <KeyboardAwareScrollView {...props} bottomOffset={24} extraKeyboardSpace={16} />;
}
