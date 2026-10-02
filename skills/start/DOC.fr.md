# /brain:start

Le premier pas avec Hypervibe Brain. Claude vérifie que votre ordinateur a ce qu'il faut pour un second brain, installe ce qui manque, puis vous propose de créer le brain. Vous ne tapez rien : il s'occupe de tout et vous montre l'avancement sous forme de petite liste.

## Quand l'utiliser

- Juste après avoir installé le plugin, avant toute autre skill.
- Quand une autre skill vous dit que l'ordinateur n'est pas prêt.
- Après une installation ou une mise à jour, pour vérifier que Claude arrive bien à joindre votre brain.

## Comment ça se passe

1. **Accueil** : Claude rappelle en quelques lignes ce qu'est un second brain, et annonce la vérification (une minute environ).
2. **Vérification silencieuse** : Claude regarde ce qui est déjà en place.
  - Indispensable : Node en version 22.13 ou plus récente (le moteur qui fait tourner la recherche du brain), git (l'outil qui garde l'historique de vos fiches), et votre identité git (le nom et l'email qui signent chaque enregistrement).
  - En option : GitHub et Cloudflare (voir l'étape 5).
  - Si un brain existe déjà sur cet ordinateur, Claude le dit en une phrase et vous oriente vers `/brain:status` plutôt que vers une création.
3. **Installation de ce qui manque** : Claude dit en une phrase ce qu'il va installer et pourquoi, puis le fait.
  - Sous Windows, il installe lui-même ; l'application vous demande simplement votre accord à chaque étape.
  - Sur Mac, c'est vous qui installez et Claude qui guide : les installeurs demandent le mot de passe du Mac dans leur propre fenêtre, que Claude ne peut pas (et ne doit pas) saisir.
  - Sous Linux, Claude vous renvoie aux instructions officielles ; ce qui exige les droits d'administrateur est saisi par vous, jamais par lui.
4. **Votre identité** : s'il manque un nom ou un email, Claude vous les demande (vos habituels) et les enregistre. Il ne va pas plus loin tant que tout l'indispensable n'est pas en place.
5. **Les deux options** : présentées en deux lignes chacune, aucune ne bloque la suite.
  - GitHub (recommandé) : une copie privée en ligne de votre brain, avec son historique. La connexion se fait dans votre navigateur, avec un code à usage unique que Claude vous donne. Cela peut attendre que le brain soit créé.
  - Cloudflare (facultatif) : utile seulement pour rendre le brain lisible depuis le cloud, plus tard, avec `/brain:add-cloud`.
6. **Bilan et passage de relais** : un court tableau (prêt, option non réglée, manquant), puis Claude vérifie qu'il arrive à joindre le brain. Si tout répond, il vous propose de créer votre brain tout de suite avec `/brain:create`, ou plus tard.

## Ce que ça crée pour vous

- Un ordinateur prêt : Node et git installés ou mis à jour si nécessaire
- Votre **identité** (nom et email) enregistrée, pour signer les enregistrements du brain
- Si vous le choisissez, la connexion à **GitHub** et à **Cloudflare**
- Un **bilan** clair de ce qui est en place
- L'emplacement du plugin, noté pour la future sauvegarde du soir
- Aucun brain à ce stade : la création, c'est `/brain:create`

## Prérequis

- Claude Code (l'application de bureau ou la ligne de commande), avec le plugin Hypervibe Brain installé
- Une connexion internet, pour les installations
- Sous Windows : l'installateur d'applications de Windows (« App Installer », gratuit dans le Microsoft Store). S'il manque, Claude vous le dit, vous l'installez, puis vous relancez `/brain:start`.
- Sur Mac : le mot de passe de votre Mac, que les installeurs vous demanderont

## Astuces

{{callout:warning|Après une installation, quittez vraiment l'application}}
L'application Claude ne cherche Node qu'à son démarrage. Si Claude n'arrive pas à joindre le brain à la fin, il vous demande de quitter complètement l'application (sur Mac : menu Claude, Quitter, et pas seulement fermer la fenêtre), de la rouvrir, puis de relancer `/brain:start`.
{{/callout}}

{{callout:info|Sur Mac, préférez l'installeur officiel de Node}}
L'installeur officiel place Node là où l'application Claude le trouve. Avec Homebrew, il arrive que l'application ne le voie pas, même après un redémarrage : passer par l'installeur officiel règle en général le problème.
{{/callout}}

{{callout:tip|La création peut attendre}}
Répondre « plus tard » à la fin ne fait rien perdre. `/brain:create` démarre quand vous voulez, commence par une quinzaine de minutes de questions, et peut être interrompue puis reprise à n'importe quelle étape.
{{/callout}}
