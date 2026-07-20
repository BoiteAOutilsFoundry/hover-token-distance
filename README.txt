HOVER TOKEN DISTANCE — VERSION 0.1.0
Compatible exclusivement avec Foundry VTT 12.x

INSTALLATION
1. Fermez Foundry VTT.
2. Copiez le dossier « hover-token-distance » dans :
   <dossier de données Foundry>/Data/modules/
3. Vérifiez que le chemin final est :
   Data/modules/hover-token-distance/module.json
4. Redémarrez Foundry.
5. Chargez votre monde, ouvrez « Gérer les modules » et activez
   « Hover Token Distance ».

UTILISATION
1. Sélectionnez votre token par un clic gauche.
2. Survolez un autre token.
3. La distance apparaît au-dessus du token survolé.

Le module utilise la règle de distance configurée par la scène.
Si aucun token n'est sélectionné, il tente d'utiliser l'unique token actif
associé au personnage assigné à votre utilisateur.

LIMITES DE CETTE PREMIÈRE VERSION
- Mesure en deux dimensions : l'élévation n'est pas intégrée.
- Si plusieurs tokens sont sélectionnés, aucun résultat n'est affiché.
- Ce module n'a pas encore été exécuté dans votre installation précise ;
  il s'agit de la première version de test.

DIAGNOSTIC
En cas de problème, ouvrez les outils développeur avec F12, onglet Console,
et cherchez une ligne commençant par : hover-token-distance
