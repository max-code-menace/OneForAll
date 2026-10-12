import { Link, router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '../lib/settings';
import { PLATFORMS } from '../rules';

/** Écran d'accueil : un gros bouton par réseau social. */
export default function HomeScreen() {
  const { isEnabled } = useSettings();

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

      {PLATFORMS.map((p) => {
        const blocked = !!p.blockAllRuleId && isEnabled(p.blockAllRuleId);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: p.color, opacity: pressed ? 0.8 : blocked ? 0.45 : 1 },
            ]}
            onPress={() => router.push({ pathname: '/browser/[platform]', params: { platform: p.id } })}
          >
            <Text style={styles.buttonText}>{p.name}</Text>
            {blocked && <Text style={styles.badge}>bloqué</Text>}
          </Pressable>
        );
      })}

      <Text style={styles.footer}>
        Reels, Shorts et Explore sont masqués. DMs, profils, recherche et publication restent
        disponibles.
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
    flexDirection: 'row',
    gap: 12,
  },
  buttonText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  badge: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  footer: { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 8 },
  settingsLink: { color: '#007AFF', fontSize: 17, paddingHorizontal: 8 },
});
