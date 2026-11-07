# À table

Un planning de menus en français, sans compte ni installation : dîner du lundi au vendredi, déjeuner et dîner le samedi et le dimanche. Soit **9 repas par semaine**, avec une liste de courses propre à chaque semaine.

## Utiliser le site

- Changez de semaine avec les flèches, ou revenez à la semaine actuelle.
- Choisissez un repas pour renseigner son nom, ses ingrédients et une note facultative. Les changements enregistrés restent dans le navigateur.
- Complétez les courses manuellement, précisez les quantités et cochez les articles achetés.
- La duplication copie uniquement les menus vers la semaine choisie. Elle conserve les courses de la semaine de destination et demande confirmation avant de remplacer ses menus.
- L’effacement d’une semaine supprime ses menus et ses courses après confirmation.
- Utilisez l’impression pour obtenir une version papier du planning.

## Conserver une sauvegarde

Les menus et les courses sont enregistrés avec `localStorage`, dans **le navigateur et à l’adresse du site utilisés**. GitHub Pages héberge les fichiers du site et ne synchronise pas les données entre appareils. Un autre navigateur, la navigation privée, une autre adresse ou l’effacement des données du navigateur peuvent donner accès à un planning vide.

Exportez régulièrement une sauvegarde JSON. Pour la transférer sur un autre appareil, ouvrez le site sur cet appareil puis importez le fichier. **L’import remplace toutes les données locales, pour toutes les semaines, après confirmation.** Un fichier invalide est refusé.

## Ouvrir sur votre ordinateur

Pour un aperçu fiable, ouvrez un terminal dans ce dossier puis lancez :

```sh
python3 -m http.server 8000
```

Ouvrez ensuite [http://localhost:8000](http://localhost:8000). Arrêtez le serveur avec `Ctrl+C`.

Vous pouvez aussi ouvrir `index.html` par double-clic. Le comportement du stockage des fichiers locaux dépend du navigateur : le serveur local est recommandé pour vérifier la sauvegarde. Les données de cet aperçu ne seront pas automatiquement transférées vers l’adresse GitHub Pages ; utilisez l’export puis l’import.

## Publier sur GitHub Pages

1. Créez un dépôt GitHub et placez **le contenu de ce dossier à la racine du dépôt**, sur la branche `main`. `index.html` doit être directement visible à la racine : ne déposez pas seulement l’archive ZIP ou le dossier parent.
2. Ajoutez les fichiers `index.html`, `styles.css`, `core.js`, `app.js`, `favicon.svg`, `README.md` et le fichier caché `.nojekyll`. Aucun build ni dépendance n’est nécessaire.
3. Dans le dépôt, ouvrez **Settings → Pages**.
4. Sous **Build and deployment**, choisissez **Deploy from a branch**.
5. Sélectionnez la branche **main**, le dossier **/(root)**, puis **Save**.
6. Attendez la fin de la publication, puis utilisez l’adresse affichée dans la page **Pages** du dépôt. Pour un dépôt de projet standard, elle prend la forme `https://<votre-compte>.github.io/<votre-depot>/`.

Les chemins des fichiers sont relatifs : le site fonctionne aussi dans le sous-dossier d’un dépôt. Pour le mettre à jour, remplacez les fichiers dans la même branche. Les fichiers de sauvegarde personnels n’ont pas à être ajoutés au dépôt.

La publication depuis une branche et les noms des réglages sont décrits dans la [documentation officielle de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Vérification rapide après publication

Créez un dîner, actualisez la page et vérifiez qu’il est conservé. Changez de semaine puis revenez. Ajoutez une course, exportez une sauvegarde et vérifiez les confirmations avant un import ou une duplication sur une semaine déjà remplie. Vérifiez aussi l’affichage sur téléphone et l’aperçu avant impression.
