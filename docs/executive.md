# L'étage exécutif du brain

Le brain a deux étages. Le premier, celui des fiches, garde ce que la personne sait, pense et a décidé. Le second garde ce que son IA sait faire : ses skills, et les garde-fous qui les encadrent. On l'appelle l'étage exécutif.

Pourquoi : la mémoire de l'IA est passée dans le brain pour qu'une autre IA branchée dessus ne perde rien. Ce que l'IA sait faire restait dans les dossiers de la plateforme (`~/.claude/skills`, `~/.claude/hooks`). L'étage exécutif l'y range à son tour.

## Ce qu'il contient

```
<brain>/executive/
  skills/<nom>/        une skill, telle quelle (SKILL.md et ses fichiers)
  guards/<fichier>.mjs un garde-fou, tel quel
  guards.json          comment chaque garde-fou est branché (événement, outils visés, délai)
```

C'est le seul endroit où un brain garde du code : celui de la personne, qu'aucune mise à jour du plugin ne touche.

## La plateforme les trouve toujours là où elle les cherche

Une skill n'est pas retrouvée comme une fiche : Claude Code la liste dans le contexte de l'IA et l'appelle par `/<nom>`. Le brain en est donc la source, et le dossier de la plateforme garde un lien vers elle (une jonction sous Windows, qui ne demande aucun droit). La skill s'appelle comme avant, et la modifier, c'est la modifier dans le brain.

Un garde-fou reste lancé par les réglages de la plateforme (`~/.claude/settings.json`), au même endroit et dans le même ordre. Depuis le 27 novembre 2026 ils ne lancent plus son fichier directement : ils passent par un petit programme posé à côté des réglages du plugin (`~/.hypervibe-brain/guard.mjs`), qui vérifie que le garde-fou est bien celui que la personne a approuvé sur cet ordinateur avant de le lancer. Voir [Ce qui tourne tout seul est approuvé sur chaque ordinateur](approbations.md).

## Les commandes

```bash
node scripts/executive.mjs state                 # ce que l'étage contient, et si chaque pièce est en place
node scripts/executive.mjs adopt-skill <nom>     # range ~/.claude/skills/<nom> dans le brain, et pose le lien
node scripts/executive.mjs adopt-guard <fichier> # range ~/.claude/hooks/<fichier> dans le brain, et rebranche les réglages
node scripts/executive.mjs place                 # repose les liens et les branchements de ce qui est approuvé sur ce poste (poste neuf, brain déplacé)
node scripts/executive.mjs trust guard|skill <nom>  # (dans le terminal de la personne) approuve un garde-fou ou une skill, puis le pose
node scripts/executive.mjs switch skill <nom> on|off                    # éteint ou rallume une skill de la personne
node scripts/executive.mjs switch harness <plugin@marketplace> on|off   # éteint ou rallume un plugin entier
```

`place` ne pose que ce que la personne a approuvé sur cet ordinateur, et liste le reste (`pending`). Faire entrer une skill ou un garde-fou depuis l'ordinateur (`adopt-*`) l'approuve sur cet ordinateur ; sur un autre, ou après un changement, c'est `trust`, dans le terminal de la personne (`node scripts/trust.mjs window` ouvre la fenêtre). Une ligne de `guards.json` mal formée (un nom qui n'est pas un nom de fichier, un moment que la plateforme ne connaît pas, un motif d'outils sur plusieurs lignes) n'est jamais écrite dans les réglages.

Rien n'est jamais supprimé sans copie : ce qui bouge est d'abord copié dans `~/.hypervibe-brain/backups/executive/<date>/`, réglages compris. Un garde-fou lancé autrement que par `node <fichier>` n'est pas déplacé : ce qui l'entoure se perdrait.

## Une skill s'améliore, un garde-fou se protège

L'IA peut modifier une skill de l'étage : c'est comme ça qu'une skill s'améliore. Elle ne peut ni modifier, ni déplacer, ni supprimer un garde-fou : une IA qui peut réécrire ce qui l'encadre n'est pas encadrée. Le hook `hook-executive.mjs` du plugin refuse ses écritures dans `executive/guards/` et dans `guards.json`. C'est la personne qui les change, à la main, et qui les approuve à nouveau après chaque changement.

Depuis le 27 novembre 2026 (`scripts/lock-paths.mjs`, partagé avec le verrou de la mémoire) :

- **Un chemin est résolu avant d'être comparé** : ses segments calculés, puis tel que le disque le connaît (un lien suivi), sans tenir compte de la casse là où le disque n'en a pas. `executive/./guards`, `executive/skills/../guards` ou une autre casse ne passent plus. Tous les outils qui nomment le fichier qu'ils écrivent sont couverts (`MultiEdit`, un outil d'un autre serveur).
- **Une commande est lue dans l'autre sens** : celle qui nomme le dossier des garde-fous ou leur branchement est refusée, sauf si c'est une lecture simple (`cat`, `grep`, `ls`, `git diff`...), seule ou passée par un tube à d'autres lectures, sans enchaînement, et sans redirection sauf vers un fichier hors de l'étage. Un `cd` dans le dossier puis un nom nu, `python`, `dd`, `node -e`, un chemin assemblé dans du code sont refusés.
- **Renommer, déplacer ou supprimer le dossier `executive`** est refusé : les garde-fous partiraient avec lui.
- **Les réglages du plugin sur l'ordinateur** (`~/.hypervibe-brain/config.json`, où sont écrits les verrous et les approbations) et le lanceur des garde-fous ne sont jamais écrits par l'IA, et **les gestes qui lèvent un verrou ou approuvent** (`memory.mjs lock off`, `restore`, `executive.mjs trust`, `sources.mjs trust`, `trust.mjs approve`) lui sont refusés : ce sont ceux de la personne.
- **Fermé dans le doute** : une entrée que le verrou ne peut pas lire, ou une erreur de son propre code, refuse au lieu de laisser passer.

Ses limites, dites franchement :

- Il ne couvre pas les réglages de la plateforme (`~/.claude/settings.json`), que d'autres outils doivent pouvoir modifier. Une IA pourrait donc débrancher un garde-fou sans toucher à son fichier (l'état de l'étage le montre alors comme non branché).
- Il lit le texte d'une commande : un nom qu'aucun texte de la commande ne contient (fabriqué par un programme que la commande lance, ou par un motif comme `exec*/gu*`) lui échappe.
- Un programme qui ne démarre pas du tout, ou que la plateforme arrête parce qu'il est trop lent, ne refuse rien.

## Allumer et éteindre

Depuis le 27 novembre 2026, la personne peut éteindre une de ses skills, ou un harnais entier, sans rien perdre : la skill reste dans le brain, le plugin reste installé. Trois mots à ne pas confondre :

- **Une skill** est un savoir-faire écrit : l'IA la suit quand on l'appelle. Elle ne lance rien toute seule.
- **Un harnais** est un plugin installé : un lot de skills, avec parfois des hooks, de petits programmes qui tournent autour du travail de l'IA.
- **Un garde-fou** est un hook de la personne qui encadre l'IA : il demande ou refuse avant un geste risqué.

L'état vit dans le brain, dans `executive/switches.json` :

```json
{ "skills": { "<dossier de la skill>": "off" }, "harnesses": { "<plugin>@<marketplace>": "off" } }
```

Seul ce qui est éteint y est écrit : un fichier absent veut dire que tout est allumé. Il suit le brain sur un autre ordinateur, et une autre IA branchée sur le brain en tient compte. Seul `executive.mjs switch` l'écrit. Chaque geste est noté dans le journal du brain, avec qui l'a demandé (la personne depuis la vue, ou son IA).

| Quoi | Ce que fait l'interrupteur | Quand le changement prend effet |
|---|---|---|
| Une skill de la personne | Éteinte : son lien dans `~/.claude/skills` est retiré, la skill reste intacte dans le brain. Rallumée : le lien est reposé | Tout de suite, y compris dans une session ouverte (Claude Code surveille ce dossier ; sinon `/reload-skills`) |
| Un harnais (un plugin entier) | `claude plugin disable` ou `enable` ; si la commande manque ou ne fait rien, la clé `enabledPlugins` des réglages de Claude Code, après une copie du fichier | À la session suivante, ou tout de suite avec `/reload-plugins` |
| Une skill précise d'un plugin | Pas d'interrupteur : elle suit son harnais | |
| Un garde-fou | Pas d'interrupteur, pour personne | |

**Une skill ne se rallume jamais sans approbation.** Le lien n'est reposé que si la skill est approuvée sur cet ordinateur telle qu'elle est (voir [les approbations](approbations.md)). Sinon elle est allumée dans le brain et attend l'accord de la personne, comme toute skill qui arrive. Une précision : une skill reliée au moment où on l'éteint est gardée approuvée telle qu'elle était à cet instant (c'est le texte que l'IA avait sous les yeux). Elle revient donc tout de suite, sauf si elle a changé pendant qu'elle était éteinte, par une synchronisation par exemple : là, elle attend.

**Le plugin du brain ne s'éteint pas d'ici.** Il porte les verrous qui tiennent l'IA hors des garde-fous et de la mémoire, et le serveur du brain. La commande refuse, la vue grise l'interrupteur.

**Un harnais qui protège demande un oui.** Un harnais qui déclare des hooks lancés avant une action (`PreToolUse`, lus dans son `hooks/hooks.json`) vérifie quelque chose : l'éteindre retire cette protection. La commande refuse alors, nomme les hooks concernés, et ne passe qu'avec `--confirmed`, que l'IA n'ajoute qu'après une question claire à la personne. Dans la vue, c'est une fenêtre de confirmation. Dit franchement : c'est une règle tenue par l'IA et non un verrou, puisque rien n'empêche un programme de lancer `claude plugin disable` lui-même.

**Sur un autre ordinateur**, `place` applique les interrupteurs des skills (une skill éteinte n'y est pas reliée, et le lien qu'elle y avait encore est retiré). Pour les harnais, il dit seulement lesquels sont éteints dans le brain alors qu'ils sont installés et actifs ici, avec la commande pour les éteindre, et n'éteint rien de lui-même : un plugin installé sur un ordinateur est le choix de cet ordinateur.

**Pour une autre IA**, une skill éteinte n'est plus servie : ni par `brain_skill`, ni en prompt, ni dans la phrase de connexion. La copie en ligne la retire à sa synchronisation suivante.

### Ce qui n'a pas d'interrupteur

**La skill d'un plugin.** Claude Code n'offre rien de documenté pour éteindre une seule skill d'un plugin (documentation relue le 27 novembre 2026) : le réglage `skillOverrides` ne concerne pas les skills des plugins, et une règle de permission `deny` sur l'outil Skill (`Skill(nom)`) n'a aucune forme documentée pour une skill de plugin (`plugin:nom`), ni la garantie qu'elle la retire de ce que l'IA voit. Faute de pouvoir le prouver, rien ici ne fait semblant d'éteindre : la fiche d'une telle skill dit qu'elle suit son harnais et y renvoie.

**Un garde-fou.** Aucune commande ne met un garde-fou en pause, et une clé `guards` écrite à la main dans `switches.json` n'est pas lue. La vue n'a pas non plus de bouton pour cela, et c'est voulu. Un tel bouton ne vaudrait que si la personne seule pouvait l'actionner, or la vue ne sait pas distinguer la personne d'un programme de son compte :

- le jeton de la vue est un fichier de son compte (`~/.hypervibe-brain/live-token.json`), que le plugin lit lui-même pour ses suggestions. Il est fermé aux autres comptes et aux pages web, pas à un programme du compte : une IA qui a un terminal peut le lire, puis appeler n'importe quelle route ;
- une IA qui pilote un navigateur clique dans la vue et tape une confirmation comme n'importe qui.

Le verrou du plugin lit le texte d'une commande et ne peut fermer ni l'un ni l'autre avec certitude. Mettre un garde-fou en pause reste donc un geste à la main : la personne ouvre son fichier, ou retire sa ligne des réglages de Claude Code. Le jour où ce geste existera, il passera par le même chemin que les approbations (une fenêtre de terminal de la personne), pas par la vue.

### Un secret dans une skill

Une skill s'écrit vite, et il arrive qu'on y laisse une clé ou un mot de passe. Or un brain est sauvegardé, synchronisé, parfois copié en ligne. `adopt-skill` prévient donc quand la skill qui entre semble contenir un secret, `state` porte pour chaque skill ce qui y ressemble (`secrets` : le nombre, puis le fichier, la ligne et le genre), `/brain:status` le signale et la fiche de la skill dans la vue le dit. Jamais la valeur elle-même. Tous les fichiers texte du dossier de la skill sont lus (`scripts/secret-scan.mjs`). Ce n'est qu'un avertissement : la skill marche comme avant. Seul l'envoi vers la copie en ligne est refusé, et il l'était déjà.

## Dans la vue en direct

Le calque **Harnais** (coché d'office, dans la boîte des filtres) ajoute l'étage exécutif aux vues Domaines et Sémantique, sur un seul plan : le savoir au centre, l'anneau des outils autour, comme sur la carte, et autour de l'anneau, au-delà des noms des outils, **la couronne des harnais**. Chaque harnais y est un arc (tes skills, puis chaque plugin installé), ses skills en points. Les deux échanges qui comptent sont côte à côte : les outils nourrissent le savoir (de l'anneau vers le centre), les harnais agissent sur les outils (de la couronne vers l'anneau). Chaque arc est tourné vers les outils que ses skills nomment le plus, pour que leurs liens restent courts.

Chaque skill est reliée aux outils que son SKILL.md nomme : un repérage par le texte, donc une estimation. Un clic sur une skill n'allume que ses liens et entoure ses outils. Sa carte a un bouton **Lire la skill**, qui l'ouvre en entier dans une fenêtre, et montre sa description dans la langue de la page : traduite par Claude la première fois (une vingtaine de secondes), puis gardée dans `~/.hypervibe-brain/translations.json`. Le serveur ne lit que les fichiers des skills que l'étage liste.

**Quand l'IA se sert d'une skill** (l'outil Skill, ou une `/commande` tapée), son point s'allume dans la couronne, son nom apparaît et ses liens vers ses outils s'éclairent, puis tout s'éteint en une minute. Le hook `hook-skill.mjs` du plugin ne note que le nom de la skill et la conversation, jamais le texte, dans `~/.hypervibe-brain/skills-used.jsonl`.

Tes garde-fous et hooks se tiennent au bord intérieur de la couronne : en face de l'outil qu'ils gardent quand on le devine d'après leur nom (un garde-fou `gmail-...` est en face de Gmail), sinon le long de tes skills. Les hooks de chaque plugin se tiennent le long de son arc ; leur carte dit à quel moment ils tournent. Un garde-fou qui appelle un fichier à côté de lui (la fenêtre de confirmation de WhatsApp) déménage avec lui : `adopt-guard <fichier> --with <compagnon>`.

**L'interrupteur est dans la fiche** (27 novembre 2026) : celle de chacune de tes skills, et celle d'un harnais, qu'un clic sur le nom de son arc ouvre. L'état change tout de suite à l'écran, puis le serveur confirme, et une ligne sous l'interrupteur dit quand le changement prend effet. Ce qui est éteint reste dessiné : une skill éteinte est un point creux, un harnais éteint un arc pâle au bord en pointillés, et le nom de l'arc compte ce qui est éteint. La fiche d'une skill de plugin dit qu'elle suit son harnais ; celle d'un garde-fou, qu'il n'a pas d'interrupteur. La route est `POST /api/executive/switch`, protégée par le jeton comme les autres, et refuse tout ce qui n'est ni une skill ni un harnais.

La couronne se cale sur la taille de la fenêtre : les noms des outils ont une taille fixe à l'écran, donc plus la fenêtre est petite, plus la couronne s'écarte de l'anneau. Les étages vus de biais (essayés le 22 et le 23 novembre 2026, avec les outils sur leur propre étage ou sur chaque étage) restent dans le code, inactifs (`ISO.tilt` dans `state.js`).

## Une autre IA branchée sur le brain

Depuis le 23 novembre 2026, le serveur MCP du brain sert les skills de l'étage à une IA qui n'est pas Claude Code (`scripts/skills-mcp.mjs`). Il le sait par le nom que l'IA donne en se connectant : Claude Code (`claude-code`) trouve ses skills tout seul par les liens, et ne reçoit rien de plus (une skill apparaîtrait deux fois).

- **En prompts MCP** : chaque skill est un prompt, que l'application de l'IA montre à la personne (souvent comme une commande). Il prend ce qu'elle demande en argument.
- **Par un huitième outil, `brain_skill`** : sans nom, la liste des skills avec ce à quoi chacune sert ; avec un nom, la skill à suivre. Pour une application qui ne connaît que les outils. Les instructions de connexion nomment les skills (environ 200 tokens pour 35 skills), leurs descriptions restent dans l'outil.
- **La traduction** : le dossier de la skill (`${CLAUDE_SKILL_DIR}`) devient son vrai chemin, la demande prend la place de `$ARGUMENTS`, et une courte table en tête dit ce que veulent dire les noms de Claude Code (Bash, Read, AskUserQuestion, Agent, une autre skill par sa /commande...). Le texte de la skill n'est pas réécrit : une skill réécrite serait une deuxième skill.
- **Les garde-fous** ne se transportent pas : ce sont des hooks de Claude Code, et aucun serveur MCP ne peut arrêter le geste d'une autre IA. Ceux qui se tiennent avant un geste (PreToolUse) sont donnés en règles avec chaque skill, pour que l'IA demande avant : une règle tenue par l'IA, pas un verrou, et le texte le dit.
- **Une skill éteinte** (`executive.mjs switch skill <nom> off`) n'est pas servie, ni en prompt ni par `brain_skill`, et la copie en ligne la retire à sa synchronisation suivante.
- `HVBRAIN_MCP_SKILLS=off` coupe le tout. Les tests : `tests/zones/mcp-skills.mjs`, et `tests/zones/interrupteurs.mjs` pour les interrupteurs.

## Ce qui vient ensuite

- Une commande du plugin (une skill) pour adopter et reposer sans passer par le terminal.
- La pause d'un garde-fou par la personne, dans une fenêtre de terminal à elle, comme une approbation (voir « Ce qui n'a pas d'interrupteur »).
- Les plugins installés : le brain n'en garde pas le code (ce sont des produits, avec leur dépôt), mais il en tiendra le registre pour les réinstaller sur un poste neuf.
- Les deux étages ensemble, dans une vue isométrique à deux niveaux.
- La copie du brain dans le nuage (le Worker) ne sert pas encore les skills.
