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

Un garde-fou reste lancé par les réglages de la plateforme (`~/.claude/settings.json`), qui pointent désormais vers son fichier dans le brain, au même endroit et dans le même ordre.

## Les commandes

```bash
node scripts/executive.mjs state                 # ce que l'étage contient, et si chaque pièce est en place
node scripts/executive.mjs adopt-skill <nom>     # range ~/.claude/skills/<nom> dans le brain, et pose le lien
node scripts/executive.mjs adopt-guard <fichier> # range ~/.claude/hooks/<fichier> dans le brain, et rebranche les réglages
node scripts/executive.mjs place                 # repose tous les liens et tous les branchements (poste neuf, brain déplacé)
```

Rien n'est jamais supprimé sans copie : ce qui bouge est d'abord copié dans `~/.hypervibe-brain/backups/executive/<date>/`, réglages compris. Un garde-fou lancé autrement que par `node <fichier>` n'est pas déplacé : ce qui l'entoure se perdrait.

## Une skill s'améliore, un garde-fou se protège

L'IA peut modifier une skill de l'étage : c'est comme ça qu'une skill s'améliore. Elle ne peut ni modifier, ni déplacer, ni supprimer un garde-fou : une IA qui peut réécrire ce qui l'encadre n'est pas encadrée. Le hook `hook-executive.mjs` du plugin refuse ses écritures dans `executive/guards/` et dans `guards.json`. C'est la personne qui les change, à la main.

Ses limites, dites franchement :

- Il ne couvre pas les réglages de la plateforme (`~/.claude/settings.json`), que d'autres outils doivent pouvoir modifier. Une IA pourrait donc débrancher un garde-fou sans toucher à son fichier.
- Il lit une commande comme un texte : un chemin construit morceau par morceau lui échappe.

## Dans la vue en direct

Le calque **Harnais** (coché d'office, dans la boîte des filtres) ajoute l'étage exécutif aux vues Domaines et Sémantique, sur un seul plan : le savoir au centre, l'anneau des outils autour, comme sur la carte, et autour de l'anneau, au-delà des noms des outils, **la couronne des harnais**. Chaque harnais y est un arc (tes skills, puis chaque plugin installé), ses skills en points. Les deux échanges qui comptent sont côte à côte : les outils nourrissent le savoir (de l'anneau vers le centre), les harnais agissent sur les outils (de la couronne vers l'anneau). Chaque arc est tourné vers les outils que ses skills nomment le plus, pour que leurs liens restent courts.

Chaque skill est reliée aux outils que son SKILL.md nomme : un repérage par le texte, donc une estimation. Un clic sur une skill n'allume que ses liens et entoure ses outils. Sa carte a un bouton **Lire la skill**, qui l'ouvre en entier dans une fenêtre, et montre sa description dans la langue de la page : traduite par Claude la première fois (une vingtaine de secondes), puis gardée dans `~/.hypervibe-brain/translations.json`. Le serveur ne lit que les fichiers des skills que l'étage liste.

**Quand l'IA se sert d'une skill** (l'outil Skill, ou une `/commande` tapée), son point s'allume dans la couronne, son nom apparaît et ses liens vers ses outils s'éclairent, puis tout s'éteint en une minute. Le hook `hook-skill.mjs` du plugin ne note que le nom de la skill et la conversation, jamais le texte, dans `~/.hypervibe-brain/skills-used.jsonl`.

Tes garde-fous et hooks se tiennent au bord intérieur de la couronne : en face de l'outil qu'ils gardent quand on le devine d'après leur nom (un garde-fou `gmail-...` est en face de Gmail), sinon le long de tes skills. Les hooks de chaque plugin se tiennent le long de son arc ; leur carte dit à quel moment ils tournent. Un garde-fou qui appelle un fichier à côté de lui (la fenêtre de confirmation de WhatsApp) déménage avec lui : `adopt-guard <fichier> --with <compagnon>`.

La couronne se cale sur la taille de la fenêtre : les noms des outils ont une taille fixe à l'écran, donc plus la fenêtre est petite, plus la couronne s'écarte de l'anneau. Les étages vus de biais (essayés le 22 et le 23 novembre 2026, avec les outils sur leur propre étage ou sur chaque étage) restent dans le code, inactifs (`ISO.tilt` dans `state.js`).

## Une autre IA branchée sur le brain

Depuis le 23 novembre 2026, le serveur MCP du brain sert les skills de l'étage à une IA qui n'est pas Claude Code (`scripts/skills-mcp.mjs`). Il le sait par le nom que l'IA donne en se connectant : Claude Code (`claude-code`) trouve ses skills tout seul par les liens, et ne reçoit rien de plus (une skill apparaîtrait deux fois).

- **En prompts MCP** : chaque skill est un prompt, que l'application de l'IA montre à la personne (souvent comme une commande). Il prend ce qu'elle demande en argument.
- **Par un huitième outil, `brain_skill`** : sans nom, la liste des skills avec ce à quoi chacune sert ; avec un nom, la skill à suivre. Pour une application qui ne connaît que les outils. Les instructions de connexion nomment les skills (environ 200 tokens pour 35 skills), leurs descriptions restent dans l'outil.
- **La traduction** : le dossier de la skill (`${CLAUDE_SKILL_DIR}`) devient son vrai chemin, la demande prend la place de `$ARGUMENTS`, et une courte table en tête dit ce que veulent dire les noms de Claude Code (Bash, Read, AskUserQuestion, Agent, une autre skill par sa /commande...). Le texte de la skill n'est pas réécrit : une skill réécrite serait une deuxième skill.
- **Les garde-fous** ne se transportent pas : ce sont des hooks de Claude Code, et aucun serveur MCP ne peut arrêter le geste d'une autre IA. Ceux qui se tiennent avant un geste (PreToolUse) sont donnés en règles avec chaque skill, pour que l'IA demande avant : une règle tenue par l'IA, pas un verrou, et le texte le dit.
- `HVBRAIN_MCP_SKILLS=off` coupe le tout. Le test : `tests/zones/mcp-skills.mjs`.

## Ce qui vient ensuite

- Une commande du plugin (une skill) pour adopter et reposer sans passer par le terminal.
- Les plugins installés : le brain n'en garde pas le code (ce sont des produits, avec leur dépôt), mais il en tiendra le registre pour les réinstaller sur un poste neuf.
- Les deux étages ensemble, dans une vue isométrique à deux niveaux.
- La copie du brain dans le nuage (le Worker) ne sert pas encore les skills.
