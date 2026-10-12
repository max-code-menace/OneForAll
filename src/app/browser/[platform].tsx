import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SiteWebView } from '../../components/SiteWebView';
import { useRules } from '../../lib/rules';
import { useSettings } from '../../lib/settings';

/** Écran qui affiche un réseau social. */
export default function BrowserScreen() {
  const { platform: platformId } = useLocalSearchParams<{ platform: string }>();
  const { platforms, ready } = useRules();
  const platform = platforms.find((p) => p.id === platformId);
  const { loaded } = useSettings();
  const [canGoBack, setCanGoBack] = useState(false);
  const controls = useRef<{ goBack: () => void; reload: () => void } | null>(null);

  if (!platform) {
    return (
      <View style={styles.center}>
        <Text>Plateforme inconnue : {platformId}</Text>
      </View>
    );
  }

  // On attend les réglages pour ne pas charger la page sans les bonnes règles.
  if (!loaded || !ready) return <Stack.Screen options={{ title: platform.name }} />;

  return (
    <>
      <Stack.Screen
        options={{
          title: platform.name,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable disabled={!canGoBack} onPress={() => controls.current?.goBack()} hitSlop={8}>
                <Text style={[styles.headerButton, !canGoBack && styles.disabled]}>‹</Text>
              </Pressable>
              <Pressable onPress={() => controls.current?.reload()} hitSlop={8}>
                <Text style={styles.headerButton}>↻</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <SiteWebView platform={platform} onCanGoBackChange={setCanGoBack} controlsRef={controls} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerButtons: { flexDirection: 'row', gap: 20, paddingHorizontal: 8 },
  headerButton: { fontSize: 24, color: '#007AFF' },
  disabled: { color: '#bbb' },
});
