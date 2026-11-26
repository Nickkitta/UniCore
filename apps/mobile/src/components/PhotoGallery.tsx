import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, Txt } from './ui';

function Photo({ uri, width, index }: { uri: string; width: number; index: number }) {
  const [failed, setFailed] = useState(false);
  const { colors } = useTheme();
  return (
    <View
      style={{
        width,
        height: width * 0.72,
        backgroundColor: colors.elevated,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          accessibilityLabel={`Фото события ${index + 1}`}
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name="image-outline" color={colors.muted} size={32} />
      )}
    </View>
  );
}
export function PhotoGallery({ urls }: { urls: string[] }) {
  const [width, setWidth] = useState(300);
  const [index, setIndex] = useState(0);
  if (!urls.length) return null;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ overflow: 'hidden' }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {urls.map((uri, i) => (
          <Photo key={`${i}:${uri}`} uri={uri} width={width} index={i} />
        ))}
      </ScrollView>
      {urls.length > 1 && (
        <View
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            backgroundColor: '#17151ED9',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 20,
          }}
        >
          <Txt variant="small" color="#FFFFFF">
            {Math.min(index + 1, urls.length)} / {urls.length}
          </Txt>
        </View>
      )}
    </View>
  );
}
