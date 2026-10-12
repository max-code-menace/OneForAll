import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mark } from '../components/Mark';
import { useTour, type TourStep } from '../components/Tour';
import { PressScale, SiteIcon, Wordmark } from '../components/ui';
import { useIntro } from '../lib/intro';
import { useRules } from '../lib/rules';
import { SITE_TEXT } from '../lib/sites';
import { cardShadow, useTheme } from '../lib/theme';
import { syncAppBadge } from '../lib/backgroundCheck';
import { fetchInstagramUnread, isBadgeEnabled, readUnread, saveUnread } from '../lib/unread';
import { formatDuration, readUsage } from '../lib/usage';

const TOUR: TourStep[] = [
  {
    target: 'card-instagram',
    title: 'Ouvre un réseau',
    text: 'Touche une carte : le site s’ouvre sans Reels, Shorts ni Explore. Tes messages et ton profil restent là.',
    fx: 0.9,
    fy: 0.5,
    r: 26,
  },
  {
    target: 'usage-instagram',
    title: 'Ton temps du jour',
    text: 'Le temps passé aujourd’hui sur chaque réseau. Il est compté sur ton téléphone, rien n’est envoyé.',
    fx: 1,
    fy: 0.5,
    dx: 16,
    r: 8,
  },
  { target: 'settings', title: 'Les réglages', text: 'Choisis ce qui est masqué, réseau par réseau.', fx: 0.5, fy: 0.5, r: 26 },
];

/** Écran d'accueil : une carte par réseau social. */
export default function HomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { platforms } = useRules();
  const { loaded, onboardingVisible, splashDone } = useIntro();
  // Petit tuto la 1re fois, une fois le lancement et la présentation terminés.
  const tour = useTour('home', TOUR, loaded && splashDone && !onboardingVisible);
  /** Temps passé aujourd'hui sur chaque réseau (compté sur le téléphone, rien n'est envoyé). */
  const [usage, setUsage] = useState<Record<string, number>>({});
  /** Messages non lus par réseau (pastille, seulement si activée dans les Réglages). */
  const [unread, setUnread] = useState<Record<string, number>>({});
  useFocusEffect(
    useCallback(() => {
      readUsage().then(setUsage);
      isBadgeEnabled().then((on) => {
        if (!on) {
          // Pastille désactivée : rien n'est affiché et Instagram n'est pas contacté.
          setUnread({});
          return;
        }
        readUnread().then(setUnread);
        // Instagram : on redemande directement, depuis le téléphone, avec ta connexion.
        fetchInstagramUnread().then((n) => {
          if (n === null) return;
          saveUnread('instagram', n).then(setUnread);
          syncAppBadge(n);
        });
      });
    }, []),
  );

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.header}>
        <View style={styles.brand}>
          <Mark size={26} />
          <Wordmark size={19} />
        </View>
        <Pressable
          ref={tour.target('settings')}
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.settings, { backgroundColor: t.surface2, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ fontSize: 15, fontWeight: '500', color: t.ink }}>Réglages</Text>
        </Pressable>
      </View>

      <Text style={[styles.title, { color: t.ink }]}>Les réseaux sociaux, sans le défilement infini.</Text>

      <View style={{ gap: 12 }}>
        {platforms.map((p) => (
          <View key={p.id} ref={tour.target(`card-${p.id}`)} collapsable={false}>
            <PressScale
              // VoiceOver lit tout ce que montre la carte (sinon seulement « Ouvrir … »).
              accessibilityLabel={[
                `Ouvrir ${p.name}`,
                SITE_TEXT[p.id]?.sub,
                (unread[p.id] ?? 0) > 0 ? `${unread[p.id]} non lus` : null,
                (usage[p.id] ?? 0) >= 60 ? `aujourd’hui : ${formatDuration(usage[p.id])}` : null,
              ]
                .filter(Boolean)
                .join(', ')}
              onPress={() => router.push({ pathname: '/browser/[platform]', params: { platform: p.id } })}
              style={[styles.card, { backgroundColor: t.surface }, cardShadow(t)]}
              pressedStyle={{ backgroundColor: t.surface2, shadowOpacity: 0 }}
            >
              <SiteIcon platformId={p.id} name={p.name} size={52} radius={16} />
              <View style={styles.cardText}>
                <Text style={[styles.cardName, { color: t.ink }]}>{p.name}</Text>
                <Text style={{ fontSize: 15, color: t.ink2 }}>{SITE_TEXT[p.id]?.sub ?? ''}</Text>
                {(usage[p.id] ?? 0) >= 60 && (
                  <View style={{ alignSelf: 'flex-start' }} ref={tour.target(`usage-${p.id}`)} collapsable={false}>
                    <Text style={{ fontSize: 13, color: t.ink3 }}>Aujourd’hui : {formatDuration(usage[p.id])}</Text>
                  </View>
                )}
              </View>
              {(unread[p.id] ?? 0) > 0 && (
                <View style={[styles.unread, { backgroundColor: t.accent }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: t.dark ? t.bg : '#FFFFFF' }}>
                    {unread[p.id] > 99 ? '99+' : unread[p.id]}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 24, color: t.ink3 }}>›</Text>
            </PressScale>
          </View>
        ))}
      </View>

      <View style={{ flex: 1, minHeight: 16 }} />
      <Text style={[styles.footer, { color: t.ink3 }]}>
        Reels, Shorts, vidéos courtes et Explore sont masqués. DMs, profils, recherche et publication restent
        disponibles.
      </Text>
      {tour.element}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 20, gap: 24 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settings: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6, paddingTop: 4 },
  card: {
    minHeight: 84,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardText: { flex: 1, gap: 3 },
  cardName: { fontSize: 20, fontWeight: '600', letterSpacing: -0.2 },
  unread: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  footer: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 12 },
});
