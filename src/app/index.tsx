import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mark } from '../components/Mark';
import { Initial, PressScale, Wordmark } from '../components/ui';
import { useRules } from '../lib/rules';
import { SITE_TEXT } from '../lib/sites';
import { cardShadow, useTheme } from '../lib/theme';
import { fetchInstagramUnread, readUnread, saveUnread } from '../lib/unread';
import { formatDuration, readUsage } from '../lib/usage';

/** Écran d'accueil : une carte par réseau social, et TikTok (bloqué). */
export default function HomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { platforms } = useRules();
  /** Temps passé aujourd'hui sur chaque réseau (compté sur le téléphone, rien n'est envoyé). */
  const [usage, setUsage] = useState<Record<string, number>>({});
  /** Messages non lus par réseau (pastille). */
  const [unread, setUnread] = useState<Record<string, number>>({});
  useFocusEffect(
    useCallback(() => {
      readUsage().then(setUsage);
      readUnread().then(setUnread);
      // Instagram : on redemande directement, depuis le téléphone, avec ta connexion.
      fetchInstagramUnread().then((n) => {
        if (n !== null) saveUnread('instagram', n).then(setUnread);
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
          <PressScale
            key={p.id}
            accessibilityLabel={`Ouvrir ${p.name}`}
            onPress={() => router.push({ pathname: '/browser/[platform]', params: { platform: p.id } })}
            style={[styles.card, { backgroundColor: t.surface }, cardShadow(t)]}
            pressedStyle={{ backgroundColor: t.surface2, shadowOpacity: 0 }}
          >
            <Initial letter={p.name[0]} size={52} radius={16} />
            <View style={styles.cardText}>
              <Text style={[styles.cardName, { color: t.ink }]}>{p.name}</Text>
              <Text style={{ fontSize: 15, color: t.ink2 }}>{SITE_TEXT[p.id]?.sub ?? ''}</Text>
              {(usage[p.id] ?? 0) >= 60 && (
                <Text style={{ fontSize: 13, color: t.ink3 }}>Aujourd’hui : {formatDuration(usage[p.id])}</Text>
              )}
            </View>
            {(unread[p.id] ?? 0) > 0 && (
              <View
                style={[styles.unread, { backgroundColor: t.accent }]}
                accessibilityLabel={`${unread[p.id]} non lus`}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.dark ? t.bg : '#FFFFFF' }}>
                  {unread[p.id] > 99 ? '99+' : unread[p.id]}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 24, color: t.ink3 }}>›</Text>
          </PressScale>
        ))}

        <PressScale
          accessibilityLabel="TikTok, bloqué"
          onPress={() => router.push('/blocked')}
          style={[styles.card, styles.blockedCard, { borderColor: t.sep2 }]}
          pressedStyle={{ backgroundColor: t.surface2 }}
        >
          <Initial letter="T" size={52} radius={16} muted />
          <View style={styles.cardText}>
            <Text style={[styles.cardName, { color: t.ink2 }]}>TikTok</Text>
            <Text style={{ fontSize: 15, color: t.ink2 }}>Uniquement des vidéos courtes</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: t.surface2 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.ink2 }}>Bloqué</Text>
          </View>
        </PressScale>
      </View>

      <View style={{ flex: 1, minHeight: 16 }} />
      <Text style={[styles.footer, { color: t.ink3 }]}>
        Reels, Shorts, vidéos courtes et Explore sont masqués. DMs, profils, recherche et publication restent
        disponibles.
      </Text>
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
  blockedCard: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  cardText: { flex: 1, gap: 3 },
  cardName: { fontSize: 20, fontWeight: '600', letterSpacing: -0.2 },
  badge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  unread: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  footer: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 12 },
});
