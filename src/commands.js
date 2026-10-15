// Alle slash-kommandoer samlet ét sted.
const { SlashCommandBuilder: S, PermissionFlagsBits: P, REST, Routes, InteractionContextType } = require('discord.js');

const user = (o, req = true) => o.setName('bruger').setDescription('Brugeren').setRequired(req);
const reason = (o) => o.setName('årsag').setDescription('Årsag');

const platformOption=o=>o.setName('platform').setDescription('Streamplatform').setRequired(true).addChoices(...['twitch','youtube','kick','tiktok'].map(value=>({name:value,value})));
const definitions = [
  new S().setName('fødselsdag').setDescription('Registrér din fødselsdag eller brug fødselsdagspanelet'),
  new S().setName('stream').setDescription('Tilknyt din streamkanal eller meld live/slut')
    .addSubcommand(s=>s.setName('tilmeld').setDescription('Knyt din kanal til din Discord-bruger').addStringOption(platformOption).addStringOption(o=>o.setName('kanal').setDescription('Brugernavn eller YouTube UC-kanal-ID').setRequired(true)))
    .addSubcommand(s=>s.setName('live').setDescription('Send en streambesked manuelt').addStringOption(platformOption).addStringOption(o=>o.setName('titel').setDescription('Streamens titel').setMaxLength(200)))
    .addSubcommand(s=>s.setName('slut').setDescription('Afslut din stream og anvend oprydning').addStringOption(platformOption)),
  new S().setName('fejl').setDescription('Meld en fejl til udvikleren')
    .addStringOption(o=>o.setName('titel').setDescription('Kort titel').setRequired(true).setMaxLength(200))
    .addStringOption(o=>o.setName('beskrivelse').setDescription('Beskriv fejlen og hvordan den genskabes').setRequired(true).setMaxLength(4000))
    .addAttachmentOption(o=>o.setName('billede').setDescription('Billede af fejlen (maks. 6 MB)'))
    .addStringOption(o=>o.setName('kategori').setDescription('Hvad handler sagen om?').addChoices(...require('./modules/report-categories').categories.map(c=>({name:c.label,value:c.id}))))
    .addStringOption(o=>o.setName('andet').setDescription('Egen kategori, hvis du vælger Andet').setMaxLength(100))
    .addStringOption(o=>o.setName('vigtighed').setDescription('Din vurdering af sagen').addChoices(...require('./modules/report-form').priorities.map(p=>({name:p.label,value:p.value}))))
    .addStringOption(o=>o.setName('egen_vigtighed').setDescription('Beskriv din egen vurdering').setMaxLength(100)),
  new S().setName('fejlbillede').setDescription('Vedhæft et billede til din eksisterende fejlmelding')
    .addIntegerOption(o=>o.setName('id').setDescription('Sagsnummer').setRequired(true).setMinValue(1))
    .addAttachmentOption(o=>o.setName('billede').setDescription('Billede til sagen (højst 6 MB)').setRequired(true)),
  new S().setName('fejlsvar').setDescription('Svar på din fejlmelding')
    .addIntegerOption(o=>o.setName('id').setDescription('Sagsnummer').setRequired(true).setMinValue(1))
    .addStringOption(o=>o.setName('besked').setDescription('Dit svar til udvikleren').setRequired(true).setMaxLength(1800)),
  new S().setName('fejlstatus').setDescription('Se status for din fejlmelding')
    .addIntegerOption(o=>o.setName('id').setDescription('Sagsnummer').setRequired(true).setMinValue(1)),
  // Moderation
  new S().setName('warn').setDescription('Giv en advarsel').setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption(user).addStringOption(reason),
  new S().setName('warnings').setDescription('Se advarsler').setDefaultMemberPermissions(P.ModerateMembers).addUserOption(user),
  new S().setName('kick').setDescription('Kick en bruger').setDefaultMemberPermissions(P.KickMembers).addUserOption(user).addStringOption(reason),
  new S().setName('ban').setDescription('Ban en bruger').setDefaultMemberPermissions(P.BanMembers).addUserOption(user).addStringOption(reason)
    .addIntegerOption((o) => o.setName('slet_dage').setDescription('Slet beskeder fra de sidste X dage (0-7)').setMinValue(0).setMaxValue(7)),
  new S().setName('unban').setDescription('Fjern et ban').setDefaultMemberPermissions(P.BanMembers)
    .addStringOption((o) => o.setName('bruger_id').setDescription('Bruger-ID').setRequired(true)),
  new S().setName('timeout').setDescription('Giv timeout').setDefaultMemberPermissions(P.ModerateMembers).addUserOption(user)
    .addStringOption((o) => o.setName('varighed').setDescription('F.eks. 10m, 2h, 1d').setRequired(true)).addStringOption(reason),
  new S().setName('clear').setDescription('Slet beskeder').setDefaultMemberPermissions(P.ManageMessages)
    .addIntegerOption((o) => o.setName('antal').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
  // Levels
  new S().setName('rank').setDescription('Se dit level').addUserOption((o) => user(o, false)),
  new S().setName('leaderboard').setDescription('Top 10 på serveren'),
  // Tickets
  new S().setName('ticket').setDescription('Ticket-kommandoer')
    .addSubcommand((s) => s.setName('panel').setDescription('Send ticket-panelet i denne kanal'))
    .addSubcommand((s) => s.setName('close').setDescription('Luk denne ticket').addStringOption(reason))
    .addSubcommand((s) => s.setName('add').setDescription('Tilføj bruger til ticket').addUserOption(user))
    .addSubcommand((s) => s.setName('remove').setDescription('Fjern bruger fra ticket').addUserOption(user)),
  // Ansøgninger
  new S().setName('application').setDescription('Ansøgninger').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('panel').setDescription('Send ansøgnings-panelet i denne kanal')),
  new S().setName('verify-panel').setDescription('Send verificerings-panelet i denne kanal').setDefaultMemberPermissions(P.ManageGuild),
  // Giveaways
  new S().setName('giveaway').setDescription('Giveaways')
    .addSubcommand((s) => s.setName('start').setDescription('Start en giveaway')
      .addStringOption((o) => o.setName('præmie').setDescription('Præmien').setRequired(true))
      .addStringOption((o) => o.setName('varighed').setDescription('F.eks. 30m, 2h, 1d').setRequired(true))
      .addIntegerOption((o) => o.setName('vindere').setDescription('Antal vindere').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('end').setDescription('Afslut nu').addIntegerOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Træk nye vindere').addIntegerOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true))),
  // Musik
  new S().setName('play').setDescription('Afspil en sang eller playliste').addStringOption((o) => o.setName('sang').setDescription('Navn eller link').setRequired(true)),
  new S().setName('next').setDescription('Afspil næste nummer'),
  new S().setName('skip').setDescription('Spring over'),
  new S().setName('pause').setDescription('Pause'),
  new S().setName('resume').setDescription('Fortsæt'),
  new S().setName('stop').setDescription('Stop og ryd køen'),
  new S().setName('shuffle').setDescription('Bland køen'),
  new S().setName('queue').setDescription('Vis køen'),
  new S().setName('nowplaying').setDescription('Hvad spiller nu?'),
  new S().setName('volume').setDescription('Lydstyrke').addIntegerOption((o) => o.setName('procent').setDescription('0-150').setRequired(true).setMinValue(0).setMaxValue(150)),
  new S().setName('loop').setDescription('Gentag').addStringOption((o) => o.setName('tilstand').setDescription('Tilstand').setRequired(true)
    .addChoices({ name: 'Fra', value: 'off' }, { name: 'Sang', value: 'track' }, { name: 'Kø', value: 'queue' }, { name: 'Autoplay', value: 'autoplay' })),
  // Dashboard-link
  new S().setName('dashboard').setDescription('Link til kontrolpanelet'),
].map((c) => c.setContexts(InteractionContextType.Guild).toJSON());

async function register(clientId) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DEV_GUILD_ID
    ? Routes.applicationGuildCommands(clientId, process.env.DEV_GUILD_ID) // øjeblikkeligt på én server
    : Routes.applicationCommands(clientId);                               // globalt
  await rest.put(route, { body: definitions });
  console.log(`[kommandoer] ${definitions.length} registreret${process.env.DEV_GUILD_ID ? ' på dev-serveren' : ' globalt'}`);
}

module.exports = { definitions, register };
