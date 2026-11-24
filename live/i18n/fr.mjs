// i18n/fr.mjs: every text the server words for the person, in French.
//
// These are the texts the French interface has always shown, character for
// character: change one only on purpose. Same keys as i18n/en.mjs; a key
// missing here falls back to English.

/** "3 éléments", "1 élément". */
const items = (n) => `${n} élément${n > 1 ? "s" : ""}`;
/** "attendent" above one, "attend" otherwise. */
const wait = (n) => (n > 1 ? "attendent" : "attend");

/** @type {Partial<import("./en.mjs").Dictionary>} */
const fr = {
  appName: "Second Brain",

  // ---- the server (server.mjs)
  noBrain: "Aucun brain trouvé (réglage `brain` de ~/.hypervibe-brain/config.json).",
  listening: (url) => `brain-live sur ${url}`,
  refused: (why) => `refusé (${why})`,
  conversationOf: (client, conv) => `${client}, conversation ${conv}`,
  conversation: (conv) => `Conversation ${conv}`,
  noteNameInvalid: "nom de fiche invalide",
  noteNotFound: "fiche introuvable",
  noteUnreadable: "la fiche n'a pas pu être lue",
  addressInvalid: "adresse invalide",
  answerUnreadable: "réponse illisible",
  sourceUnknown: "source inconnue",
  pluginSilent: "le plugin n'a pas répondu",
  pluginFailed: "le plugin n'a pas pu le faire",
  sourceUnreadable: "les réglages de cette source sont illisibles pour l'instant",
  connectionUnknown: "branchement inconnu",
  wholeNumbers: "les heures et le nombre d'éléments par passage sont des nombres entiers",
  judgeFollowsSources: "un juge suit le rythme de ses sources",
  rhythmNotAllowed: "rythme non permis pour cette source",
  judgeUnknown: "juge inconnu",
  modelUnknown: "modèle inconnu",
  hoursOrder: "l'heure de fin doit suivre celle du début",
  capInvalid: "ce plafond n'est pas un nombre de jetons",

  // ---- the rhythm of a source
  rhythmDay: "chaque soir",
  rhythmWeek: "chaque semaine",
  rhythmHour: "chaque heure",
  everyMinutes: (n) => `toutes les ${n} minutes`,

  // ---- the tools around the brain (tools.mjs)
  familyCode: "Code et IA",
  familyFiles: "Fichiers",
  claudeCodeRole: "Les conversations de travail, la mémoire et les skills.",
  claudeCodeAccess: "Serveur MCP brain (lecture), skill /brain (écriture).",
  claudeCodeToday: "Dans les deux sens : Claude lit le brain par le serveur MCP, et le brain reçoit les titres des sessions, les captures /brain et les faits que la machine ajoute.",
  afterSkillOrSource: "après une skill ou une autre source",
  reader: (name, when, description) => `${name} (${when}) : ${description}`,
  readerSeparator: " ; ",
  foldersName: "Dossiers",
  foldersRole: "Les dossiers de cet ordinateur que le brain suit, chacun avec tout ce qu'il contient : à leur rythme, ses sources y relèvent ce qui a bougé.",
  foldersAccess: "Lecture locale des dossiers, sous-dossiers compris ; lecture d'un fichier à la demande (dropbox://...).",
  folderRole: (paths) => (paths.length > 1 ? `Les dossiers ${paths.join(" et ")}.` : `Le dossier ${paths[0]}.`),
  folderAccess: (sources) => `Lu, sous-dossiers compris, par : ${sources.join(", ")}.`,
  folderToday: (sources) => `Ce qui y bouge est relevé au passage suivant de : ${sources.join(", ")}.`,
  databaseName: (project) => `Base ${project}`,
  databaseRole: (project, scheme) => `La base de données du projet ${project}, lue à la demande (${scheme}://${project}/...).`,

  // ---- what a tool did, and when it runs next (activity.mjs)
  toolUnknown: "outil inconnu",
  liveAtOnce: "en direct, dès l'arrivée d'un élément",
  liveAfter: (delay) => `en direct, ${delay} après l'arrivée d'un élément`,
  foldersAfterCalm: "dans les dossiers qu'elle relève, ce qui est posé depuis un quart d'heure",
  after: (names) => `après ${names.join(", ")}`,
  vaultKey: (names) => `clé du coffre : ${names.join(", ")}`,
  waitsForVault: "attend que le coffre s'ouvre",
  paused: "en pause",
  pausedWaiting: (n) => `en pause, ${items(n)} ${wait(n)}`,
  fileMoved: "un fichier a bougé : au calme du dossier",
  askedNow: "demandé maintenant",
  nextBeat: "au prochain battement du hub",
  catchingUp: (left, total, batch) => `${items(left)} ${left > 1 ? "restants" : "restant"} sur ${total}, ${batch} par passage`,
  pausedAfterFailure: (n) => `en pause après un passage en échec, ${items(n)} ${wait(n)}`,
  inJudgePile: (n) => `${items(n)} dans la pile du juge`,
  heldForAnswer: (n) => `${items(n)} ${wait(n)} ta réponse`,
  cappedToday: (n) => `plafond du jour atteint, ${items(n)} ${wait(n)} demain`,
  atEveningSave: "à la sauvegarde du soir",
  atSundayReview: "à la relecture du dimanche",
  atNextTick: "lit au prochain tic, s’il y a du neuf",

  // ---- what changed in a note (activity.mjs)
  noteUnknown: "fiche inconnue",
  noteGone: "la fiche n'existe plus",
  noHistory: "ce brain n'a pas d'historique (git absent ou dépôt non créé)",
  notSavedYet: "pas encore sauvegardée",

  // ---- the launcher (open.mjs)
  portTaken: (port, brain) => `Le port ${port} sert déjà un autre brain (${brain}). Choisir un autre port : BRAIN_LIVE_PORT=<port>.`,
  serverNotStarted: "Le serveur local n'a pas démarré. Essayer : node server.mjs, pour voir l'erreur.",
  serverReady: (url) => `Serveur prêt : ${url}`,
  openedInstalled: (url) => `Second Brain (application installée) : ${url}`,
  openInBrowser: (url) => `Ouvrir ${url} dans un navigateur.`,
  opened: (url) => `Second Brain : ${url}`,
};

export default fr;
