// Standard-indstillinger for en ny server. Alt kan ændres i dashboardet.
// Pladsholdere i beskeder: {user} {username} {server} {count} {level}
const DEFAULTS = {
  developer: { enabled: false, roles: [], reporterRoles: [] },
  general: {
    adminRoles: [],
    prefix: '!',
  },
  moderation: {
    enabled: true,
    modLogChannel: '',
    badWords: [],
    blockLinks: false,
    allowedDomains: ['youtube.com', 'youtu.be', 'twitch.tv'],
    antiSpam: true,
    spamMessages: 6,
    spamSeconds: 5,
    honeypotChannel: '',
    exemptRoles: [],
  },
  welcome: {
    enabled: false,
    channel: '',
    message: 'Velkommen {user} til **{server}**! Du er medlem nr. {count} 🎉',
    dmMessage: '',
    autoRoles: [],
    goodbyeChannel: '',
    goodbyeMessage: '**{username}** har forladt serveren.',
  },
  verification: {
    enabled: false,
    role: '',
    minAccountAgeDays: 0,
    panelTitle: 'Verificering',
    panelText: 'Tryk på knappen herunder for at få adgang til serveren.',
  },
  levels: {
    enabled: true,
    xpMin: 15,
    xpMax: 25,
    cooldownSeconds: 60,
    announceChannel: '',
    message: 'GG {user}, du er nu **level {level}**! 🚀',
    rewards: [],          // [{ level: 5, role: 'roleId' }]
    noXpChannels: [],
  },
  custom: {
    commands: [],         // [{ name: 'regler', response: 'Læs #regler' }]
  },
  tickets: {
    enabled: true,
    categoryId: '',
    supportRoles: [],
    logChannel: '',
    maxOpenPerUser: 1,
    panelTitle: 'Brug for hjælp?',
    panelText: 'Vælg den kategori der passer, så åbner vi en privat kanal med holdet.',
    openMessage: 'Hej {user}! Holdet svarer så hurtigt som muligt. Beskriv gerne dit problem.',
    types: [
      { id: 'support', label: 'Support', emoji: '🎫', questions: ['Hvad drejer det sig om?'] },
      { id: 'report', label: 'Rapportér en spiller', emoji: '🚨', questions: ['Hvem rapporterer du?', 'Hvad skete der?'] },
    ],
  },
  applications: {
    reviewChannel: '',
    panelTitle: 'Ansøgninger',
    panelText: 'Tryk på en knap for at ansøge.',
    forms: [
      { id: 'staff', name: 'Staff', acceptRole: '', questions: ['Hvor gammel er du?', 'Hvorfor vil du være staff?', 'Hvor mange timer om ugen er du aktiv?'] },
    ],
  },
  giveaways: {
    managerRole: '',
  },
  music: {
    enabled: true,
    djRole: '',
    defaultVolume: 60,
    maxQueue: 200,
    leaveOnEmpty: true,
    announceSongs: true,
  },
  stream: {
    channel: '',
    pingRole: '',
    twitchMessage: '🔴 **{name}** er live på Twitch!\n**{title}**\n{url}',
    youtubeMessage: '📺 **{name}** har lagt en ny video op!\n**{title}**\n{url}',
    twitch: [],           // ['brugernavn', ...]
    youtube: [],          // ['UC... kanal-id', ...]
    deleteWhenOffline: false,
  },
};

module.exports = { DEFAULTS };
