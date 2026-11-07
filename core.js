(function (root) {
  'use strict';

  const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const MEAL_IDS = ['mon-dinner', 'tue-dinner', 'wed-dinner', 'thu-dinner', 'fri-dinner', 'sat-lunch', 'sat-dinner', 'sun-lunch', 'sun-dinner'];
  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

  function emptyWeek() { return { meals: {}, shopping: [] }; }
  function emptyData() { return { app: 'a-table', version: 1, weeks: {} }; }

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

  function normalizeBackup(input) {
    plainObject(input, 'La sauvegarde', ['app', 'version', 'weeks']);
    if (input.app !== 'a-table') throw new Error('Ce fichier n’est pas une sauvegarde « À table ».');
    if (input.version !== 1) throw new Error('Cette version de sauvegarde n’est pas prise en charge.');
    plainObject(input.weeks, 'Les semaines');
    const entries = Object.entries(input.weeks);
    if (entries.length > 1000) throw new Error('La sauvegarde contient plus de 1 000 semaines.');
    const result = emptyData();
    for (const [key, week] of entries) {
      if (parseDateKey(key).getDay() !== 1) throw new Error('La semaine du ' + key + ' ne commence pas un lundi.');
      // Toute la semaine doit rester représentable avant d’accepter son contenu.
      getSlots(key);
      plainObject(week, 'La semaine du ' + key, ['meals', 'shopping']);
      plainObject(week.meals, 'Les repas du ' + key, MEAL_IDS);
      if (!Array.isArray(week.shopping)) throw new Error('La liste de courses du ' + key + ' doit être une liste.');
      if (week.shopping.length > 300) throw new Error('Une liste de courses ne peut pas dépasser 300 articles.');
      const normalized = emptyWeek();
      for (const [id, meal] of Object.entries(week.meals)) {
        plainObject(meal, 'Le repas « ' + id + ' »', ['name', 'ingredients', 'note']);
        normalized.meals[id] = {
          name: text(meal.name, 200, 'Le nom du plat'),
          ingredients: text(meal.ingredients, 6000, 'Les ingrédients', true),
          note: text(meal.note, 3000, 'La note', true)
        };
      }
      const ids = new Set();
      normalized.shopping = week.shopping.map(function (item) {
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
      result.weeks[key] = normalized;
    }
    return result;
  }

  const api = Object.freeze({ dateKey, parseDateKey, mondayKey, addDays, getSlots, emptyWeek, emptyData, normalizeBackup });
  root.MenuCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
