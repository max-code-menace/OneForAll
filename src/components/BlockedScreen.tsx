import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Écran affiché à la place d'une plateforme bloquée (TikTok). */
export function BlockedScreen({ name }: { name: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🚫</Text>
      <Text style={styles.title}>{name} est bloqué</Text>
      <Text style={styles.text}>
        {name} ne propose que des vidéos courtes conçues pour te faire défiler sans fin. Ton
        temps vaut mieux que ça.
      </Text>
      <Text style={styles.hint}>(Modifiable dans les Réglages si tu changes d'avis.)</Text>
      <Pressable style={styles.button} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Retour</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: '#111',
  },
  emoji: { fontSize: 64 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center', lineHeight: 22 },
  hint: { color: '#777', fontSize: 13 },
  button: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
