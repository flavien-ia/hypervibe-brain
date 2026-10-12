# /brain:review

La revue de la semaine de votre second brain : ce qui est nouveau, les graines qui ont pris racine et deviennent fiables, les fiches orphelines, les liens cassés, et des liens proposés. Elle se fait avec vous quand vous la lancez, ou toute seule quand c'est la routine hebdomadaire qui la lance. Dans les deux cas, elle laisse un rapport daté dans le brain.

## Quand l'utiliser

- Quand vous dites « fais la revue de mon brain », ou `/brain:review`.
- Chaque semaine, automatiquement, si vous avez installé la routine avec `/brain:add-routines`.
- Une première fois avec Claude avant d'installer cette routine, pour voir concrètement ce qu'elle apporte.
- Pour répondre à la lettre de la semaine, par exemple « brain-review : retire les graines 3 et 8 ».

## Comment ça se passe

1. **Rattrapage** : si la sauvegarde du soir n'a pas tourné depuis plus d'un jour, Claude la lance d'abord, pour que la semaine soit racontée en entier.
2. **Contrôle du brain** : Claude vérifie les fiches et les liens. S'il trouve des erreurs, il les note pour le rapport et ne fait aucune promotion cette fois-ci ; avec vous, il propose de les corriger ensemble.
3. **Le rapport et les promotions** : le rapport liste les nouvelles fiches, les graines devenues fiables, les orphelines, les liens cassés, les sources disparues ou modifiées depuis leur fiche, et la couverture de vos domaines. Selon vos sources, il ajoute les projets travaillés avec Claude, sur tous vos ordinateurs et avec le titre de chaque session, et les fichiers qui ont bougé dans les dossiers suivis.
4. **La réflexion de Claude** : il lit le rapport et le complète. Avant de créer une fiche, il se pose trois questions : la voudrez-vous encore dans six mois, est-elle absente du brain, se comprend-elle hors de la semaine ? Un seul non, et il ne la crée pas.
  - Sources disparues ou modifiées : chacune devient une proposition (archiver, relire), une seule fois.
  - Des liens proposés pour les nouvelles fiches et les orphelines (dix au plus), et les doublons qu'il soupçonne, chacun avec sa raison. Ce sont des propositions : il ne les applique pas.
  - Travail avec Claude : une fiche proposée pour chaque projet qui n'en a pas ; pour les autres, ce qui a bougé.
  - Dossiers suivis : les fichiers qui méritent une fiche.
  - Mails et agenda : une graine pour chaque nouvelle personne qui compte, chaque réunion à retenir et chaque décision prise, sans jamais copier le texte d'un email.
  - Annuaire des contacts : les échanges de la semaine, et une fiche proposée pour toute personne montée dans le noyau.
  - Vos propres sources : celles qui sont faites par Claude sont déroulées ; une source en difficulté est signalée en tête du rapport.
5. **La lettre**, si vous l'avez choisie : un résumé de la semaine, les nouvelles graines, les propositions, les promotions et une « collision » (deux fiches proches par le sens que rien ne relie), parfois d'anciennes fiches revenues dans l'actualité, et l'état de santé du brain en trois phrases. Tout y est numéroté pour que vous puissiez répondre.
6. **Enregistrement** : le brain est enregistré.
7. **Avec vous, ensuite** : vous parcourez le rapport ensemble. Les promotions d'abord (un désaccord renvoie la fiche en graine), puis les propositions une à une. Un lien que vous acceptez est ajouté sous vos yeux.

## Ce que ça crée pour vous

- Le **rapport de la semaine**, daté, rangé dans le brain
- Des **graines devenues fiables**, chacune avec sa raison conservée
- De **nouvelles graines** tirées de vos sources
- Une liste de **propositions** (liens, fusions, fiches) qui attendent votre réponse
- La **lettre**, gardée dans le brain et envoyée à votre propre adresse, à personne d'autre

## Prérequis

- Un brain déjà créé
- Pour les mails, l'agenda et l'annuaire des contacts : les connecteurs de votre Claude présents dans la session. Sans eux, le rapport le dit en une ligne et rien n'est créé de ce côté.
- Pour la lettre et le passage automatique : `/brain:add-routines`

## Astuces

{{callout:info|Comment une graine devient fiable}}
Elle doit avoir au moins deux semaines, et soit être liée à la main depuis une fiche née un autre jour, soit avoir été lue par Claude en consultant le brain. Une idée n'est jamais promue par la machine : sa maturité, c'est vous qui en jugez.
{{/callout}}

{{callout:tip|Répondre à la lettre}}
Dans n'importe quelle conversation : « brain-review : retire les graines 3 et 8 », « applique les propositions 1 et 4 », « remets en graine la 1 », « relie la 2 ». Ne rien dire garde les graines, et une proposition restée sans réponse n'est pas répétée la semaine suivante.
{{/callout}}

{{callout:warning|Ce que la revue ne fait jamais seule}}
En passage automatique, Claude ne pose aucune question, ne modifie aucune fiche fiable et n'applique aucune proposition. Une fiche que vous avez validée n'est modifiée qu'avec votre accord, et seule une graine peut être retirée.
{{/callout}}
