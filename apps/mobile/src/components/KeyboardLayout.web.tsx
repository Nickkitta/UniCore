import React from 'react';

// Browsers manage their own input focus and viewport when showing a keyboard
export { ScrollView as ScreenScrollView } from 'react-native';
export function AppKeyboardProvider({ children }: React.PropsWithChildren) {
  return <>{children}</>;
}
