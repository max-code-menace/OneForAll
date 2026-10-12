import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { Intro } from '../components/Intro';
// Définit la tâche de fond (iOS peut réveiller l'app juste pour elle).
import { useOpenFromNotification } from '../lib/backgroundCheck';
import { IntroProvider } from '../lib/intro';
import { RulesProvider } from '../lib/rules';
import { SettingsProvider } from '../lib/settings';
import { useTheme } from '../lib/theme';

/**
 * Navigation principale : une pile d'écrans (Accueil → Site / TikTok bloqué / Réglages → À propos).
 * Chaque écran dessine son propre en-tête (design OneForAll) ; la poussée reste celle d'iOS.
 * Par-dessus : l'animation de lancement et la présentation.
 */
export default function RootLayout() {
  return (
    <RulesProvider>
      <SettingsProvider>
        <IntroProvider>
          <Navigation />
        </IntroProvider>
      </SettingsProvider>
    </RulesProvider>
  );
}

function Navigation() {
  const t = useTheme();
  useOpenFromNotification();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="about" />
        <Stack.Screen name="blocked" />
        {/* Glisser depuis le bord gauche ramène à l'accueil (aussi depuis un site). */}
        <Stack.Screen name="browser/[platform]" />
      </Stack>
      <Intro />
    </View>
  );
}
