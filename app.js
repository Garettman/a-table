/* À table — application statique, sans dépendance ni connexion à un serveur. */
(function () {
  'use strict';
  const C = window.MenuCore;
  const R = window.MenuRecipeCore;
  const suppliedRecipes = window.MenuRecipes.map((recipe) => R.normalizeRecipe(recipe));
  const suppliedRecipeIds = new Set(suppliedRecipes.map((recipe) => recipe.id));
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  // Keep the previous key so that existing local plans can migrate on read.
  const storageKey = 'a-table:v1:' + new URL('.', document.baseURI).pathname;
  const currentWeek = () => C.mondayKey(new Date());
  const dateLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
  let selectedWeek = currentWeek();
  let data = C.emptyData();
  let corruptRaw = null;
  let storageCorrupt = false;
  let storageConflict = false;
  let unsaved = false;
  let editingSlot = null;
  let editingWeek = null;
  let draftRecipe = null;
  let draftOptional = new Set();
  let toastTimer;
  let confirmResolver = null;

  function icon(name, className = 'icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function weekLabel(key) {
    const start = C.parseDateKey(key);
    const end = C.parseDateKey(C.addDays(key, 6));
    if (start.getFullYear() !== end.getFullYear()) {
      const format = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      return format.format(start) + ' – ' + format.format(end);
    }
    if (start.getMonth() !== end.getMonth()) return dateLong.format(start) + ' – ' + dateLong.format(end) + ' ' + end.getFullYear();
    return start.getDate() + ' – ' + dateLong.format(end) + ' ' + end.getFullYear();
  }

  function readWeek(key = selectedWeek) { return data.weeks[key] || C.emptyWeek(); }
  function writableWeek(key = selectedWeek) {
    if (!data.weeks[key]) {
      if (Object.keys(data.weeks).length >= 1000) throw new Error('Le carnet contient déjà 1 000 semaines. Exportez une sauvegarde avant d’en retirer une.');
      data.weeks[key] = C.emptyWeek();
    }
    return data.weeks[key];
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4800);
  }

  function warnStorage(message) {
    $('storage-message').textContent = message;
    $('storage-warning').hidden = false;
    $('save-state').classList.add('unsaved');
    $('save-label').textContent = 'Modifications non sauvegardées';
    $('recover-button').hidden = corruptRaw === null;
    $('reset-storage-button').hidden = !storageCorrupt || storageConflict;
    $('retry-storage-button').hidden = storageCorrupt || storageConflict;
    $('reload-button').hidden = !storageConflict;
  }

  function persist() {
    unsaved = true;
    if (storageConflict) {
      warnStorage('Un autre onglet a modifié ce carnet. Vos changements restent en mémoire pour éviter d’écraser les siens. Exportez-les, puis rechargez le carnet.');
      return false;
    }
    if (storageCorrupt) {
      warnStorage('La sauvegarde existante est illisible et a été conservée. Vos nouveaux changements restent en mémoire. Récupérez le fichier existant, puis réinitialisez le stockage ou importez une sauvegarde.');
      return false;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      unsaved = false;
      corruptRaw = null;
      $('storage-warning').hidden = true;
      $('save-state').classList.remove('unsaved');
      $('save-label').textContent = 'Enregistré sur cet appareil';
      return true;
    } catch (error) {
      warnStorage('Le navigateur ne permet pas la sauvegarde ou son espace est plein. Vos changements restent en mémoire pour le moment. Exportez une sauvegarde avant de fermer cette page.');
      return false;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        try {
          data = normalizeNotebook(JSON.parse(raw));
          $('save-label').textContent = 'Enregistré sur cet appareil';
        } catch (error) {
          corruptRaw = raw;
          storageCorrupt = true;
          warnStorage('La sauvegarde locale est illisible. Elle n’a pas été modifiée. Vous pouvez récupérer son fichier, importer une sauvegarde ou réinitialiser le stockage.');
        }
      }
    } catch (error) {
      warnStorage('La sauvegarde dans ce navigateur est indisponible. Vous pouvez utiliser le carnet, puis exporter vos données avant de quitter la page.');
    }
  }

  function ingredientDescription(ingredient) {
    return ingredient.name + ' — ' + R.formatQuantity(ingredient.quantity, ingredient.unit);
  }

  function ingredientLines(lines, included) {
    return lines.filter((line, index) => !line.optional || included.has(index)).map(ingredientDescription);
  }

  function mealIngredientLines(meal) {
    return ingredientLines(R.scaleIngredients(meal.recipe, meal.portions), new Set(meal.includedOptional));
  }

  function getRecipes() {
    const overrides = new Map(data.recipeOverrides.map((recipe) => [recipe.id, recipe]));
    const deleted = new Set(data.deletedRecipeIds);
    const supplied = suppliedRecipes.filter((recipe) => !deleted.has(recipe.id))
      .map((recipe) => overrides.get(recipe.id) || recipe);
    return [...supplied, ...data.recipes];
  }

  function getIngredientAisles() { return data.ingredientAisles; }

  function normalizeNotebook(raw) {
    const notebook = C.normalizeBackup(raw);
    const usedIds = new Set([...suppliedRecipeIds, ...notebook.recipes.map((recipe) => recipe.id)]);
    let sequence = 0;
    for (const recipe of notebook.recipes) {
      if (!suppliedRecipeIds.has(recipe.id)) continue;
      // Older imports could use a supplied recipe's ID for a personal recipe.
      let id;
      do { id = 'custom-import-' + (++sequence); } while (usedIds.has(id));
      recipe.id = id;
      usedIds.add(id);
    }
    return notebook;
  }

  function isPersonalRecipe(id) {
    return !suppliedRecipeIds.has(id) && data.recipes.some((recipe) => recipe.id === id);
  }

  function saveRecipe(recipe, { replace = false } = {}) {
    const normalized = R.normalizeRecipe(recipe);
    const supplied = suppliedRecipeIds.has(normalized.id);
    const exists = getRecipes().some((entry) => entry.id === normalized.id);
    if (replace && !exists) throw new Error('Cette recette ne figure plus dans le catalogue.');
    if (!replace && (exists || supplied)) {
      throw new Error('Cette recette existe déjà dans votre catalogue.');
    }

    let recipes = data.recipes;
    let recipeOverrides = data.recipeOverrides;
    if (supplied) {
      recipeOverrides = [...recipeOverrides.filter((entry) => entry.id !== normalized.id), normalized];
    } else if (replace) {
      recipes = recipes.map((entry) => entry.id === normalized.id ? normalized : entry);
    } else {
      recipes = [...recipes, normalized];
    }

    const previousAisles = getIngredientAisles();
    const ingredientAisles = { ...previousAisles };
    for (const line of normalized.ingredients) {
      const previous = Object.hasOwn(previousAisles, line.id) ? previousAisles[line.id] : R.defaultAisle(line.id);
      if (line.aisle !== previous) ingredientAisles[line.id] = line.aisle;
    }
    const validated = C.normalizeBackup({
      ...C.emptyData(), recipes, recipeOverrides, ingredientAisles, deletedRecipeIds: data.deletedRecipeIds
    });
    data.recipes = validated.recipes;
    data.recipeOverrides = validated.recipeOverrides;
    data.ingredientAisles = validated.ingredientAisles;
    const saved = persist();
    renderShopping();
    return saved;
  }

  async function deleteRecipe(id) {
    const recipe = getRecipes().find((entry) => entry.id === id);
    if (!recipe) throw new Error('Cette recette ne figure plus dans le catalogue.');
    const confirmed = await requestConfirm(
      'Supprimer cette recette ?',
      '« ' + recipe.name + ' » sera retirée du catalogue. Les repas déjà planifiés gardent leur recette et leurs courses.',
      'Supprimer la recette'
    );
    if (!confirmed) return null;
    if (suppliedRecipeIds.has(id)) {
      const validated = C.normalizeBackup({
        ...C.emptyData(),
        deletedRecipeIds: [...data.deletedRecipeIds, id],
        recipeOverrides: data.recipeOverrides.filter((entry) => entry.id !== id)
      });
      data.deletedRecipeIds = validated.deletedRecipeIds;
      data.recipeOverrides = validated.recipeOverrides;
    } else {
      data.recipes = data.recipes.filter((entry) => entry.id !== id);
    }
    return persist();
  }

  function renderMeal(slot, week) {
    const meal = week.meals[slot.id];
    const filled = Boolean(meal && meal.name.trim());
    const button = element('button', 'meal-slot' + (filled ? ' filled' : ' empty'));
    button.type = 'button';
    button.dataset.slotId = slot.id;
    button.setAttribute('aria-label', (filled ? 'Modifier' : 'Prévoir') + ' le ' + slot.mealLabel.toLowerCase() + ' du ' + slot.dayName.toLowerCase() + ' ' + dateLong.format(C.parseDateKey(slot.dayKey)) + (filled ? ' : ' + meal.name : ''));
    button.append(element('span', 'meal-type', slot.mealLabel));
    if (filled) {
      button.append(element('span', 'meal-name', meal.name));
      const ingredients = meal.recipe ? mealIngredientLines(meal).join('\n') : meal.ingredients;
      if (meal.recipe) {
        const portions = meal.portions + (meal.portions === 1 ? ' portion' : ' portions');
        button.append(element('span', 'meal-recipe-meta', portions + ' · ' + R.classify(meal.recipe).label));
      }
      if (ingredients.trim()) {
        const preview = ingredients.length > 135 ? ingredients.slice(0, 132) + '…' : ingredients;
        button.append(element('span', 'meal-ingredients', preview));
      }
      if (meal.note.trim()) {
        const note = element('span', 'meal-note-preview');
        note.append(icon('note'), document.createTextNode('Une note à retrouver'));
        button.append(note);
      }
      const printDetails = element('span', 'meal-print-detail');
      if (ingredients.trim()) printDetails.append(element('span', '', ingredients));
      if (meal.note.trim()) printDetails.append(element('span', 'print-note', meal.note));
      button.append(printDetails);
    } else {
      const add = element('span', 'add-circle');
      add.append(icon('plus'));
      button.append(add, element('span', 'empty-prompt', 'Prévoir le ' + slot.mealLabel.toLowerCase()));
    }
    button.addEventListener('click', () => openMeal(slot.id));
    return button;
  }

  function renderPlanner() {
    const week = readWeek();
    const slots = C.getSlots(selectedWeek);
    const today = C.dateKey(new Date());
    const weekday = document.createDocumentFragment();
    const weekend = document.createDocumentFragment();
    for (let day = 0; day < 7; day++) {
      const daySlots = slots.filter((slot) => slot.dayIndex === day);
      const first = daySlots[0];
      const card = element('article', 'day-card' + (day > 4 ? ' weekend-card' : '') + (first.dayKey === today ? ' today' : ''));
      const heading = element('div', 'day-heading');
      const title = element('h3', '', first.dayName);
      title.id = 'day-' + day;
      const time = element('time', '', String(C.parseDateKey(first.dayKey).getDate()).padStart(2, '0'));
      time.dateTime = first.dayKey;
      time.setAttribute('aria-label', dateLong.format(C.parseDateKey(first.dayKey)));
      heading.append(title, time);
      if (first.dayKey === today) heading.append(element('span', 'today-label', 'Aujourd’hui'));
      const meals = element('div', 'day-meals');
      daySlots.forEach((slot) => meals.append(renderMeal(slot, week)));
      card.setAttribute('aria-labelledby', title.id);
      card.append(heading, meals);
      (day > 4 ? weekend : weekday).append(card);
    }
    $('weekday-grid').replaceChildren(weekday);
    $('weekend-grid').replaceChildren(weekend);
    const count = slots.filter((slot) => week.meals[slot.id]?.name.trim()).length;
    $('meal-count').textContent = count + ' / 9 repas prévus';
  }

  function shoppingRow(item, onToggle, onRemove) {
    const li = element('li', 'shopping-item' + (item.checked ? ' checked' : ''));
    const label = element('label', 'shopping-item-label');
    const check = element('input');
    check.type = 'checkbox';
    check.checked = item.checked;
    check.dataset.itemId = item.id;
    const info = element('span', 'shopping-item-info');
    info.append(element('span', 'shopping-item-name', item.name));
    if (item.quantity) info.append(element('span', 'shopping-item-quantity', item.quantity));
    label.append(check, info);
    li.append(label);
    check.addEventListener('change', () => {
      onToggle(check.checked);
      li.classList.toggle('checked', check.checked);
    });
    if (onRemove) {
      const remove = element('button', 'shopping-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Retirer ' + item.name + ' de la liste');
      remove.append(icon('close'));
      remove.addEventListener('click', onRemove);
      li.append(remove);
    }
    return li;
  }

  function renderShopping() {
    const week = readWeek();
    const list = document.createDocumentFragment();
    for (const item of week.shopping) {
      list.append(shoppingRow(item, (checked) => {
        item.checked = checked;
        persist();
        updateShoppingCounts();
      }, () => {
        week.shopping = week.shopping.filter((entry) => entry.id !== item.id);
        persist();
        renderShopping();
        $('shopping-name').focus();
      }));
    }
    $('shopping-list').replaceChildren(list);
    $('shopping-empty').hidden = week.shopping.length > 0;
    updateShoppingCounts();

    const groceries = R.groceries(week, getIngredientAisles());
    const groups = document.createDocumentFragment();
    for (const aisle of R.AISLES) {
      const items = groceries.filter((item) => item.aisle === aisle.id);
      if (!items.length) continue;
      const group = element('section', 'shopping-aisle');
      group.dataset.aisle = aisle.id;
      group.append(element('h4', 'shopping-aisle-title', aisle.label));
      const rows = element('ul', 'shopping-list');
      for (const item of items) {
        let quantity = R.formatQuantity(item.quantity, item.unit);
        if (item.quantity !== null && item.atEye > 0) quantity += ' + à l’œil';
        const row = shoppingRow({ id: item.key, name: item.name, checked: item.checked, quantity }, (checked) => {
          if (checked) week.recipeChecks[item.key] = R.checkNeed(item);
          else delete week.recipeChecks[item.key];
          persist();
        });
        if (item.principal) row.classList.add('shopping-priority');
        rows.append(row);
      }
      group.append(rows);
      groups.append(group);
    }
    $('auto-shopping-list').replaceChildren(groups);
    $('auto-shopping-empty').hidden = groceries.length > 0;
  }

  function updateShoppingCounts() {
    const items = readWeek().shopping;
    const checked = items.filter((item) => item.checked).length;
    $('shopping-count').textContent = items.length ? checked + ' / ' + items.length + (items.length > 1 ? ' articles cochés' : ' article coché') : 'Aucun article';
    $('clear-checked').hidden = checked === 0;
  }

  function render() {
    $('week-title').textContent = weekLabel(selectedWeek);
    document.querySelector('.week-toolbar').classList.toggle('away', selectedWeek !== currentWeek());
    $('current-week').disabled = selectedWeek === currentWeek();
    try { C.getSlots(C.addDays(selectedWeek, -7)); $('previous-week').disabled = false; } catch { $('previous-week').disabled = true; }
    try { C.getSlots(C.addDays(selectedWeek, 7)); $('next-week').disabled = false; } catch { $('next-week').disabled = true; }
    renderPlanner();
    renderShopping();
  }

  function navigate(key) {
    selectedWeek = key;
    $('shopping-form').reset();
    render();
  }

  function openMeal(slotId) {
    editingSlot = slotId;
    editingWeek = selectedWeek;
    const slot = C.getSlots(editingWeek).find((entry) => entry.id === slotId);
    const meal = readWeek(editingWeek).meals[slotId];
    $('meal-date').textContent = slot.dayName + ' ' + dateLong.format(C.parseDateKey(slot.dayKey));
    $('meal-dialog-title').textContent = slot.mealLabel === 'Dîner' ? 'Prévoir le dîner' : 'Prévoir le déjeuner';
    $('meal-name').value = meal?.name || '';
    $('meal-ingredients').value = meal?.recipe
      ? mealIngredientLines(meal).join('\n').slice(0, 6000)
      : meal?.ingredients || '';
    $('meal-note').value = meal?.note || '';
    $('delete-meal').hidden = !meal;
    $('meal-error').hidden = true;
    draftRecipe = meal?.recipe || null;
    draftOptional = new Set(meal?.includedOptional);
    $('meal-portions').value = draftRecipe ? String(meal.portions) : '';
    renderMealRecipe();
    $('meal-dialog').showModal();
    $(draftRecipe ? 'meal-portions' : 'meal-name').focus();
  }

  function readPortions() {
    return R.normalizePortions(Number($('meal-portions').value));
  }

  function updateMealIngredients() {
    const list = $('meal-recipe-ingredients');
    const options = $('meal-recipe-options');
    options.hidden = true;
    options.replaceChildren();
    if (!draftRecipe) return;
    let portions;
    try { portions = readPortions(); } catch { list.replaceChildren(); return; }
    const scaled = R.scaleIngredients(draftRecipe, portions);
    function renderIncluded() {
      const descriptions = ingredientLines(scaled, draftOptional);
      list.replaceChildren(...descriptions.map((line) => element('li', '', line)));
    }
    renderIncluded();
    if (!scaled.some((line) => line.optional)) return;

    options.hidden = false;
    options.append(element('h4', '', 'Ingrédients facultatifs'));
    scaled.forEach((line, index) => {
      if (!line.optional) return;
      const label = element('label', 'meal-optional-choice');
      const check = element('input');
      check.type = 'checkbox';
      check.checked = draftOptional.has(index);
      check.dataset.optionalIndex = String(index);
      check.addEventListener('change', () => {
        if (check.checked) draftOptional.add(index);
        else draftOptional.delete(index);
        renderIncluded();
      });
      label.append(check, element('span', '', ingredientDescription(line)));
      options.append(label);
    });
  }

  function renderMealRecipe() {
    const linked = Boolean(draftRecipe);
    $('meal-free-fields').hidden = linked;
    $('meal-name').disabled = linked;
    $('meal-ingredients').disabled = linked;
    $('meal-recipe-summary').hidden = !linked;
    $('meal-portions').disabled = !linked;
    $('meal-recipe-pick').replaceChildren(icon('book'), document.createTextNode(linked ? 'Changer de recette' : 'Choisir une recette'));
    if (!linked) return;
    $('meal-recipe-title').textContent = draftRecipe.name;
    $('meal-recipe-steps').replaceChildren(...draftRecipe.steps.map((step) => element('li', '', step)));
    updateMealIngredients();
  }

  function pickRecipe(recipe) {
    draftRecipe = clone(recipe);
    draftOptional = new Set();
    $('meal-portions').value = String(recipe.servings);
    $('meal-error').hidden = true;
    renderMealRecipe();
    $('meal-portions').focus();
  }

  function requestConfirm(title, message, label = 'Confirmer') {
    if (confirmResolver) return Promise.resolve(false);
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('confirm-ok').textContent = label;
    $('confirm-dialog').showModal();
    $('confirm-cancel').focus();
    return new Promise((resolve) => { confirmResolver = resolve; });
  }

  function finishConfirm(value) {
    const resolve = confirmResolver;
    confirmResolver = null;
    $('confirm-dialog').close();
    if (resolve) resolve(value);
  }

  function download(text, filename, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('confirm-ok').addEventListener('click', () => finishConfirm(true));
  $('confirm-cancel').addEventListener('click', () => finishConfirm(false));
  $('confirm-dialog').addEventListener('cancel', (event) => { event.preventDefault(); finishConfirm(false); });
  $('previous-week').addEventListener('click', () => navigate(C.addDays(selectedWeek, -7)));
  $('next-week').addEventListener('click', () => navigate(C.addDays(selectedWeek, 7)));
  $('current-week').addEventListener('click', () => navigate(currentWeek()));
  $('print-button').addEventListener('click', () => window.print());

  const recipeUI = window.MenuRecipeUI.create({
    getRecipes, getIngredientAisles, saveRecipe, deleteRecipe, isPersonalRecipe, pickRecipe, element, icon
  });
  $('meal-recipe-pick').addEventListener('click', () => recipeUI.open(true));
  $('meal-recipe-clear').addEventListener('click', () => {
    draftRecipe = null;
    draftOptional = new Set();
    $('meal-error').hidden = true;
    renderMealRecipe();
    $('meal-name').focus();
  });
  $('meal-portions').addEventListener('input', updateMealIngredients);

  $('meal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = draftRecipe ? draftRecipe.name : $('meal-name').value.trim();
    if (!name) {
      $('meal-error').textContent = 'Indiquez le nom du plat pour enregistrer ce menu.';
      $('meal-error').hidden = false;
      $('meal-name').focus();
      return;
    }
    try {
      const meal = {
        name,
        ingredients: draftRecipe ? '' : $('meal-ingredients').value.trim(),
        note: $('meal-note').value.trim()
      };
      if (draftRecipe) {
        meal.recipe = draftRecipe;
        meal.portions = readPortions();
        if (draftOptional.size) meal.includedOptional = [...draftOptional].sort((a, b) => a - b);
      }
      const week = writableWeek(editingWeek);
      week.meals[editingSlot] = meal;
      week.recipeChecks = R.reconcileChecks(week);
      const saved = persist();
      $('meal-dialog').close();
      renderPlanner();
      renderShopping();
      document.querySelector('[data-slot-id="' + editingSlot + '"]')?.focus();
      toast(saved ? 'Le menu est enregistré.' : 'Menu gardé en mémoire. Pensez à exporter vos données.');
    } catch (error) {
      $('meal-error').textContent = error.message;
      $('meal-error').hidden = false;
    }
  });

  $('delete-meal').addEventListener('click', async () => {
    if (!await requestConfirm('Supprimer ce menu ?', 'Le plat, ses ingrédients et sa note seront supprimés. Les courses des recettes seront recalculées et vos ajouts manuels seront conservés.', 'Supprimer')) return;
    const week = writableWeek(editingWeek);
    delete week.meals[editingSlot];
    week.recipeChecks = R.reconcileChecks(week);
    persist();
    $('meal-dialog').close();
    renderPlanner();
    renderShopping();
    document.querySelector('[data-slot-id="' + editingSlot + '"]')?.focus();
    toast('Le menu a été supprimé.');
  });

  $('shopping-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('shopping-name').value.trim();
    if (!name) { $('shopping-name').focus(); return; }
    if (readWeek().shopping.length >= 300) { toast('Cette liste contient déjà 300 articles. Retirez des articles avant d’en ajouter.'); return; }
    try {
      const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      writableWeek().shopping.push({ id, name, quantity: $('shopping-quantity').value.trim(), checked: false });
      persist();
      $('shopping-form').reset();
      renderShopping();
      $('shopping-name').focus();
    } catch (error) { toast(error.message); }
  });

  $('clear-checked').addEventListener('click', () => {
    writableWeek().shopping = readWeek().shopping.filter((item) => !item.checked);
    persist();
    renderShopping();
    $('shopping-name').focus();
    toast('Les articles cochés ont été retirés.');
  });

  $('clear-week').addEventListener('click', async () => {
    if (!Object.keys(readWeek().meals).length && !readWeek().shopping.length) { toast('Cette semaine est déjà vide.'); return; }
    if (!await requestConfirm('Effacer cette semaine ?', 'Les menus et la liste de courses du ' + weekLabel(selectedWeek) + ' seront supprimés. Les autres semaines seront conservées.', 'Effacer la semaine')) return;
    delete data.weeks[selectedWeek];
    persist();
    render();
    toast('La semaine a été effacée.');
  });

  $('backup-button').addEventListener('click', () => { $('import-error').hidden = true; $('backup-dialog').showModal(); });
  $('export-button').addEventListener('click', () => {
    download(JSON.stringify(data, null, 2), 'a-table-' + C.dateKey(new Date()) + '.json');
    toast('Votre sauvegarde a été préparée.');
  });
  $('import-button').addEventListener('click', () => { $('import-error').hidden = true; $('import-file').click(); });
  $('import-file').addEventListener('change', async () => {
    const file = $('import-file').files[0];
    $('import-file').value = '';
    if (!file) return;
    $('import-button').disabled = true;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Ce fichier dépasse 10 Mo. Choisissez une sauvegarde plus petite.');
      let parsed;
      try { parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); } catch { throw new Error('Ce fichier n’est pas un JSON valide. Choisissez un fichier exporté depuis « À table ».'); }
      const incoming = normalizeNotebook(parsed);
      const count = Object.keys(incoming.weeks).length;
      const recipeCount = incoming.recipes.length;
      const summary = count + (count === 1 ? ' semaine' : ' semaines') + ' et ' + recipeCount + (recipeCount === 1 ? ' recette personnelle' : ' recettes personnelles');
      if (!await requestConfirm('Importer cette sauvegarde ?', 'Elle contient ' + summary + '. Elle remplacera vos semaines, vos courses et votre catalogue. Exportez votre carnet pour en garder une copie.', 'Remplacer mes données')) return;
      data = incoming;
      storageCorrupt = false;
      storageConflict = false;
      const saved = persist();
      $('backup-dialog').close();
      render();
      toast(saved ? 'La sauvegarde a été importée et enregistrée.' : 'Données importées en mémoire. La sauvegarde locale reste indisponible.');
    } catch (error) {
      $('import-error').textContent = error.message;
      $('import-error').hidden = false;
    } finally { $('import-button').disabled = false; }
  });

  function duplicatePreview() {
    try {
      const key = C.mondayKey($('duplicate-date').value);
      C.getSlots(key);
      $('duplicate-preview').textContent = 'Semaine du ' + weekLabel(key);
    } catch { $('duplicate-preview').textContent = ''; }
  }

  $('duplicate-button').addEventListener('click', () => {
    if (!Object.values(readWeek().meals).some((meal) => meal.name.trim())) { toast('Ajoutez au moins un menu avant de dupliquer la semaine.'); return; }
    $('duplicate-date').value = C.addDays(selectedWeek, 7);
    $('duplicate-error').hidden = true;
    duplicatePreview();
    $('duplicate-dialog').showModal();
  });
  $('duplicate-date').addEventListener('input', duplicatePreview);
  $('duplicate-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('duplicate-error').hidden = true;
    try {
      const target = C.mondayKey($('duplicate-date').value);
      C.getSlots(target);
      if (target === selectedWeek) throw new Error('Choisissez une autre semaine que celle affichée.');
      if (Object.keys(readWeek(target).meals).length && !await requestConfirm('Remplacer les menus existants ?', 'Les menus du ' + weekLabel(target) + ' seront remplacés par ceux de la semaine affichée, y compris les emplacements vides. Les courses des recettes seront recalculées et les ajouts manuels de destination seront conservés.', 'Remplacer les menus')) return;
      const targetWeek = writableWeek(target);
      targetWeek.meals = clone(readWeek().meals);
      targetWeek.recipeChecks = R.reconcileChecks(targetWeek);
      const saved = persist();
      $('duplicate-dialog').close();
      navigate(target);
      toast(saved ? 'Les menus ont été dupliqués.' : 'Menus dupliqués en mémoire. Pensez à exporter vos données.');
    } catch (error) {
      $('duplicate-error').textContent = error.message;
      $('duplicate-error').hidden = false;
    }
  });

  $('retry-storage-button').addEventListener('click', () => { if (persist()) toast('Vos données sont maintenant enregistrées.'); });
  $('recover-button').addEventListener('click', () => { if (corruptRaw !== null) download(corruptRaw, 'a-table-recuperation-' + C.dateKey(new Date()) + '.json'); });
  $('reset-storage-button').addEventListener('click', async () => {
    if (!await requestConfirm('Réinitialiser la sauvegarde locale ?', 'La sauvegarde illisible sera remplacée par les menus actuellement affichés. Récupérez d’abord son fichier si vous souhaitez le conserver.', 'Réinitialiser')) return;
    storageCorrupt = false;
    if (persist()) toast('La sauvegarde locale a été réinitialisée.');
  });

  $('reload-button').addEventListener('click', async () => {
    if (!await requestConfirm('Recharger le carnet ?', 'Les changements gardés uniquement en mémoire seront abandonnés. Exportez-les d’abord si vous souhaitez les conserver.', 'Recharger')) return;
    unsaved = false;
    window.location.reload();
  });

  window.addEventListener('beforeunload', (event) => {
    if (unsaved) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      if (unsaved || document.querySelector('dialog[open]')) {
        storageConflict = true;
        warnStorage('Les données ont changé dans un autre onglet. Exportez vos éventuels changements, puis rechargez la page avant de continuer.');
        unsaved = true;
      } else {
        data = event.newValue ? normalizeNotebook(JSON.parse(event.newValue)) : C.emptyData();
        storageCorrupt = false;
        corruptRaw = null;
        $('storage-warning').hidden = true;
        $('save-state').classList.remove('unsaved');
        $('save-label').textContent = 'Enregistré sur cet appareil';
        render();
        toast('Le carnet a été actualisé depuis votre autre onglet.');
      }
    } catch {
      storageConflict = true;
      unsaved = true;
      warnStorage('Les données ont changé dans un autre onglet. Exportez vos changements, puis rechargez la page pour les vérifier.');
    }
  });
  load();
  render();
})();
