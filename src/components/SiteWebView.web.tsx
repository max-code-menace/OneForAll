import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Platform } from '../rules';

/**
 * Version navigateur (npx expo start --web) : react-native-webview n'existe
 * pas sur le web, et Instagram/YouTube refusent d'être affichés dans une
 * iframe. On affiche donc simplement une explication.
 * Pour tester pour de vrai : Expo Go sur l'iPhone, ou le build EAS.
 */
export function SiteWebView({ platform }: { platform: Platform; [key: string]: unknown }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aperçu web</Text>
      <Text style={styles.text}>
        La WebView filtrée ({platform.name}) ne fonctionne que sur iPhone. Scanne le QR code de
        `npx expo start` avec l'iPhone (app Expo Go) pour tester.
      </Text>
      <Pressable onPress={() => Linking.openURL(platform.startUrl)}>
        <Text style={styles.link}>Ouvrir {platform.startUrl} (non filtré)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  text: { fontSize: 16, textAlign: 'center', color: '#555', maxWidth: 420 },
  link: { color: '#007AFF', fontSize: 16 },
});
