# Meet Soundboard

Extension Chrome qui mixe des sons dans ton micro pendant un appel Google Meet. Rien à installer côté système : pas de micro virtuel, pas de BlackHole.

## Installation

1. Ouvre `chrome://extensions` (marche aussi sur Edge, Brave et Arc).
2. Active **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée** → choisis ce dossier `meet-soundboard`.
4. Recharge l'onglet Meet (ou ouvre-le après l'installation).

## Utilisation

- Clique sur l'icône de l'extension pendant l'appel → clique un son.
- Raccourcis dans l'onglet Meet : **Alt+Shift+1…9** joue le son n°1…9, **Alt+Shift+0** coupe tout.
- **Recherche Myinstants** (barre en haut) : tape un mot-clé puis Entrée. ▶ écoute le son dans la popup, **Ajouter** le met dans ta soundboard.
- **Ajouter un son** (dernière tuile) : importe tes mp3/wav/ogg. Ils sont gardés dans l'extension.
- **Renommer** (✎ au survol) : un emoji en début de nom devient l'image de la tuile, par exemple « 😱 FAAAH ».
- **Volume par son** (🔊 au survol) : retouche de 0 à 200 %, en plus du volume général.
- **M'entendre aussi** : tu entends les sons dans tes écouteurs en même temps que les autres.

## Comment ça marche

`inject.js` remplace `getUserMedia` dans la page Meet avant que Meet ne demande le micro. La piste audio rendue à Meet est un mix Web Audio : ton vrai micro + un bus où la soundboard joue ses sons. Meet envoie donc les deux aux participants.

Chaque son est normalisé au chargement (volume perçu ramené à environ -20 LUFS), et un limiteur sur la sortie des sons évite qu'ils saturent ou couvrent ta voix.

## Limites

- Si tu te mets en **muet dans Meet**, les sons sont muets aussi : ils passent par la même piste.
- L'extension doit être active **avant** que Meet ouvre le micro : recharge l'onglet après l'avoir installée.
- Si tu changes de micro dans les réglages Meet, il redemande le micro et le nouveau est branché automatiquement.
- La suppression de bruit de Meet peut atténuer certains sons (applaudissements, bruit blanc). Tu peux la couper dans Paramètres → Audio.

## Sons intégrés

Les 7 sons de base sont des fichiers de [Myinstants](https://www.myinstants.com), rangés dans `sounds/` :

| Son | Fichier d'origine |
|---|---|
| 🔔 Ding | `/media/sounds/ding-sound-effect_2.mp3` |
| 🎉 Tada | `/media/sounds/ta-da_yrvBrlS.mp3` |
| 🥁 Ba dum tss | `/media/sounds/ba-dum-tss_qBahvzN.mp3` |
| 📯 Airhorn | `/media/sounds/airhorn.mp3` (MLG Airhorn) |
| ❌ Buzzer | `/media/sounds/wrong-answer-buzzer.mp3` |
| 👏 Applause | `/media/sounds/applause-4.mp3` |
| 🦗 Crickets | `/media/sounds/awkward-cricket-sound-effect_YK6dDJG.mp3` |

Pour en changer un, remplace le fichier dans `sounds/` en gardant son nom, puis recharge l'extension.

## Licence

Le code est sous licence MIT (voir [LICENSE](LICENSE)). Les fichiers de `sounds/` viennent de Myinstants et n'en font pas partie : ils restent à leurs auteurs.
