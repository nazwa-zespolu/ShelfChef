import {useEffect, useState} from 'react';
import {Keyboard} from 'react-native';

export function useKeyboardVisible(resetWhen: boolean) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (resetWhen) {
      setKeyboardVisible(false);
    }
  }, [resetWhen]);

  return keyboardVisible;
}
