(function (root) {
  'use strict';

  const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const UNITS = new Map([
    ['g', { base: 'g', factor: 1, label: 'g' }],
    ['kg', { base: 'g', factor: 1000, label: 'kg' }],
    ['ml', { base: 'ml', factor: 1, label: 'ml' }],
    ['l', { base: 'ml', factor: 1000, label: 'L' }],
    ['piece', { base: 'piece', factor: 1, label: 'pièce' }],
    ['cac', { base: 'ml', factor: 5, label: 'c. à café' }],
    ['cas', { base: 'ml', factor: 15, label: 'c. à soupe' }]
  ]);
  const BASE_UNITS = ['g', 'ml', 'piece'];
  const AISLES = Object.freeze([
    { id: 'produce', label: 'Fruits et légumes' },
    { id: 'protein', label: 'Viandes, poissons et œufs' },
    { id: 'fresh', label: 'Produits frais' },
    { id: 'pantry', label: 'Épicerie' },
    { id: 'other', label: 'Autres' },
    { id: 'seasoning', label: 'Assaisonnements' }
  ].map(Object.freeze));
  const AISLE_RANK = new Map(AISLES.map(({ id }, index) => [id, index]));
  const DEFAULT_AISLES = new Map(Object.entries({
    produce: [
      'concombre', 'tomate', 'tomate-cerise', 'citron', 'citron-vert', 'epinards', 'courgette',
      'oignon', 'oignon-rouge', 'oignon-jaune', 'oignon-blanc', 'ail', 'gousse-ail', 'echalote',
      'persil', 'patate-douce', 'pomme-de-terre', 'haricot-vert', 'champignon', 'champignon-paris',
      'chou-blanc', 'carotte', 'poivron', 'poivron-rouge', 'poireau'
    ],
    protein: ['oeuf', 'poulet', 'boeuf-hache', 'colin'],
    fresh: ['feta', 'beurre', 'lait', 'creme-liquide', 'parmesan', 'gnocchi', 'mozzarella', 'yaourt-nature'],
    pantry: [
      'semoule', 'pois-chiches-cuits', 'riz-basmati', 'lentille-corail', 'tomate-concassee', 'lait-coco',
      'chapelure', 'pates', 'nouilles-ble', 'haricot-rouge-cuit', 'mais-cuit', 'tortilla', 'thon-nature'
    ],
    seasoning: [
      'huile-olive', 'huile-d-olive', 'huile-colza', 'sel', 'poivre', 'paprika', 'cumin', 'curry',
      'sauce-soja', 'vinaigre-riz', 'sesame', 'origan', 'moutarde-dijon'
    ]
  }).flatMap(([aisle, ids]) => ids.map(id => [id, aisle])));
  const ALIASES = new Map([
    ['oignons', 'oignon'], ['oignons-rouges', 'oignon-rouge'],
    ['oignons-jaunes', 'oignon-jaune'], ['oignons-blancs', 'oignon-blanc'],
    ['oeufs', 'oeuf'], ['oeufs-entiers', 'oeuf'], ['oeuf-entier', 'oeuf'],
    ['tomates', 'tomate'], ['tomates-cerises', 'tomate-cerise'],
    ['tomates-concassees', 'tomate-concassee'],
    ['carottes', 'carotte'], ['courgettes', 'courgette'], ['poivrons', 'poivron'],
    ['champignons', 'champignon'], ['citrons', 'citron'], ['echalotes', 'echalote'],
    ['pommes-de-terre', 'pomme-de-terre'], ['huile-olive', 'huile-d-olive'],
    ['gousse-d-ail', 'ail'], ['gousses-d-ail', 'ail'], ['gousse-ail', 'ail'],
    ['sel-fin', 'sel'], ['poivre-moulu', 'poivre']
  ]);
  const frenchNumbers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const tinyNumbers = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 2 });
  const frenchSort = new Intl.Collator('fr-FR', { sensitivity: 'base' });

  function objectFields(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new Error(label + ' doit être un objet valide.');
    }
    for (const key of Reflect.ownKeys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key) || !property || !('value' in property)) {
        throw new Error(label + ' contient une propriété interdite.');
      }
      if (!allowed.includes(key)) throw new Error(label + ' contient un champ inconnu : « ' + key + ' ».');
    }
  }

  function nonemptyText(value, limit, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' doit être renseigné.');
    if (value.length > limit) throw new Error(label + ' dépasse ' + limit + ' caractères.');
    return value.trim();
  }

  function validId(value, label) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value) || FORBIDDEN_KEYS.has(value)) {
      throw new Error(label + ' est invalide.');
    }
    return value;
  }

  function readRows(value, label) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 60) {
      throw new Error(label + ' doit contenir entre 1 et 60 lignes.');
    }
    return Array.from({ length: value.length }, (_, index) => {
      const property = Object.getOwnPropertyDescriptor(value, index);
      if (!property || !('value' in property)) throw new Error(label + ' contient une ligne invalide.');
      return property.value;
    });
  }

  function normalizePortions(portions) {
    if (!Number.isInteger(portions) || portions < 1 || portions > 99) {
      throw new Error('Le nombre de portions doit être un entier entre 1 et 99.');
    }
    return portions;
  }

  function defaultAisle(id) { return DEFAULT_AISLES.get(id) || 'other'; }

  function ingredientAisle(line, ingredientAisles) {
    const assigned = Object.hasOwn(ingredientAisles, line.id) ? ingredientAisles[line.id] : undefined;
    return AISLE_RANK.has(assigned) ? assigned : line.aisle;
  }

  function normalizeRecipe(recipe) {
    objectFields(recipe, ['id', 'name', 'servings', 'ingredients', 'steps'], 'La recette');
    const id = validId(recipe.id, 'L’identifiant de la recette');
    const name = nonemptyText(recipe.name, 200, 'Le nom de la recette');
    const servings = normalizePortions(recipe.servings);
    const ingredients = readRows(recipe.ingredients, 'La liste des ingrédients').map(normalizeIngredient);
    const steps = readRows(recipe.steps, 'La préparation').map(step => nonemptyText(step, 1000, 'Une étape de préparation'));
    return { id, name, servings, ingredients, steps };
  }

  function normalizeIngredient(line) {
    objectFields(line, ['id', 'name', 'quantity', 'unit', 'aisle', 'optional', 'principal'], 'Un ingrédient');
    const id = validId(line.id, 'L’identifiant de l’ingrédient');
    const name = nonemptyText(line.name, 200, 'Le nom de l’ingrédient');
    const { quantity, unit } = line;
    if (quantity === null) {
      if (unit !== null) throw new Error('Un ingrédient dosé à l’œil ne doit pas avoir d’unité.');
    } else {
      if (!Number.isFinite(quantity) || quantity < 0.000001 || quantity > 1000000) {
        throw new Error('La quantité d’un ingrédient doit être comprise entre 0,000001 et 1 000 000.');
      }
      if (!UNITS.has(unit)) throw new Error('L’unité d’un ingrédient est inconnue.');
    }
    const aisle = Object.hasOwn(line, 'aisle') ? line.aisle : defaultAisle(id);
    const optional = Object.hasOwn(line, 'optional') ? line.optional : false;
    const principal = Object.hasOwn(line, 'principal') ? line.principal : false;
    if (!AISLE_RANK.has(aisle)) throw new Error('Le rayon d’un ingrédient est inconnu.');
    if (typeof optional !== 'boolean' || typeof principal !== 'boolean') {
      throw new Error('Les indicateurs facultatif et principal d’un ingrédient doivent être booléens.');
    }
    return { id, name, quantity, unit, aisle, optional, principal };
  }

  function scaleIngredients(recipe, portions) {
    const source = normalizeRecipe(recipe);
    const factor = normalizePortions(portions) / source.servings;
    return source.ingredients.map(line => ({ ...line, quantity: line.quantity === null ? null : line.quantity * factor }));
  }

  function formatQuantity(quantity, unit) {
    if (quantity === null && unit === null) return 'À l’œil';
    if (!Number.isFinite(quantity) || quantity < 0 || !UNITS.has(unit)) throw new Error('La quantité ou l’unité est invalide.');
    const formatter = quantity > 0 && quantity < 0.01 ? tinyNumbers : frenchNumbers;
    const label = unit === 'piece' && quantity >= 2 ? 'pièces' : UNITS.get(unit).label;
    return formatter.format(quantity) + ' ' + label;
  }

  function fold(text) {
    return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  }

  function ingredientKey(name) {
    if (typeof name !== 'string') return '';
    const key = fold(name).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return ALIASES.get(key) || key;
  }

  function byName(a, b) {
    return frenchSort.compare(a.name, b.name) || a.id.localeCompare(b.id);
  }

  function ingredientRegistry(recipes, ingredientAisles = {}) {
    const registry = new Map();
    for (const recipe of recipes) {
      for (const line of normalizeRecipe(recipe).ingredients) {
        if (!registry.has(line.id)) registry.set(line.id, { id: line.id, name: line.name, aisle: ingredientAisle(line, ingredientAisles) });
      }
    }
    return Array.from(registry.values()).sort(byName);
  }

  function suggestIngredients(query, registry) {
    const key = ingredientKey(query);
    if (!key) return [];
    const tokens = key.split('-');
    const ranked = [];
    for (const item of registry) {
      const candidate = ingredientKey(item.name);
      let rank;
      if (candidate === key) rank = 0;
      else if (candidate.startsWith(key)) rank = 1;
      else if (tokens.every(token => candidate.split('-').some(word => word.startsWith(token)))) rank = 2;
      else if (candidate.includes(key)) rank = 3;
      else continue;
      ranked.push({ item, rank });
    }
    return ranked.sort((a, b) => a.rank - b.rank || byName(a.item, b.item))
      .map(({ item }) => ({ id: item.id, name: item.name, aisle: item.aisle ?? defaultAisle(item.id) }));
  }

  function classify(recipe) {
    const source = normalizeRecipe(recipe);
    const ingredientCount = new Set(source.ingredients.map(line => line.id)).size;
    const steps = source.steps.map(fold);
    const simultaneous = /\b(?:en parallele|pendant ce temps|pendant que|en meme temps|simultanement)\b/.test(steps.join(' '));
    const separateCue = /\b(?:separement|a part|dans (?:une?|la|le) (?:autre|seconde?|deuxieme) (?:poele|casserole|bol|saladier|recipient|faitout))\b/;
    const assembleCue = /\b(?:assembl\w*|incorpor\w*|reuni\w*|melang\w*|remett\w*|rassembl\w*)\b/;
    const separateStep = steps.findIndex(step => separateCue.test(step));
    const assembledLater = separateStep >= 0 && steps.slice(separateStep + 1).some(step => assembleCue.test(step));
    const afterSeparation = separateStep < 0 ? '' : steps[separateStep].split(separateCue).slice(1).join(' ');
    const joinedInStep = afterSeparation.split(/\b(?:puis|ensuite|enfin)\b/).slice(1).some(step => assembleCue.test(step));
    const coordinated = simultaneous || assembledLater || joinedInStep;

    // Simple : 5 ingrédients distincts et 4 étapes au maximum, sans coordination.
    // Complexe : au moins 10 ingrédients distincts et des préparations
    // simultanées ou une préparation séparée suivie d’un assemblage.
    // Les autres recettes sont intermédiaires.
    if (ingredientCount >= 10 && coordinated) return { key: 'complex', label: 'Complexe' };
    if (ingredientCount <= 5 && steps.length <= 4 && !coordinated) return { key: 'simple', label: 'Simple' };
    return { key: 'intermediate', label: 'Intermédiaire' };
  }

  function checkNeed(row) {
    return row.atEye > 0 ? { quantity: row.quantity ?? 0, atEye: row.atEye } : row.quantity;
  }

  function needCovered(row, saved) {
    const quantity = typeof saved === 'number' ? saved : saved?.quantity;
    const atEye = typeof saved === 'number' ? 0 : saved?.atEye;
    return Number.isFinite(quantity) && Number.isInteger(atEye) &&
      quantity >= (row.quantity ?? 0) && atEye >= row.atEye;
  }

  function groceries(week, ingredientAisles = {}) {
    const totals = new Map();
    const principalIds = new Set();
    for (const meal of Object.values(week.meals)) {
      if (!meal.recipe) continue;
      const included = new Set(meal.includedOptional ?? []);
      const lines = scaleIngredients(meal.recipe, meal.portions);
      for (const [index, line] of lines.entries()) {
        if (line.optional && !included.has(index)) continue;
        if (line.principal) principalIds.add(line.id);
        const conversion = UNITS.get(line.unit);
        const unit = conversion?.base ?? null;
        const key = line.id + '|' + (unit ?? 'eye');
        if (!totals.has(key)) {
          totals.set(key, {
            key, id: line.id, name: line.name, quantity: unit === null ? null : 0, unit,
            aisle: ingredientAisle(line, ingredientAisles), atEye: 0
          });
        }
        const row = totals.get(key);
        if (unit === null) row.atEye++;
        else row.quantity += line.quantity * conversion.factor;
      }
    }

    for (const row of totals.values()) {
      if (row.unit !== null) continue;
      // Un usage à l’œil accompagne une seule ligne mesurée du même produit.
      // L’ordre fixe évite que le rattachement dépende de l’ordre des repas.
      const quantified = BASE_UNITS.map(unit => totals.get(row.id + '|' + unit)).find(Boolean);
      if (quantified) {
        quantified.atEye = row.atEye;
        totals.delete(row.key);
      }
    }

    return Array.from(totals.values(), row => {
      // Stabilise les résidus de calcul à virgule flottante. L’arrondi de
      // présentation reste dans formatQuantity, après le cumul des repas.
      const quantity = row.quantity === null ? null : Number(row.quantity.toPrecision(14));
      const total = { ...row, quantity, principal: principalIds.has(row.id) };
      return { ...total, checked: needCovered(total, week.recipeChecks?.[row.key]) };
    }).sort((a, b) => AISLE_RANK.get(a.aisle) - AISLE_RANK.get(b.aisle) ||
      Number(b.principal) - Number(a.principal) || byName(a, b) || BASE_UNITS.indexOf(a.unit) - BASE_UNITS.indexOf(b.unit));
  }

  function reconcileChecks(week, ingredientAisles = {}) {
    const checks = {};
    for (const row of groceries(week, ingredientAisles)) {
      if (row.checked) checks[row.key] = checkNeed(row);
    }
    return checks;
  }

  const api = Object.freeze({ AISLES, defaultAisle, normalizeRecipe, normalizePortions, scaleIngredients, formatQuantity,
    ingredientKey, ingredientRegistry, suggestIngredients, classify, groceries, checkNeed, reconcileChecks });
  root.MenuRecipeCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
