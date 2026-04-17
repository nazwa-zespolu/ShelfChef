import React, {useMemo, useState} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';

const visionCamera = (() => {
  try {
    // Runtime require keeps Jest/tests working even when native module is missing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-vision-camera');
  } catch {
    return null;
  }
})();

function CameraUnavailable() {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Test skanera kodow kreskowych</Text>
      <Text style={styles.info}>
        Brakuje biblioteki `react-native-vision-camera`.
      </Text>
      <Text style={styles.info}>
        Zainstaluj ja, a ten widok automatycznie uruchomi podglad kamery.
      </Text>
    </View>
  );
}

export default function BarcodeCameraTestView() {
  if (!visionCamera) {
    return <CameraUnavailable />;
  }

  const Camera = visionCamera.Camera as React.ComponentType<any>;
  const useCameraPermission = visionCamera.useCameraPermission as () => {
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
  };
  const useCameraDevice = visionCamera.useCameraDevice as (
    cameraPosition: 'front' | 'back',
  ) => any;
  const useCodeScanner = visionCamera.useCodeScanner as ((args: {
    codeTypes: string[];
    onCodeScanned: (codes: Array<{value?: string}>) => void;
  }) => any) | null;

  if (!useCodeScanner || !useCameraPermission || !useCameraDevice) {
    return <CameraUnavailable />;
  }

  const [lastCode, setLastCode] = useState<string>('Brak odczytu');
  const {hasPermission, requestPermission} = useCameraPermission();
  const device = useCameraDevice('back');

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128'],
    onCodeScanned: codes => {
      const firstCode = codes[0]?.value?.trim();
      if (firstCode) {
        setLastCode(firstCode);
      }
    },
  });

  const permissionStatus = useMemo(() => {
    if (!hasPermission) {
      return 'Brak uprawnienia do kamery';
    }
    return 'Uprawnienie nadane';
  }, [hasPermission]);

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Test skanera kodow kreskowych</Text>
        <Text style={styles.info}>{permissionStatus}</Text>
        <Button title="Nadaj uprawnienie do kamery" onPress={requestPermission} />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Test skanera kodow kreskowych</Text>
        <Text style={styles.info}>Brak dostepnej kamery na tym urzadzeniu.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          codeScanner={codeScanner}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.title}>Test skanera kodow kreskowych</Text>
        <Text style={styles.info}>Status: {permissionStatus}</Text>
        <Text style={styles.code}>Ostatni odczyt: {lastCode}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 10,
  },
  preview: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  panel: {
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  info: {
    color: '#ddd',
    textAlign: 'center',
  },
  code: {
    color: '#7cff9b',
    fontWeight: '600',
  },
});
