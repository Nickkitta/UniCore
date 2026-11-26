import { Image, View } from 'react-native';

export function Logo({ size = 44 }: { size?: number; full?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        overflow: 'hidden',
        backgroundColor: '#F5F3EF',
      }}
    >
      <Image
        source={require('../../assets/icon.png')}
        accessibilityLabel="UniCore"
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    </View>
  );
}
