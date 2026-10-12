import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useSettings } from '../lib/settings';
import { PLATFORMS } from '../rules';

/** Réglages : un interrupteur par règle, groupés par plateforme. */
export default function SettingsScreen() {
  const { isEnabled, setEnabled, resetAll } = useSettings();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {PLATFORMS.map((p) => (
        <View key={p.id} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: p.color }]}>{p.name}</Text>
          <View style={styles.card}>
            {p.rules.map((rule, i) => (
              <View key={rule.id} style={[styles.row, i > 0 && styles.separator]}>
                <View style={styles.rowText}>
                  <Text style={styles.label}>{rule.label}</Text>
                  {rule.description && <Text style={styles.description}>{rule.description}</Text>}
                </View>
                <Switch value={isEnabled(rule.id)} onValueChange={(v) => setEnabled(rule.id, v)} />
              </View>
            ))}
          </View>
        </View>
      ))}

      <Pressable
        style={styles.reset}
        onPress={() =>
          Alert.alert('Réinitialiser ?', 'Toutes les règles reprennent leur valeur par défaut.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Réinitialiser', style: 'destructive', onPress: resetAll },
          ])
        }
      >
        <Text style={styles.resetText}>Réinitialiser les réglages</Text>
      </Pressable>

      <Text style={styles.note}>
        Les changements s'appliquent tout de suite (la page se recharge).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, gap: 24, backgroundColor: '#f2f2f7' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', marginLeft: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ccc' },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 16 },
  description: { fontSize: 13, color: '#777' },
  reset: { alignSelf: 'center', padding: 12 },
  resetText: { color: '#FF3B30', fontSize: 16 },
  note: { fontSize: 13, color: '#888', textAlign: 'center' },
});
