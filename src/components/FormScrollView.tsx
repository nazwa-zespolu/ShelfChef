import React, {useEffect, useRef} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {shadowGutters} from '../theme/shadows';

export function FormScrollView({children, visible}: {children: React.ReactNode; visible: boolean}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) {
      scroll.current?.scrollTo({y: 0, animated: false});
    }
  }, [visible]);
  return (
    <KeyboardAvoidingView
      style={styles.form}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Math.max(insets.top, 12)}>
      <ScrollView
        ref={scroll}
        style={[styles.scroll, shadowGutters.viewport]}
        contentContainerStyle={shadowGutters.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  form: {flexShrink: 1},
  scroll: {flexGrow: 0, flexShrink: 1},
});
