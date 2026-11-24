# Les réglages propres à chaque brain

Le plugin sert des personnes aux métiers différents : rien de ce qui est propre à l'une ne s'écrit dans son code. Chaque brain porte ses propres règles, en six endroits. Cette page dit, pour chaque sorte de règle, où elle se met, qui la lit et quand elle s'applique. La question à se poser d'abord : **qui doit lire la règle, et à quel moment ?**

## Le tableau

| Sorte de règle | Où elle se met | Qui la lit | Quand elle s'applique |
|---|---|---|---|
| Une règle de travail donnée à l'IA, un piège appris | Une fiche du brain de nature leçon (`lesson`, `lecon` dans un brain français), écrite par `/brain:capture` | Toute IA qui cherche dans le brain (`brain_search` avec `nature`), le hook des suggestions, le hook de reprise | Avant une tâche, quand l'IA cherche les leçons du sujet ; à chaque message quand une leçon est proche ; après un résumé de la conversation |
| Une règle qui doit être là sans être cherchée | La partie personnelle du `CLAUDE.md` global de la personne (`~/.claude/CLAUDE.md`), hors du bloc du plugin | Claude Code, dans toutes les conversations de cet ordinateur | Toujours, dès le début de chaque conversation |
| Comment le brain s'écrit (une décision a sa fiche, ce qui ne se recopie pas, ce que la machine peut ajouter) | `WRITING_RULES.md`, à la racine du brain | Toute IA avant d'écrire, les juges (le texte leur est donné à chaque passage), `/brain:capture` | À chaque écriture dans le vault |
| Le format d'une fiche, les types et leurs champs | `vault/CLAUDE.md` | L'IA qui écrit une fiche, Claude Code quand il travaille dans le dossier du brain | À chaque écriture d'une fiche |
| Pourquoi ce brain existe, ce qui y entre, ce qui n'y entre jamais | `BRAIN.md` et `SOURCES.md` | L'IA qui ingère une source ou prend une décision d'architecture | À l'ingestion d'une source, à une décision sur le brain |
| Ce qu'un juge cherche dans ce qu'il lit et comment il l'écrit | `sources/<nom>/instructions.md` de ce juge | Le juge de cette source, à chaque passage | À chaque élément de sa pile |
| Ce qu'un juge ne doit jamais lire | `exclude` dans `sources/<nom>/source.json` (`sources.mjs exclude <juge> add <motif>`) | Le plugin, avant que l'élément n'arrive sur la pile | Toujours : un élément exclu n'est jamais lu |
| Les valeurs que le plugin règle (types, domaines, natures, recherche, suggestions, rappels) | `brain.json`, à la racine du brain | Le plugin lui-même | À chaque recherche, chaque message, chaque passage |
| Les règles du plugin pour l'IA de la personne | Le bloc du plugin dans le `CLAUDE.md` global, entre ses deux marques (`scripts/rules-block.mjs`) | Claude Code, dans toutes les conversations | Toujours ; le bloc est réécrit à chaque démarrage du serveur du brain : ne rien y écrire soi-même |

**Une règle de travail est d'abord une leçon.** C'est l'endroit par défaut : elle vit avec le reste de ce que le brain sait, elle se cherche, elle se suggère au bon moment, elle se relit après un résumé, et elle suit la personne si elle change d'IA. Le `CLAUDE.md` global est réservé aux quelques règles qui doivent être présentes sans qu'on les cherche, parce qu'il est lu en entier à chaque conversation et coûte à chaque fois.

## Les clés de `brain.json`

Le fichier appartient au brain ; le plugin le lit et n'en réécrit que ce qu'on lui demande. Les clés qu'une personne a des raisons de régler :

| Clé | Ce qu'elle règle |
|---|---|
| `name`, `lang`, `format` | Le nom de la personne, la langue dans laquelle elle lit, la langue du format des fiches (`fr` ou `en`) |
| `types` | Les types de fiche et leur dossier (le dossier est le type) |
| `domains` | Les domaines, par identifiant, avec leur libellé et leur fiche |
| `natures` | Les natures qu'une fiche d'un type peut porter (`{ "note": ["decision", "feedback", "lesson"] }`) |
| `exclude` | Les chemins du vault qui ne sont pas des fiches (une boîte de réception, un journal) |
| `neverPromoted` | Les types, ou les dossiers, que la revue de la semaine ne valide jamais d'elle-même |
| `search.hidden`, `search.hiddenTools` | Les dossiers et les outils du catalogue tenus hors de la recherche par défaut (un annuaire de contacts) |
| `suggest` | Les suggestions faites à chaque message (ci-dessous) |
| `reminders` | Les deux rappels des leçons (ci-dessous) |
| `runner`, `autoPush`, `letter`, `components`, `embeddings` | L'ordinateur qui fait tourner le brain, l'envoi automatique de la sauvegarde, la lettre de la semaine, les composantes choisies, le modèle de la recherche par le sens : réglés par les skills du plugin, à ne changer qu'avec elles |

### Les suggestions à chaque message

Depuis le 22 novembre 2026, toutes les valeurs du hook des suggestions (`scripts/suggest.mjs`) se règlent sous `suggest`. Une clé absente garde sa valeur par défaut.

| Clé | Par défaut | Ce qu'elle règle |
|---|---|---|
| `minWords` | 6 | Les mots porteurs de sens qu'un message doit compter, mots d'exécution à part, pour être cherché par le sens |
| `gate` | 0.6 | La proximité de sens qu'une fiche doit atteindre |
| `margin` | 0.05 | De combien elle peut rester sous la meilleure proximité du message |
| `notes`, `lessons` | 4, 2 | Combien de fiches et de leçons au plus |
| `perType` | 2 | Combien de fiches d'un même type avant que les autres types passent |
| `typeMargin` | 0.03 | De combien une fiche de plus d'un type déjà servi doit être plus proche que la meilleure d'un autre type pour passer quand même |
| `names` | true | Suggérer une fiche nommée dans le message (tous les mots de son titre y sont) |
| `nameSpread` | 12 | Au plus combien de fiches peuvent contenir ces mots pour que ce soit un nom |
| `titleSpread` | 2 | Un mot écrit avec une majuscule au milieu d'une phrase désigne les fiches dont le titre le porte, si elles sont au plus ce nombre |
| `excerpt` | 160 | La longueur de la phrase montrée avec chaque suggestion |
| `execution` | [] | Des mots d'exécution à ajouter à ceux du plugin (`"valide"`), ou à en retirer (`"-lance"`) |

Exemple :

```json
"suggest": { "gate": 0.62, "perType": 3, "execution": ["roule", "-teste"] }
```

La variable d'environnement `HVBRAIN_SUGGEST=off` coupe les suggestions sans toucher aux rappels.

### Les rappels des leçons

| Clé | Par défaut | Ce qu'elle règle |
|---|---|---|
| `reminders.corrections` | true | Quand un message ressemble à une correction ou à une règle, demander à l'IA de l'enregistrer comme leçon dans sa réponse même |
| `reminders.resume` | true | Quand une conversation reprend sur un résumé, demander à l'IA de relire les leçons du sujet avant de reprendre |
| `reminders.phrases` | [] | Des formulations à ajouter à celles du plugin (les accents et les majuscules ne comptent pas) ; `...` vaut quelques mots d'une même proposition, un `^` en tête veut un début de phrase ou de proposition, un `~` en tête en fait une formulation faible (ci-dessous) : `"^interdit de"`, `"ne ... plus jamais"`, `"~systématiquement"` |
| `reminders.defaults` | true | `false` retire les formulations du plugin et ne garde que les siennes |

**Formulations fortes et faibles** (depuis le 22 novembre 2026). Une formulation forte suffit seule : « arrête de », « nouvelle règle », « je t'ai déjà dit », « note en mémoire », « pourquoi tu refais ». Une formulation faible, écrite avec un `~` devant (« ~jamais », « ~la prochaine fois », « ~désormais »), ne compte que si sa phrase s'adresse à l'IA (un tutoiement ou un vouvoiement, un impératif, « il faut », « on doit ») et n'est ni une question, ni une description (« je n'ai jamais tapé le mot de passe », « tu es la version 5 désormais »), ni une condition (« si tu dois »), ni le but d'une tâche (« une skill qui te permette d'aller plus vite la prochaine fois »). Une formulation sans `~` est forte : celles qu'un brain avait déjà gardent leur sens.

Dans tous les cas, seuls comptent les mots de la personne : le texte entre guillemets, les blocs collés (`<pasted_content>`, blocs de code, lignes en `>`), les paragraphes de plus de 1 500 caractères, les longs fichiers d'instructions qui commencent par un titre, et les messages qu'une session écrit pour une autre sont mis de côté.

Exemple :

```json
"reminders": { "phrases": ["interdit de", "~systématiquement", "^plus ... de tutoiement"] }
```

## Ce qui n'a pas encore de place

**Une règle de lecture du brain, pour toute IA, dans tout dossier.** Ce que le serveur du brain dit à une IA qui s'y connecte (`scripts/tools.mjs`, `instructionsFor`) est le même texte pour tous les brains, suivi de la table des matières. Une personne qui voudrait que toute IA lise son brain d'une certaine façon (« une fiche de tel dossier est un brouillon », « cite toujours la source ») n'a que deux endroits, et aucun ne couvre tout : le `CLAUDE.md` du brain n'est lu que dans le dossier du brain, le `CLAUDE.md` global que par Claude Code sur cet ordinateur, jamais par la copie en ligne ni par une autre IA. Proposition, non faite : quelques lignes de `brain.json` (ou un court `READING_RULES.md`) que le serveur ajouterait à ses instructions, ici comme dans la copie en ligne.

## Les fichiers concernés

- `scripts/suggest.mjs`, `scripts/hook-suggest.mjs` : les suggestions et leurs réglages.
- `scripts/reminders.mjs`, `scripts/hook-resume.mjs`, `hooks/hooks.json` : les deux rappels des leçons.
- `scripts/engine.mjs` (`resolveFilters`), `scripts/pure.mjs` (`pickKnown`) : une nature, un type ou un domaine pris dans le mot de la personne.
- `scripts/rules-block.mjs` : le bloc du plugin dans le `CLAUDE.md` global.
- `scripts/exclude.mjs`, `scripts/sources.mjs` : les exclusions d'un juge.
- `templates/brain/*/WRITING_RULES.md`, `templates/sources/*/instructions.*.md` : les modèles copiés dans un brain à sa création.

Les vérifications : `tests/zones/usage.mjs`.
