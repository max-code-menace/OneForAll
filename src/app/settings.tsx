import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resetTours, useTour, type TourStep } from '../components/Tour';
import { BackButton, Card, LinkRow, SectionTitle, Separator, SwitchRow } from '../components/ui';
import { isNotificationsEnabled, setNotificationsEnabled } from '../lib/backgroundCheck';
import { useIntro } from '../lib/intro';
import { useRules, type RulesStatus } from '../lib/rules';
import { useSettings } from '../lib/settings';
import { IS_TEST_APP } from '../lib/testUpdates';
import { isBadgeEnabled, setBadgeEnabled } from '../lib/unread';
import { EASE, useReduceMotion, useTheme, type Theme } from '../lib/theme';

const TOUR: TourStep[] = [
  {
    target: 'switch-first',
    title: 'Un interrupteur par règle',
    text: 'Vert : la règle est active. Touche-le pour la couper, par exemple pour voir les Reels de tes amis.',
    fx: 0.5,
    fy: 0.5,
    r: 20,
  },
];

/** Réglages : un interrupteur par règle, groupés par plateforme. */
export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { isEnabled, setEnabled, resetAll, diagnostic, setDiagnostic, preload, setPreload } = useSettings();
  const { platforms, autoUpdate, setAutoUpdate, status, refresh } = useRules();
  const { showOnboarding } = useIntro();
  const [notifications, setNotifications] = useState(false);
  const [badge, setBadge] = useState(false);
  // Petit tuto la 1re fois (après l'arrivée de l'écran).
  const tour = useTour('settings', TOUR, true, 600);
  useEffect(() => {
    isNotificationsEnabled().then(setNotifications);
    isBadgeEnabled().then(setBadge);
  }, []);

  function toggleBadge(value: boolean) {
    setBadge(value);
    setBadgeEnabled(value);
  }

  async function toggleNotifications(value: boolean) {
    setNotifications(value);
    const result = await setNotificationsEnabled(value).catch(() => 'background-off' as const);
    if (!value || result === 'ok') return;
    setNotifications(false);
    Alert.alert(
      result === 'denied' ? 'Notifications refusées' : 'Actualisation en arrière-plan coupée',
      result === 'denied'
        ? 'Pour les recevoir, autorise les notifications de OneForAll dans les Réglages de l’iPhone.'
        : 'iOS ne laisse pas OneForAll vérifier en arrière-plan. Dans les Réglages de l’iPhone, active « Actualisation en arrière-plan » (Général, puis pour OneForAll), et coupe le mode Économie d’énergie.',
      [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Ouvrir les Réglages', onPress: () => Linking.openSettings() },
      ],
    );
  }

  async function replayOnboarding() {
    // La présentation, puis le petit tuto de chaque écran, comme au premier lancement.
    await resetTours();
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
            <SectionTitle platformId={p.id}>{p.name}</SectionTitle>
            <Card>
              {p.rules.map((rule, i) => (
                <SwitchRow
                  key={rule.id}
                  label={rule.label}
                  description={rule.description}
                  value={isEnabled(rule.id)}
                  onValueChange={(v) => setEnabled(rule.id, v)}
                  border={i > 0}
                  switchRef={p === platforms[0] && i === 0 ? tour.target('switch-first') : undefined}
                />
              ))}
            </Card>
          </View>
        ))}

        <View style={styles.section}>
          <SectionTitle>Rapidité</SectionTitle>
          <Card>
            <SwitchRow
              label="Préparer le dernier réseau au lancement"
              description="Quand tu ouvres OneForAll, le dernier réseau que tu as utilisé se charge en arrière-plan : il s'affiche ensuite presque tout de suite. Ça utilise un peu de données et de mémoire même si tu ne l'ouvres pas, et le réseau peut t'afficher « en ligne » à tes amis."
              value={preload}
              onValueChange={setPreload}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Messages Instagram</SectionTitle>
          <Card>
            <SwitchRow
              label="Pastille des messages non lus"
              description="Sur l'accueil, ton téléphone demande lui-même à Instagram combien de conversations sont non lues, et l'affiche sur la carte. Instagram voit donc quand tu ouvres l'accueil. Rien ne passe par un serveur à nous."
              value={badge}
              onValueChange={toggleBadge}
            />
            <Separator />
            <SwitchRow
              label="Notifications (avec du retard)"
              description="De temps en temps, ton téléphone demande lui-même à Instagram si une conversation de plus est non lue, et te prévient. C'est iOS qui décide quand : parfois après 20 minutes, parfois après plusieurs heures, et jamais si tu fermes l'app en la balayant vers le haut. Ces demandes automatiques utilisent une adresse non officielle d'Instagram, qui pourrait y voir un robot et te demander une vérification. Rien ne passe par un serveur à nous."
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
              description="Quand Instagram, YouTube ou Facebook changent, les règles corrigées sont téléchargées depuis GitHub (fichiers publics, aucune donnée envoyée). Désactivé : l'app n'utilise que ses règles intégrées et ne contacte plus GitHub."
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
              description="Affiche en haut du site le chemin de la page (sans les paramètres), par exemple /reel/…. Utile pour signaler une règle qui ne marche pas. Le bouton « Relevé » prépare un résumé de la forme de la page (tailles et positions, sans texte, sans nom de compte ni lien) que tu peux choisir d'envoyer. Rien n'est envoyé sans toi."
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
      {tour.element}
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
      return IS_TEST_APP ? 'App de test : règles de cette version de test (pas celles de GitHub).' : "Règles intégrées à l'app.";
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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  status: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  check: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  reset: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  note: { fontSize: 13, textAlign: 'center' },
});
