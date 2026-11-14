# devloop.

**Moins de bruit. Plus de code.**

Prototype responsive d’un réseau social pour développeurs, entièrement en **HTML, CSS et JavaScript natif**. Aucun framework à installer, aucune API, aucun serveur applicatif ni compte requis.

## Lancer

Ouvrir `index.html` dans un navigateur récent, ou servir ce dossier avec n’importe quel hébergement statique. Tous les éléments visuels et toutes les polices sont inclus dans `assets/` : aucune ressource distante n’est nécessaire à l’interface.

## À essayer

- Parcourir le fil : « Pour toi », « Abonnements » et « À la une ».
- Filtrer par langage ou communauté.
- Publier une discussion, une question, un snippet ou un projet.
- Découvrir les projets, ajouter des étoiles et tester les petites démos intégrées.
- Aimer, commenter, enregistrer ou repartager une publication.
- Copier du code et des liens directs vers les publications.
- Rechercher des personnes, projets et publications avec **Ctrl + K / ⌘ K**.
- Suivre un profil, modifier son propre profil et retrouver ses favoris.
- Proposer un échange d’entraide et utiliser la messagerie de démonstration.
- Rejoindre le challenge du week-end.

## Données et limites

Les profils, publications initiales, statistiques et notifications sont fictifs. Les messages automatiques sont des réponses de démonstration, pas des échanges avec des personnes réelles.

Les publications, projets, favoris, abonnements, commentaires, étoiles, messages et modifications du profil sont enregistrés en `localStorage` sous la clé `devloop.frontend.v1`, lorsque le navigateur autorise ce stockage. Dans un aperçu sandboxé qui le bloque, les interactions fonctionnent en mémoire pendant la session.

Le snippet JavaScript intégré dispose d’un exemple local. Le code Python et les snippets personnalisés sont affichés et copiables, mais ne sont pas exécutés. Aucun code saisi par l’utilisateur n’est évalué. Les mini-démos des projets utilisent uniquement des données locales.

Pour remettre les données personnelles à zéro : supprimer la clé `devloop.frontend.v1` dans le stockage du navigateur.

## Fichiers

- `index.html` : structure de l’application, navigation et icônes SVG.
- `styles.css` : identité visuelle, composants et mises en page adaptatives.
- `app.js` : données de démonstration, vues, interactions et stockage local.
- `assets/` : illustrations SVG originales, portraits et polices locales.

Polices : **DM Sans** et **JetBrains Mono**, sous licence SIL Open Font License (voir `assets/fonts-LICENSE.txt`). Portraits d’illustration : Unsplash. Les noms et rôles de la démonstration ne désignent pas les personnes photographiées.
