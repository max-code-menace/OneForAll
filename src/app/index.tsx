import { Link, router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRules } from '../lib/rules';

/** Écran d'accueil : un gros bouton par réseau social. */
export default function HomeScreen() {
  const { platforms } = useRules();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" style={styles.settingsLink}>
              Réglages
            </Link>
          ),
        }}
      />

      <Text style={styles.subtitle}>Les réseaux sociaux, sans le défilement infini.</Text>

      {platforms.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: p.color, opacity: pressed ? 0.8 : 1 }]}
          onPress={() => router.push({ pathname: '/browser/[platform]', params: { platform: p.id } })}
        >
          <Text style={styles.buttonText}>{p.name}</Text>
        </Pressable>
      ))}

      <Text style={styles.footer}>
        Reels, Shorts et Explore sont masqués. DMs, profils, recherche et publication restent
        disponibles. Les liens TikTok sont bloqués.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center', backgroundColor: '#fafafa' },
  subtitle: { fontSize: 16, color: '#555', textAlign: 'center', marginBottom: 8 },
  button: {
    height: 88,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  footer: { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 8 },
  settingsLink: { color: '#007AFF', fontSize: 17, paddingHorizontal: 8 },
});
