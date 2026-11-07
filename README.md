# À table

Un carnet de recettes et de menus en français qui fonctionne dans le navigateur. Planifiez **9 repas par semaine**, avec le dîner du lundi au vendredi, le déjeuner et le dîner le week-end, et une liste de courses pour chaque semaine.

## Utiliser le site

- Changez de semaine avec les flèches, ou revenez à la semaine actuelle.
- Ouvrez **Recettes** pour rechercher un plat ou un ingrédient et parcourir le catalogue par complexité. Activez **Mes recettes** pour afficher vos créations.
- **Créer une recette** permet de saisir les portions de référence, les ingrédients et les étapes. Laissez la quantité vide pour cuisiner **à l’œil**. Choisissez les ingrédients suggérés pour réutiliser leur rayon et additionner leurs quantités compatibles.
- **Modifier**, **Supprimer** et **Dupliquer** sont disponibles sur les recettes personnelles et les recettes fournies. Une suppression du catalogue est enregistrée après confirmation. Le filtre **Mes recettes** affiche vos créations.
- Ouvrez un repas, puis **Choisir une recette**. Ajustez les portions, cochez les ingrédients facultatifs que vous souhaitez utiliser et enregistrez le menu. La saisie libre reste disponible.
- Les courses calculées sont regroupées par rayon. Les ingrédients marqués **Principal** apparaissent en tête de leur rayon. Les quantités à l’œil sont indiquées à côté des quantités chiffrées pour le même ingrédient. Les ajouts manuels restent dans leur propre liste.
- Les coches suivent le besoin de chaque ingrédient. Une hausse de la quantité ou un usage supplémentaire à l’œil retire la coche. Un changement de rayon ou de priorité conserve la coche.
- La duplication copie les menus vers la semaine choisie et recalcule leurs courses. Elle conserve les ajouts manuels de destination et demande confirmation avant de remplacer ses menus.
- L’effacement d’une semaine supprime ses menus et ses courses après confirmation.
- Utilisez l’impression pour obtenir une version papier du planning.

## Classement des recettes

Le niveau est une estimation locale basée sur les ingrédients distincts et le texte des étapes.

- **Simple** jusqu’à 5 ingrédients et 4 étapes, avec un déroulé direct.
- **Complexe** à partir de 10 ingrédients si les étapes indiquent des préparations simultanées ou une préparation séparée suivie d’un assemblage.
- **Intermédiaire** dans les autres cas.

Le catalogue fourni est dans `recipes.js`. Les recettes ajoutées depuis l’interface restent dans la sauvegarde du navigateur. Le planning conserve une copie des ingrédients et des étapes de chaque recette choisie, même si la fiche du catalogue est modifiée ou supprimée ensuite.

## Conserver une sauvegarde

Les menus, les courses et les recettes personnelles sont enregistrés dans **le navigateur et à l’adresse du site utilisés**. GitHub Pages héberge les fichiers du site et ne synchronise pas les données entre appareils. Un autre navigateur, la navigation privée, une autre adresse ou l’effacement des données du navigateur peuvent donner accès à un planning vide.

Exportez une sauvegarde JSON pour transférer le carnet sur un autre appareil. Elle inclut vos recettes, les modifications et suppressions du catalogue, les rayons, les menus et les courses. **L’import remplace le carnet après confirmation.** Les anciennes sauvegardes restent importables avec leurs menus et leurs courses. Un fichier invalide est refusé.

## Ouvrir sur votre ordinateur

Ouvrez `index.html` par double-clic dans votre navigateur. Les recettes, le planning et les courses fonctionnent à partir des fichiers du site. Le comportement du stockage des fichiers locaux dépend du navigateur. Exportez votre carnet avec **Sauvegardes** pour le retrouver dans un autre navigateur ou à une autre adresse.

## Publier sur GitHub Pages

1. Placez **les fichiers publics du site à la racine du dépôt**, sur la branche `main`. `index.html` doit être directement visible à la racine.
2. Ajoutez `index.html`, les styles `.css`, les scripts `.js`, `favicon.svg`, `README.md` et le fichier caché `.nojekyll`.
3. Dans le dépôt, ouvrez **Settings → Pages**.
4. Sous **Build and deployment**, choisissez **Deploy from a branch**.
5. Sélectionnez la branche **main**, le dossier **/(root)**, puis **Save**.
6. Attendez la fin de la publication, puis utilisez l’adresse affichée dans la page **Pages** du dépôt. Pour un dépôt de projet standard, elle prend la forme `https://<votre-compte>.github.io/<votre-depot>/`.

Les chemins des fichiers sont relatifs : le site fonctionne aussi dans le sous-dossier d’un dépôt. Pour le mettre à jour, remplacez les fichiers dans la même branche. Les fichiers de sauvegarde personnels n’ont pas à être ajoutés au dépôt.

La publication depuis une branche et les noms des réglages sont décrits dans la [documentation officielle de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Vérification rapide après publication

Planifiez une recette avec un ingrédient à l’œil et un ingrédient facultatif. Ajustez les portions et vérifiez les quantités, puis cochez le facultatif pour l’ajouter aux courses. Modifiez ou supprimez ensuite une recette fournie et vérifiez que les repas qui la contiennent gardent leur copie après rechargement.
