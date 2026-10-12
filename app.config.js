/**
 * Deux versions de l'app, à partir de app.json :
 *
 *  - la VRAIE (TestFlight, profil « production ») : aucune mise à jour à distance. Elle ne
 *    contacte jamais les serveurs d'Expo (seulement GitHub pour les règles, voir PRIVACY.md) ;
 *
 *  - « OneForAll Test » (profil « test », variable APP_VARIANT=test) : installée À CÔTÉ de la
 *    vraie (autre identifiant), seulement sur l'iPhone du développeur. Elle reçoit les
 *    modifications de code en quelques minutes, sans nouveau build (EAS Update, canal
 *    « test », envoyé par .github/workflows/test-update.yml à chaque push sur une branche
 *    claude/…). Une modification « native » (nouveau module, autorisation iOS…) change
 *    l'empreinte (runtimeVersion) : la mise à jour ne s'applique pas, il faut refaire l'app de test.
 */
module.exports = ({ config }) => {
  const test = process.env.APP_VARIANT === 'test';
  return {
    ...config,
    name: test ? 'OneForAll Test' : config.name,
    ios: {
      ...config.ios,
      bundleIdentifier: test ? 'com.maxcodemenace.oneforall.test' : config.ios.bundleIdentifier,
    },
    // Empreinte du code natif : une mise à jour ne s'installe que sur une app au code natif identique.
    runtimeVersion: { policy: 'fingerprint' },
    updates: test
      ? {
          enabled: true,
          url: `https://u.expo.dev/${config.extra.eas.projectId}`,
          checkAutomatically: 'ON_LOAD',
          // Au lancement, on n'attend pas le réseau : l'app vérifie elle-même (src/lib/testUpdates.ts).
          fallbackToCacheTimeout: 0,
        }
      : { enabled: false },
    extra: { ...config.extra, variant: test ? 'test' : 'production' },
  };
};
