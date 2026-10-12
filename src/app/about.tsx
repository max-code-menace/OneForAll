import Constants from 'expo-constants';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mark } from '../components/Mark';
import { BackButton, Card, LinkRow, Separator, Wordmark } from '../components/ui';
import { LIGHT, REPO_URL, useTheme } from '../lib/theme';

/** À propos : les engagements du projet et les liens publics (ouverts dans Safari). */
export default function AboutScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '';
  const open = (path: string) => Linking.openURL(`${REPO_URL}${path}`).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={styles.bar}>
        <BackButton label="Réglages" />
      </View>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 48 }]}>
        <View style={styles.hero}>
          {/* L'icône de l'app : toujours sur fond clair, comme sur l'écran d'accueil de l'iPhone. */}
          <View style={[styles.icon, { borderColor: t.sep }]}>
            <Mark size={56} dotColor={LIGHT.primary} centerColor={LIGHT.accent} />
          </View>
          <Wordmark size={24} />
          <Text style={[styles.tagline, { color: t.ink2 }]}>
            Un outil gratuit, que chacun peut vérifier, utiliser et améliorer.
          </Text>
          {version ? <Text style={{ fontSize: 13, color: t.ink3 }}>Version {version}</Text> : null}
        </View>

        <Card>
          {[
            ['Gratuit', "Pas de pub, pas d'abonnement, pas de fonctions payantes."],
            ['Aucune collecte de données', 'Pas de compte, pas de serveur, pas de statistiques.'],
            ['Open source', 'Tout le code est public, sous licence MPL-2.0. Tu peux le lire, le modifier, le partager.'],
          ].map(([title, text], i) => (
            <View key={title}>
              {i > 0 && <Separator />}
              <View style={styles.value}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: t.ink }}>{title}</Text>
                <Text style={{ fontSize: 13, lineHeight: 18, color: t.ink2 }}>{text}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <LinkRow label="Voir le code sur GitHub" external onPress={() => open('')} />
          <Separator />
          <LinkRow label="Confidentialité" external onPress={() => open('/blob/main/PRIVACY.md')} />
          <Separator />
          <LinkRow label="Licence MPL-2.0" external onPress={() => open('/blob/main/LICENSE')} />
          <Separator />
          <LinkRow label="Signaler une règle cassée" external onPress={() => open('/issues/new')} />
        </Card>

        <Text style={[styles.disclaimer, { color: t.ink3 }]}>
          OneForAll n’est pas affiliée à Instagram, Facebook (Meta), YouTube (Google) ni TikTok.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 44, justifyContent: 'center', paddingHorizontal: 8 },
  container: { paddingTop: 16, paddingHorizontal: 20, gap: 28 },
  hero: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: LIGHT.bg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  value: { paddingVertical: 13, paddingHorizontal: 16, gap: 3 },
  disclaimer: { fontSize: 12, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12 },
});
