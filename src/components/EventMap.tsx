import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { mapDocument, MapProps, parseMapPoint } from './mapDocument';
export function EventMap({ point, editable = false, onChange }: MapProps) {
  const [initial] = useState(point);
  const html = useMemo(() => mapDocument(initial, editable), [initial, editable]);
  return (
    <View
      style={{
        ...(editable ? { flex: 1 } : { height: 280 }),
        overflow: 'hidden',
        borderRadius: 16,
      }}
    >
      <WebView
        source={{ html, baseUrl: 'https://localhost' }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        onMessage={(event) => {
          const value = parseMapPoint(event.nativeEvent.data);
          if (editable && value) onChange?.(value);
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url.startsWith('https://localhost'))
            return true;
          if (/^https:\/\/(?:[a-z0-9-]+\.)*yandex\.(?:ru|com)\//i.test(request.url)) {
            void Linking.openURL(request.url).catch(() => undefined);
          }
          return false;
        }}
      />
    </View>
  );
}
