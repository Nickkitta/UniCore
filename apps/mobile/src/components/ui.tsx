import React from 'react';
import { useIsFocused } from 'expo-router';
import {
  ActivityIndicator,
  ColorValue,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, Palette } from '../theme';
import { useCampus } from '../state/CampusProvider';
import { ScreenScrollView } from './KeyboardLayout';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  const { colors } = useTheme();
  color ??= colors.text;
  return (
    <Ionicons
      name={name}
      size={size}
      color={typeof color === 'number' ? colors.text : (color ?? colors.text)}
      accessible={false}
      aria-hidden
    />
  );
}
export function Txt({
  variant = 'body',
  color,
  style,
  ...props
}: TextProps & { variant?: 'body' | 'title' | 'heading' | 'label' | 'small'; color?: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Text
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      {...props}
      style={[styles.text, styles[variant], color ? { color } : undefined, style]}
    />
  );
}
export function Screen({ children, scroll = true }: React.PropsWithChildren<{ scroll?: boolean }>) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { state, refreshing, refresh } = useCampus();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={styles.safe}
      aria-hidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
    >
      {scroll ? (
        <ScreenScrollView
          style={{ flex: 1 }}
          refreshControl={
            state.session ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor={colors.accent}
              />
            ) : undefined
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScreenScrollView>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          enabled={Platform.OS !== 'web'}
          behavior="padding"
          keyboardVerticalOffset={insets.top}
        >
          <View style={[styles.content, { flex: 1, paddingBottom: 40 + insets.bottom }]}>
            {children}
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  icon,
  secondary = false,
  loading = false,
  disabled = false,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        compact && { paddingVertical: 12 },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.text : colors.ink} />
      ) : icon ? (
        <Icon name={icon} color={secondary ? colors.text : colors.ink} size={20} />
      ) : null}
      <Txt
        variant="label"
        color={secondary ? colors.text : colors.ink}
        style={{ textAlign: 'center', flexShrink: 1 }}
      >
        {title}
      </Txt>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        active && { backgroundColor: colors.accent },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name={name} color={active ? colors.ink : colors.text} size={21} />
    </Pressable>
  );
}
export function Chip({
  title,
  selected = false,
  onPress,
  color,
}: {
  title: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = (
    <Txt
      variant="small"
      color={selected ? colors.ink : color || colors.muted}
      style={{ fontWeight: '600' }}
    >
      {title}
    </Txt>
  );
  const style = [
    styles.chip,
    selected && { backgroundColor: colors.accent, borderColor: colors.accent },
  ];
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={style}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="small" color={colors.muted}>
        {label}
      </Txt>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor="#7D887B"
        selectionColor={colors.accent}
        style={[
          styles.input,
          props.multiline && { height: 112, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {!!error && (
        <Txt variant="small" color={colors.danger}>
          {error}
        </Txt>
      )}
    </View>
  );
}
export function Row({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <View style={[styles.row, style]}>{children}</View>;
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
      <Txt variant="heading" style={{ flexShrink: 1 }}>
        {title}
      </Txt>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12 }}
        >
          <Txt variant="small" color={colors.accent}>
            {action} ↗
          </Txt>
        </Pressable>
      )}
    </Row>
  );
}
export function EmptyState({
  title,
  description,
  action,
  onPress,
}: {
  title: string;
  description: string;
  action?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.empty}>
      <Icon name="planet-outline" size={42} color={colors.accent} />
      <Txt variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt color={colors.muted} style={{ textAlign: 'center' }}>
        {description}
      </Txt>
      {action && onPress && <Button title={action} onPress={onPress} secondary />}
    </View>
  );
}
export function Avatar({
  name,
  size = 42,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  color ??= colors.purple;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt color={colors.ink} style={{ fontSize: size * 0.38, fontWeight: '700' }}>
        {name.trim().slice(0, 1).toUpperCase() || 'U'}
      </Txt>
    </View>
  );
}
const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: {
      width: '100%',
      maxWidth: 680,
      alignSelf: 'center',
      padding: 22,
      paddingBottom: 40,
      gap: 22,
    },
    text: { color: colors.text, flexShrink: 1 },
    body: { fontSize: 15, lineHeight: 23 },
    title: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1.2 },
    heading: { fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.5 },
    label: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
    small: { fontSize: 12, lineHeight: 18 },
    button: {
      minHeight: 52,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    secondary: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.elevated,
    },
    chip: {
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderRadius: 30,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      minHeight: 54,
      borderRadius: 14,
      padding: 16,
      color: colors.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    empty: { paddingVertical: 36, paddingHorizontal: 16, gap: 18, alignItems: 'center' },
  });
