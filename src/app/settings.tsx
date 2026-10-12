import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton, Card, LinkRow, SectionTitle, Separator, SwitchRow } from '../components/ui';
import { isNotificationsEnabled, setNotificationsEnabled } from '../lib/backgroundCheck';
import { useIntro } from '../lib/intro';
import { useRules, type RulesStatus } from '../lib/rules';
import { useSettings } from '../lib/settings';
import { EASE, useReduceMotion, useTheme, type Theme } from '../lib/theme';

/** Réglages : un interrupteur par règle, groupés par plateforme. */
export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { isEnabled, setEnabled, resetAll, diagnostic, setDiagnostic } = useSettings();
  const { platforms, autoUpdate, setAutoUpdate, status, refresh } = useRules();
  const { showOnboarding } = useIntro();
  const [notifications, setNotifications] = useState(false);
  useEffect(() => {
    isNotificationsEnabled().then(setNotifications);
  }, []);

  async function toggleNotifications(value: boolean) {
    setNotifications(value);
    const ok = await setNotificationsEnabled(value).catch(() => false);
    if (value && !ok) {
      setNotifications(false);
      Alert.alert(
        'Notifications refusées',
        'Pour les recevoir, autorise les notifications de OneForAll dans les Réglages de l’iPhone.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Ouvrir les Réglages', onPress: () => Linking.openSettings() },
        ],
      );
    }
  }

  function replayOnboarding() {
    if (router.canDismiss()) router.dismissAll();
    showOnboarding();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={styles.bar}>
        <BackButton label="Accueil" />
      </View>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 48 }]}>
        <Text style={[styles.title, { color: t.ink }]}>Réglages</Text>

        {platforms.map((p) => (
          <View key={p.id} style={styles.section}>
            <SectionTitle initial={p.name[0]}>{p.name}</SectionTitle>
            <Card>
              {p.rules.map((rule, i) => (
                <SwitchRow
                  key={rule.id}
                  label={rule.label}
                  description={rule.description}
                  value={isEnabled(rule.id)}
                  onValueChange={(v) => setEnabled(rule.id, v)}
                  border={i > 0}
                />
              ))}
            </Card>
          </View>
        ))}

        <View style={styles.section}>
          <SectionTitle initial="T">TikTok</SectionTitle>
          <Card>
            <View style={styles.fixedRow}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.label, { color: t.ink }]}>TikTok est toujours bloqué</Text>
                <Text style={[styles.description, { color: t.ink2 }]}>
                  Il n’y a que des vidéos courtes sur TikTok. Ses liens ne s’ouvrent jamais, d’où qu’ils viennent. Ce
                  blocage ne se désactive pas.
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: t.surface2 }]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: t.ink2 }}>Bloqué</Text>
              </View>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Notifications</SectionTitle>
          <Card>
            <SwitchRow
              label="Nouveaux messages Instagram (avec du retard)"
              description="De temps en temps, ton téléphone demande lui-même à Instagram si tu as des messages non lus, et te prévient. C'est iOS qui décide quand : parfois après 20 minutes, parfois après plusieurs heures. Rien ne passe par un serveur."
              value={notifications}
              onValueChange={toggleNotifications}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Mise à jour des règles</SectionTitle>
          <Card>
            <SwitchRow
              label="Mettre à jour automatiquement"
              description="Quand Instagram, YouTube ou Facebook changent, les règles corrigées sont téléchargées depuis GitHub (fichiers publics, aucune donnée envoyée). Désactivé : l'app n'utilise que ses règles intégrées et ne contacte personne."
              value={autoUpdate}
              onValueChange={setAutoUpdate}
            />
            <Separator />
            <View style={styles.statusRow}>
              <StatusLine status={status} t={t} />
              {autoUpdate && (
                <Pressable
                  accessibilityRole="button"
                  disabled={status.state === 'checking'}
                  onPress={refresh}
                  style={({ pressed }) => [
                    styles.check,
                    { backgroundColor: t.primarySoft, opacity: status.state === 'checking' ? 0.5 : pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: t.onPrimarySoft }}>Vérifier maintenant</Text>
                </Pressable>
              )}
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Diagnostic</SectionTitle>
          <Card>
            <SwitchRow
              label="Afficher l'adresse de la page"
              description="Affiche en haut du site le chemin de la page (sans les paramètres), par exemple /reel/…. Utile pour signaler une règle qui ne marche pas. Rien n'est envoyé."
              value={diagnostic}
              onValueChange={setDiagnostic}
            />
          </Card>
        </View>

        <Card>
          <LinkRow label="À propos de OneForAll" onPress={() => router.push('/about')} />
          <Separator />
          <LinkRow label="Revoir la présentation" onPress={replayOnboarding} />
        </Card>

        <View style={{ alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            style={styles.reset}
            onPress={() =>
              Alert.alert('Réinitialiser ?', 'Toutes les règles reprennent leur valeur par défaut.', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Réinitialiser', style: 'destructive', onPress: resetAll },
              ])
            }
          >
            <Text style={{ fontSize: 17, color: t.danger }}>Réinitialiser les réglages</Text>
          </Pressable>
          <Text style={[styles.note, { color: t.ink3 }]}>
            Les changements s'appliquent tout de suite (la page se recharge).
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/** Pastille d'état + texte. Pendant la vérification : une petite roue. */
function StatusLine({ status, t }: { status: RulesStatus; t: Theme }) {
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const checking = status.state === 'checking';

  // Quand le résultat arrive, la pastille apparaît doucement (0.4 → 1).
  useEffect(() => {
    if (checking || reduce) return;
    pop.setValue(0.4);
    Animated.timing(pop, { toValue: 1, duration: 320, easing: EASE, useNativeDriver: true }).start();
  }, [status, checking, reduce, pop]);

  const dot =
    status.state === 'updated' ? t.primary : status.state === 'failed' ? t.accent : t.ink3;

  return (
    <View style={styles.status}>
      <View style={styles.statusIcon}>
        {checking ? (
          <ActivityIndicator size="small" color={t.primary} style={{ transform: [{ scale: 0.7 }] }} />
        ) : (
          <Animated.View style={[styles.statusDot, { backgroundColor: dot, transform: [{ scale: pop }] }]} />
        )}
      </View>
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: t.ink2 }}>{statusText(status)}</Text>
    </View>
  );
}

function statusText(status: RulesStatus): string {
  switch (status.state) {
    case 'bundled':
      return "Règles intégrées à l'app.";
    case 'checking':
      return 'Vérification en cours…';
    case 'updated':
      return `À jour — vérifié à ${formatTime(status.checkedAt)}`;
    case 'failed':
      return `Vérification impossible à ${formatTime(status.checkedAt)} (hors ligne ?). Règles précédentes conservées.`;
  }
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  bar: { height: 44, justifyContent: 'center', paddingHorizontal: 8 },
  container: { paddingTop: 4, paddingHorizontal: 20, gap: 28 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.68 },
  section: { gap: 10 },
  label: { fontSize: 17, lineHeight: 22 },
  description: { fontSize: 13, lineHeight: 18 },
  fixedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  badge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  status: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  check: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  reset: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  note: { fontSize: 13, textAlign: 'center' },
});
