(function (root) {
  'use strict';

  const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const MEAL_IDS = ['mon-dinner', 'tue-dinner', 'wed-dinner', 'thu-dinner', 'fri-dinner', 'sat-lunch', 'sat-dinner', 'sun-lunch', 'sun-dinner'];
  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const V3_FIELDS = ['recipeOverrides', 'deletedRecipeIds', 'ingredientAisles'];
  const recipes = typeof module !== 'undefined' && module.exports ? require('./recipe-core.js') : root.MenuRecipeCore;

  function dateKey(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getFullYear() < 1 || date.getFullYear() > 9999) {
      throw new Error('La date est invalide.');
    }
    return String(date.getFullYear()).padStart(4, '0') + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function parseDateKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new Error('La date doit être au format AAAA-MM-JJ.');
    }
    const parts = key.split('-').map(Number);
    const result = new Date(2000, 0, 1, 12, 0, 0, 0);
    result.setFullYear(parts[0], parts[1] - 1, parts[2]);
    if (parts[0] < 1 || dateKey(result) !== key) {
      throw new Error('La date « ' + key + ' » est invalide.');
    }
    return result;
  }

  function mondayKey(input = new Date()) {
    const source = typeof input === 'string' ? parseDateKey(input) : input;
    const date = parseDateKey(dateKey(source));
    date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    return dateKey(date);
  }

  function addDays(key, days) {
    if (!Number.isSafeInteger(days)) throw new Error('Le nombre de jours doit être un entier.');
    const date = parseDateKey(key);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function getSlots(weekKey) {
    const date = parseDateKey(weekKey);
    if (date.getDay() !== 1) throw new Error('La semaine doit commencer un lundi.');
    const slots = [];
    DAY_NAMES.forEach(function (dayName, dayIndex) {
      const day = addDays(weekKey, dayIndex);
      if (dayIndex > 4) {
        slots.push({ id: DAYS[dayIndex] + '-lunch', dayKey: day, dayName, mealLabel: 'Déjeuner', dayIndex });
      }
      slots.push({ id: DAYS[dayIndex] + '-dinner', dayKey: day, dayName, mealLabel: 'Dîner', dayIndex });
    });
    return slots;
  }

  function emptyWeek() { return { meals: {}, shopping: [], recipeChecks: {} }; }
  function emptyData() {
    return { app: 'a-table', version: 3, weeks: {}, recipes: [], recipeOverrides: [], deletedRecipeIds: [], ingredientAisles: {} };
  }

  function plainObject(value, label, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new Error(label + ' doit être un objet valide.');
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || DANGEROUS_KEYS.has(key) || !descriptor || !('value' in descriptor)) {
        throw new Error(label + ' contient une propriété interdite.');
      }
      if (allowed && !allowed.includes(key)) throw new Error(label + ' contient un champ inconnu : « ' + key + ' ».');
    }
  }

  function text(value, max, label, optional = false) {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string') throw new Error(label + ' doit être du texte.');
    if (value.length > max) throw new Error(label + ' dépasse ' + max + ' caractères.');
    return value;
  }

  function arrayEntries(array, label) {
    return Array.from({ length: array.length }, (_, index) => {
      const entry = Object.getOwnPropertyDescriptor(array, index);
      if (!entry || !('value' in entry)) throw new Error(label + ' contient une ligne invalide.');
      return entry.value;
    });
  }

  function normalizeRecipes(value, label = 'Le catalogue de recettes') {
    if (!Array.isArray(value)) throw new Error(label + ' doit être une liste.');
    if (value.length > 300) throw new Error(label + ' ne peut pas dépasser 300 recettes.');
    const ids = new Set();
    return arrayEntries(value, label).map(entry => {
      const recipe = recipes.normalizeRecipe(entry);
      if (ids.has(recipe.id)) throw new Error(label + ' contient un identifiant de recette en double.');
      ids.add(recipe.id);
      return recipe;
    });
  }

  function validIdentifier(id) {
    return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id) && !DANGEROUS_KEYS.has(id);
  }

  function normalizeDeletedRecipeIds(value) {
    if (!Array.isArray(value)) throw new Error('Les recettes retirées doivent être une liste.');
    if (value.length > 300) throw new Error('La liste des recettes retirées ne peut pas dépasser 300 identifiants.');
    const ids = arrayEntries(value, 'Les recettes retirées');
    if (ids.some(id => !validIdentifier(id))) throw new Error('Une recette retirée a un identifiant invalide.');
    if (new Set(ids).size !== ids.length) throw new Error('La liste des recettes retirées contient un identifiant en double.');
    return ids;
  }

  function normalizeIngredientAisles(value) {
    plainObject(value, 'Les rayons d’ingrédients');
    const aisles = new Set(recipes.AISLES.map(aisle => aisle.id));
    const entries = Object.entries(value);
    for (const [id, aisle] of entries) {
      if (!validIdentifier(id) || !aisles.has(aisle)) throw new Error('Un rayon d’ingrédient est invalide.');
    }
    return Object.fromEntries(entries);
  }

  function normalizeOptionalIndices(value, ingredients) {
    if (!Array.isArray(value) || value.length > ingredients.length) {
      throw new Error('La sélection d’ingrédients facultatifs est invalide.');
    }
    const indices = arrayEntries(value, 'La sélection d’ingrédients facultatifs');
    if (indices.some(index => !Number.isInteger(index) || ingredients[index]?.optional !== true) ||
        new Set(indices).size !== indices.length) {
      throw new Error('La sélection doit référencer des ingrédients facultatifs distincts de cette recette.');
    }
    return indices;
  }

  function normalizeRecipeChecks(value, week, allowEye) {
    plainObject(value, 'Les courses calculées');
    const checks = Object.entries(value);
    if (checks.length > 540) throw new Error('Une semaine ne peut pas dépasser 540 ingrédients calculés.');
    for (const [key, saved] of checks) {
      const match = /^([a-zA-Z0-9_-]{1,100})\|(g|ml|piece|eye)$/.exec(key);
      if (!match || !validIdentifier(match[1]) || (!allowEye && match[2] === 'eye')) {
        throw new Error('Une case de courses calculées a un identifiant invalide.');
      }
      const eyeOnly = match[2] === 'eye';
      if (typeof saved === 'number' || !allowEye) {
        if (eyeOnly || !Number.isFinite(saved) || saved <= 0 || saved > Number.MAX_SAFE_INTEGER) {
          throw new Error('La quantité cochée d’un ingrédient est invalide.');
        }
        continue;
      }
      plainObject(saved, 'Le besoin coché d’un ingrédient', ['quantity', 'atEye']);
      const { quantity, atEye } = saved;
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > Number.MAX_SAFE_INTEGER ||
          eyeOnly !== (quantity === 0) || !Number.isInteger(atEye) || atEye < 1 || atEye > 540) {
        throw new Error('La quantité cochée d’un ingrédient est invalide.');
      }
    }
    return recipes.reconcileChecks({ ...week, recipeChecks: value });
  }

  function normalizeBackup(input) {
    plainObject(input, 'La sauvegarde', ['app', 'version', 'weeks', 'recipes', ...V3_FIELDS]);
    if (input.app !== 'a-table') throw new Error('Ce fichier n’est pas une sauvegarde « À table ».');
    if (![1, 2, 3].includes(input.version)) throw new Error('Cette version de sauvegarde n’est pas prise en charge.');
    const legacy = input.version === 1;
    const current = input.version === 3;
    if (legacy && Object.hasOwn(input, 'recipes')) throw new Error('Une sauvegarde de version 1 ne contient pas de catalogue.');
    if (!current && V3_FIELDS.some(field => Object.hasOwn(input, field))) {
      throw new Error('Cette version de sauvegarde ne contient pas de personnalisation du catalogue fourni ni des rayons.');
    }
    plainObject(input.weeks, 'Les semaines');
    const entries = Object.entries(input.weeks);
    if (entries.length > 1000) throw new Error('La sauvegarde contient plus de 1 000 semaines.');
    const result = emptyData();
    if (!legacy) result.recipes = normalizeRecipes(input.recipes);
    if (current) {
      result.recipeOverrides = normalizeRecipes(input.recipeOverrides, 'Le catalogue de recettes personnalisées');
      result.deletedRecipeIds = normalizeDeletedRecipeIds(input.deletedRecipeIds);
      result.ingredientAisles = normalizeIngredientAisles(input.ingredientAisles);
    }
    for (const [key, week] of entries) {
      if (parseDateKey(key).getDay() !== 1) throw new Error('La semaine du ' + key + ' ne commence pas un lundi.');
      // Toute la semaine doit rester représentable avant d’accepter son contenu.
      getSlots(key);
      plainObject(week, 'La semaine du ' + key, legacy ? ['meals', 'shopping'] : ['meals', 'shopping', 'recipeChecks']);
      plainObject(week.meals, 'Les repas du ' + key, MEAL_IDS);
      if (!Array.isArray(week.shopping)) throw new Error('La liste de courses du ' + key + ' doit être une liste.');
      if (week.shopping.length > 300) throw new Error('Une liste de courses ne peut pas dépasser 300 articles.');
      const normalized = emptyWeek();
      for (const [id, meal] of Object.entries(week.meals)) {
        const fields = ['name', 'ingredients', 'note'];
        if (!legacy) fields.push('recipe', 'portions');
        if (current) fields.push('includedOptional');
        plainObject(meal, 'Le repas « ' + id + ' »', fields);
        const normalizedMeal = {
          name: text(meal.name, 200, 'Le nom du plat'),
          ingredients: text(meal.ingredients, 6000, 'Les ingrédients', true),
          note: text(meal.note, 3000, 'La note', true)
        };
        if (Object.hasOwn(meal, 'recipe') || Object.hasOwn(meal, 'portions')) {
          normalizedMeal.recipe = recipes.normalizeRecipe(meal.recipe);
          normalizedMeal.portions = recipes.normalizePortions(meal.portions);
        }
        if (Object.hasOwn(meal, 'includedOptional')) {
          normalizedMeal.includedOptional = normalizeOptionalIndices(meal.includedOptional, normalizedMeal.recipe?.ingredients ?? []);
        }
        normalized.meals[id] = normalizedMeal;
      }
      const ids = new Set();
      normalized.shopping = arrayEntries(week.shopping, 'La liste de courses').map(function (item) {
        plainObject(item, 'Un article de courses', ['id', 'name', 'quantity', 'checked']);
        const id = text(item.id, 100, 'L’identifiant de l’article');
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('L’identifiant d’un article est invalide.');
        if (ids.has(id)) throw new Error('La liste de courses contient un identifiant en double.');
        ids.add(id);
        const name = text(item.name, 200, 'Le nom de l’article');
        if (!name.trim()) throw new Error('Un article de courses doit avoir un nom.');
        if (typeof item.checked !== 'boolean') throw new Error('L’état acheté d’un article est invalide.');
        return { id, name, quantity: text(item.quantity, 100, 'La quantité', true), checked: item.checked };
      });
      if (!legacy) normalized.recipeChecks = normalizeRecipeChecks(week.recipeChecks, normalized, current);
      result.weeks[key] = normalized;
    }
    return result;
  }

  const api = Object.freeze({ dateKey, parseDateKey, mondayKey, addDays, getSlots, emptyWeek, emptyData, normalizeBackup });
  root.MenuCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
