import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useRules, type RulesStatus } from '../lib/rules';
import { useSettings } from '../lib/settings';

/** Réglages : un interrupteur par règle, groupés par plateforme. */
export default function SettingsScreen() {
  const { isEnabled, setEnabled, resetAll } = useSettings();
  const { platforms, autoUpdate, setAutoUpdate, status, refresh } = useRules();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {platforms.map((p) => (
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

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: '#555' }]}>Mise à jour des règles</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Mettre à jour automatiquement</Text>
              <Text style={styles.description}>
                Quand Instagram ou YouTube changent, les règles corrigées sont téléchargées depuis
                GitHub (fichiers publics, aucune donnée envoyée). Désactivé : l'app n'utilise que
                ses règles intégrées et ne contacte personne.
              </Text>
            </View>
            <Switch value={autoUpdate} onValueChange={setAutoUpdate} />
          </View>
          {autoUpdate && (
            <Pressable style={[styles.row, styles.separator]} onPress={refresh}>
              <View style={styles.rowText}>
                <Text style={styles.link}>Vérifier maintenant</Text>
                <Text style={styles.description}>{statusText(status)}</Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>

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

function statusText(status: RulesStatus): string {
  switch (status.state) {
    case 'bundled':
      return "Règles intégrées à l'app.";
    case 'checking':
      return 'Vérification en cours…';
    case 'updated':
      return `À jour — vérifié à ${formatTime(status.checkedAt)}.`;
    case 'failed':
      return `Vérification impossible à ${formatTime(status.checkedAt)} (hors ligne ?). Règles précédentes conservées.`;
  }
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  link: { fontSize: 16, color: '#007AFF' },
  description: { fontSize: 13, color: '#777' },
  reset: { alignSelf: 'center', padding: 12 },
  resetText: { color: '#FF3B30', fontSize: 16 },
  note: { fontSize: 13, color: '#888', textAlign: 'center' },
});
