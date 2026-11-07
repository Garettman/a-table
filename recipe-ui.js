/* Consultation et gestion des recettes dans le carnet. */
(function () {
  'use strict';

  const CATEGORIES = [
    { key: 'simple', title: 'Simples' },
    { key: 'intermediate', title: 'Intermédiaires' },
    { key: 'complex', title: 'Complexes' }
  ];
  const UNITS = [
    ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'L'],
    ['piece', 'Pièce'], ['cac', 'c. à café'], ['cas', 'c. à soupe']
  ];
  const MAX_INGREDIENTS = 60;
  const $ = (id) => document.getElementById(id);

  function newId(prefix) {
    const suffix = window.crypto?.randomUUID?.() ||
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    return prefix + suffix;
  }

  function searchable(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function create({ getRecipes, getIngredientAisles, saveRecipe, deleteRecipe, isPersonalRecipe, pickRecipe, element, icon }) {
    const R = window.MenuRecipeCore;
    const catalog = $('catalog-dialog');
    const editor = $('recipe-editor-dialog');
    const search = $('catalog-search');
    const personalFilter = $('catalog-my-recipes');
    const detail = $('catalog-detail');
    const form = $('recipe-editor-form');
    const ingredientRows = $('recipe-ingredient-rows');
    let activeRecipeId = '';
    let activeRecipeControl = null;
    let choosing = false;
    let personalOnly = false;
    let editingRecipeId = '';
    let initialSteps = [];
    let rows = [];
    let rowSequence = 0;

    function button(text, className, action) {
      const control = element('button', className, text);
      control.type = 'button';
      control.addEventListener('click', action);
      return control;
    }

    function message(text) {
      $('catalog-message').textContent = text;
      $('catalog-message').hidden = !text;
    }

    function editorError(text) {
      $('recipe-editor-error').textContent = text;
      $('recipe-editor-error').hidden = !text;
    }

    async function removeRecipe(recipe, control) {
      if (control.disabled) return;
      control.disabled = true;
      message('');
      let restoreFocus = true;
      try {
        const saved = await deleteRecipe(recipe.id);
        if (saved === null) return;
        restoreFocus = false;
        renderCatalog();
        message(saved ? 'La recette a été retirée du catalogue.' : 'Recette retirée du catalogue en mémoire. Exportez une sauvegarde avant de quitter.');
        if (catalog.open) (activeRecipeControl || personalFilter).focus();
      } catch (error) {
        message(error.message);
      } finally {
        control.disabled = false;
        if (restoreFocus && catalog.open) control.focus();
      }
    }

    function renderDetail(recipe) {
      detail.hidden = !recipe;
      if (!recipe) {
        detail.replaceChildren();
        return;
      }
      const complexity = R.classify(recipe);
      const header = element('div', 'recipe-detail-header');
      header.append(
        element('h3', 'recipe-detail-name', recipe.name),
        element('p', 'recipe-detail-meta', complexity.label + ' · ' + recipe.servings + (recipe.servings === 1 ? ' portion' : ' portions'))
      );
      const actions = element('div', 'recipe-detail-actions');
      if (choosing) {
        const pick = button('Choisir cette recette', 'button button-primary recipe-pick-action', () => {
          catalog.close();
          pickRecipe(recipe);
        });
        pick.id = 'catalog-pick-recipe';
        actions.append(pick);
      }
      const edit = button('Modifier', 'button button-outline', () => openEditor(recipe, true));
      edit.id = 'catalog-edit-recipe';
      edit.setAttribute('aria-haspopup', 'dialog');
      actions.append(edit);
      const duplicate = button('Dupliquer', 'button button-outline', () => openEditor(recipe));
      duplicate.id = 'catalog-duplicate-recipe';
      duplicate.setAttribute('aria-haspopup', 'dialog');
      actions.append(duplicate);
      const remove = button('Supprimer', 'button button-quiet danger-text', () => removeRecipe(recipe, remove));
      remove.id = 'catalog-delete-recipe';
      remove.setAttribute('aria-haspopup', 'dialog');
      actions.append(remove);
      const ingredients = element('ul', 'recipe-ingredients');
      for (const ingredient of recipe.ingredients) {
        const row = element('li', 'recipe-ingredient');
        const label = element('span', 'recipe-ingredient-label');
        label.append(element('span', '', ingredient.name));
        if (ingredient.optional) label.append(element('span', 'recipe-ingredient-tag', 'Facultatif'));
        if (ingredient.principal) label.append(element('span', 'recipe-ingredient-tag recipe-ingredient-tag-principal', 'Principal'));
        const amount = ingredient.quantity === null ? 'À l’œil' : R.formatQuantity(ingredient.quantity, ingredient.unit);
        row.append(label, element('strong', '', amount));
        ingredients.append(row);
      }
      const steps = element('ol', 'recipe-steps');
      for (const step of recipe.steps) steps.append(element('li', '', step));
      detail.replaceChildren(header, actions, element('h4', '', 'Ingrédients'), ingredients, element('h4', '', 'Préparation'), steps);
    }

    function selectRecipe(recipe, control) {
      activeRecipeId = recipe.id;
      if (activeRecipeControl) activeRecipeControl.setAttribute('aria-pressed', 'false');
      control.setAttribute('aria-pressed', 'true');
      activeRecipeControl = control;
      renderDetail(recipe);
      detail.focus({ preventScroll: true });
      detail.scrollIntoView?.({ block: 'nearest' });
    }

    function renderCatalog() {
      const terms = searchable(search.value).split(/\s+/).filter(Boolean);
      const personal = getRecipes().filter((recipe) => !personalOnly || isPersonalRecipe(recipe.id));
      const visible = personal.filter((recipe) => {
        if (!terms.length) return true;
        const labels = [recipe.name, ...recipe.ingredients.map((ingredient) => ingredient.name)].map(searchable);
        return terms.every((term) => labels.some((label) => label.includes(term)));
      });
      const sorted = visible.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      const categories = CATEGORIES.map((category) => ({ ...category, recipes: [] }));
      for (const recipe of sorted) {
        const key = R.classify(recipe).key;
        categories.find((category) => category.key === key)?.recipes.push(recipe);
      }
      const first = categories.find((category) => category.recipes.length)?.recipes[0];
      const active = sorted.find((recipe) => recipe.id === activeRecipeId) || first;
      activeRecipeId = active?.id || '';
      activeRecipeControl = null;
      const content = document.createDocumentFragment();
      for (const category of categories) {
        if (!category.recipes.length) continue;
        const section = element('section', 'recipe-category');
        const heading = element('h3', 'recipe-category-title', category.title);
        heading.append(element('span', 'recipe-category-count', String(category.recipes.length)));
        section.append(heading);
        for (const recipe of category.recipes) {
          const control = button(recipe.name, 'recipe-card', () => selectRecipe(recipe, control));
          control.dataset.recipeId = recipe.id;
          control.setAttribute('aria-pressed', String(recipe.id === activeRecipeId));
          if (recipe.id === activeRecipeId) activeRecipeControl = control;
          control.append(icon('arrow-right'));
          section.append(control);
        }
        content.append(section);
      }
      if (!active) {
        let empty = 'Aucune recette dans le catalogue.';
        if (personalOnly && !personal.length) empty = 'Vous n’avez pas encore de recette personnelle.';
        else if (terms.length) empty = 'Aucun résultat. Essayez un autre nom ou ingrédient.';
        content.append(element('p', 'catalog-empty', empty));
      }
      $('catalog-list').replaceChildren(content);
      renderDetail(active);
    }

    function draftIngredientRegistry() {
      const registry = new Map(R.ingredientRegistry(getRecipes(), getIngredientAisles()).map((ingredient) => [ingredient.id, ingredient]));
      for (const draft of rows) {
        if (!draft.id) continue;
        registry.set(draft.id, { id: draft.id, name: registry.get(draft.id)?.name || draft.name, aisle: draft.aisle });
      }
      return [...registry.values()];
    }

    function setDraftAisle(row, aisle) {
      for (const draft of rows) {
        if (draft !== row && (!row.id || draft.id !== row.id)) continue;
        draft.aisle = aisle;
        draft.aisleControl.value = aisle;
      }
    }

    function exactIngredientChoices(query, registry) {
      const key = R.ingredientKey(query);
      return key ? registry.filter((ingredient) => R.ingredientKey(ingredient.name) === key) : [];
    }

    function ingredientChoices(row) {
      const query = row.name.trim();
      if (!query || row.id) return [];
      const registry = draftIngredientRegistry();
      const matches = R.suggestIngredients(query, registry).slice(0, 6);
      if (exactIngredientChoices(query, registry).length) return matches;
      return [...matches, { id: '', name: query }];
    }

    function addIngredientRow(focus = false, initial = {}) {
      if (rows.length >= MAX_INGREDIENTS) return;
      const serial = ++rowSequence;
      const row = {
        id: initial.id || '',
        name: initial.name || '',
        quantity: initial.quantity == null ? '' : String(initial.quantity),
        unit: initial.unit || '',
        aisle: initial.aisle || 'other',
        optional: Boolean(initial.optional),
        principal: Boolean(initial.principal)
      };
      rows.push(row);
      const block = element('div', 'recipe-editor-ingredient');
      const nameField = element('div', 'ingredient-name-field');
      const nameInput = element('input');
      const nameId = 'recipe-ingredient-name-' + serial;
      const choicesId = 'recipe-ingredient-options-' + serial;
      const statusId = 'recipe-ingredient-status-' + serial;
      const nameLabel = element('label', '', 'Ingrédient');
      nameLabel.htmlFor = nameId;
      nameInput.id = nameId;
      nameInput.maxLength = 200;
      nameInput.autocomplete = 'off';
      nameInput.placeholder = 'Ex. tomates';
      nameInput.value = row.name;
      nameInput.setAttribute('role', 'combobox');
      nameInput.setAttribute('aria-autocomplete', 'list');
      nameInput.setAttribute('aria-controls', choicesId);
      nameInput.setAttribute('aria-expanded', 'false');
      nameInput.setAttribute('aria-describedby', statusId);
      const list = element('div', 'ingredient-suggestions');
      list.id = choicesId;
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', 'Suggestions d’ingrédients');
      list.hidden = true;
      const status = element('p', 'ingredient-status');
      status.id = statusId;
      nameField.append(nameLabel, nameInput, list, status);
      row.input = nameInput;

      let choices = [];
      let active = -1;

      function hideChoices() {
        list.hidden = true;
        nameInput.setAttribute('aria-expanded', 'false');
        nameInput.removeAttribute('aria-activedescendant');
        active = -1;
      }

      function choose(choice) {
        row.id = choice.id || newId('ing-');
        row.name = choice.name;
        if (choice.id) setDraftAisle(row, choice.aisle || 'other');
        nameInput.value = choice.name;
        status.textContent = choice.id ? 'Ingrédient associé.' : 'Nouvel ingrédient.';
        hideChoices();
        editorError('');
        amount.focus();
      }

      function showChoices() {
        choices = ingredientChoices(row);
        if (!choices.length) { hideChoices(); return; }
        active = -1;
        nameInput.removeAttribute('aria-activedescendant');
        list.replaceChildren(...choices.map((choice, index) => {
          const label = choice.id ? choice.name : 'Créer cet ingrédient « ' + choice.name + ' »';
          const option = element('div', 'ingredient-option' + (choice.id ? '' : ' ingredient-option-create'), label);
          option.id = choicesId + '-' + index;
          if (choice.id) option.dataset.ingredientId = choice.id;
          option.setAttribute('role', 'option');
          option.setAttribute('aria-selected', 'false');
          option.addEventListener('mousedown', (event) => event.preventDefault());
          option.addEventListener('click', () => choose(choice));
          return option;
        }));
        list.hidden = false;
        nameInput.setAttribute('aria-expanded', 'true');
      }

      function highlight(index) {
        active = index;
        for (const [position, option] of [...list.children].entries()) {
          option.setAttribute('aria-selected', String(position === index));
        }
        const option = list.children[index];
        nameInput.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView?.({ block: 'nearest' });
      }

      nameInput.addEventListener('input', () => {
        const wasAssigned = Boolean(row.id);
        row.id = '';
        row.name = nameInput.value;
        if (wasAssigned) setDraftAisle(row, 'other');
        status.textContent = row.name.trim() ? 'Choisissez une suggestion ou créez l’ingrédient.' : '';
        showChoices();
      });
      nameInput.addEventListener('focus', showChoices);
      nameInput.addEventListener('blur', hideChoices);
      nameInput.addEventListener('keydown', (event) => {
        if (event.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (list.hidden) showChoices();
          if (list.hidden) return;
          event.preventDefault();
          const next = event.key === 'ArrowDown' ? (active + 1) % choices.length : (active <= 0 ? choices.length - 1 : active - 1);
          highlight(next);
        } else if (event.key === 'Enter' && !list.hidden) {
          event.preventDefault();
          if (active >= 0) choose(choices[active]);
        } else if (event.key === 'Escape' && !list.hidden) {
          event.preventDefault();
          event.stopPropagation();
          hideChoices();
        }
      });

      const quantityField = element('div', 'ingredient-quantity-field');
      const amount = element('input');
      amount.id = 'recipe-ingredient-quantity-' + serial;
      amount.type = 'number';
      amount.min = '0.000001';
      amount.max = '1000000';
      amount.step = 'any';
      amount.inputMode = 'decimal';
      amount.value = row.quantity;
      const amountLabel = element('label', '', 'Quantité');
      amountLabel.htmlFor = amount.id;
      const amountHint = element('span', 'ingredient-quantity-hint', 'À l’œil');
      amountHint.id = 'recipe-ingredient-quantity-hint-' + serial;
      amount.setAttribute('aria-describedby', amountHint.id);
      quantityField.append(amountLabel, amount, amountHint);
      row.amount = amount;

      const unitField = element('div', 'ingredient-unit-field');
      const unit = element('select');
      unit.id = 'recipe-ingredient-unit-' + serial;
      const emptyUnit = element('option', '', 'Choisir');
      emptyUnit.value = '';
      unit.append(emptyUnit);
      for (const [value, label] of UNITS) {
        const option = element('option', '', label);
        option.value = value;
        unit.append(option);
      }
      unit.value = row.unit;
      unit.addEventListener('change', () => { row.unit = unit.value; });
      const unitLabel = element('label', '', 'Unité');
      unitLabel.htmlFor = unit.id;
      unitField.append(unitLabel, unit);
      row.unitControl = unit;

      function updateUnit() {
        const measured = row.quantity !== '';
        unit.disabled = !measured;
        unit.required = measured;
        amountHint.hidden = measured;
        if (!measured) {
          row.unit = '';
          unit.value = '';
        }
      }

      amount.addEventListener('input', () => {
        row.quantity = amount.value;
        updateUnit();
      });
      updateUnit();

      const aisleField = element('div', 'ingredient-aisle-field');
      const aisleControl = element('select');
      aisleControl.id = 'recipe-ingredient-aisle-' + serial;
      for (const { id, label } of R.AISLES) {
        const option = element('option', '', label);
        option.value = id;
        aisleControl.append(option);
      }
      aisleControl.value = row.aisle;
      aisleControl.addEventListener('change', () => setDraftAisle(row, aisleControl.value));
      row.aisleControl = aisleControl;
      const aisleLabel = element('label', '', 'Rayon');
      aisleLabel.htmlFor = aisleControl.id;
      aisleField.append(aisleLabel, aisleControl);

      const flags = element('div', 'ingredient-flags');
      for (const [key, title] of [['optional', 'Facultatif'], ['principal', 'Principal']]) {
        const label = element('label', 'ingredient-flag');
        const checkbox = element('input');
        checkbox.id = 'recipe-ingredient-' + key + '-' + serial;
        checkbox.type = 'checkbox';
        checkbox.checked = row[key];
        checkbox.addEventListener('change', () => { row[key] = checkbox.checked; });
        label.append(checkbox, element('span', '', title));
        flags.append(label);
      }

      const remove = button('', 'icon-button ingredient-remove', () => {
        rows = rows.filter((other) => other !== row);
        block.remove();
        $('recipe-add-ingredient').disabled = false;
        if (!rows.length) addIngredientRow(true);
        else $('recipe-add-ingredient').focus();
      });
      remove.append(icon('trash'));
      remove.setAttribute('aria-label', 'Retirer la ligne d’ingrédient ' + serial);
      block.append(nameField, quantityField, unitField, aisleField, remove, flags);
      ingredientRows.append(block);
      $('recipe-add-ingredient').disabled = rows.length >= MAX_INGREDIENTS;
      if (focus) nameInput.focus();
    }

    function openEditor(recipe = null, editing = false) {
      editingRecipeId = editing ? recipe.id : '';
      initialSteps = recipe ? recipe.steps.slice() : [];
      rows = [];
      rowSequence = 0;
      form.reset();
      ingredientRows.replaceChildren();
      editorError('');
      $('recipe-editor-title').textContent = editing ? 'Modifier la recette' : recipe ? 'Dupliquer la recette' : 'Créer une recette';
      if (recipe) {
        const suffix = ' (copie)';
        $('recipe-name').value = editing ? recipe.name : recipe.name.slice(0, 200 - suffix.length).trimEnd() + suffix;
        $('recipe-servings').value = String(recipe.servings);
        $('recipe-steps').value = initialSteps.join('\n');
        const aisles = new Map(R.ingredientRegistry([recipe], getIngredientAisles()).map(({ id, aisle }) => [id, aisle]));
        for (const ingredient of recipe.ingredients) addIngredientRow(false, { ...ingredient, aisle: aisles.get(ingredient.id) });
      } else {
        addIngredientRow();
      }
      editor.showModal();
      $('recipe-name').focus();
    }

    function submitRecipe(event) {
      event.preventDefault();
      editorError('');
      const filled = rows.filter((row) => row.name.trim() || row.quantity);
      for (const row of filled) {
        if (!row.id) {
          editorError('Choisissez une suggestion ou créez chaque ingrédient renseigné.');
          row.input.focus();
          return;
        }
        if (row.quantity !== '' && !(Number(row.quantity) > 0)) {
          editorError('Indiquez une quantité supérieure à zéro, ou laissez le champ vide pour doser à l’œil.');
          row.amount.focus();
          return;
        }
        if (row.quantity !== '' && !row.unit) {
          editorError('Choisissez une unité pour chaque quantité renseignée.');
          row.unitControl.focus();
          return;
        }
      }
      try {
        const stepText = $('recipe-steps').value.replace(/\r\n?/g, '\n');
        const steps = stepText === initialSteps.join('\n').replace(/\r\n?/g, '\n')
          ? initialSteps : stepText.split('\n').map((step) => step.trim()).filter(Boolean);
        const editing = Boolean(editingRecipeId);
        const recipe = R.normalizeRecipe({
          id: editingRecipeId || newId('custom-'),
          name: $('recipe-name').value,
          servings: Number($('recipe-servings').value),
          ingredients: filled.map(({ id, name, quantity, unit, aisle, optional, principal }) => ({
            id, name, quantity: quantity === '' ? null : Number(quantity), unit: quantity === '' ? null : unit,
            aisle, optional, principal
          })),
          steps
        });
        const saved = saveRecipe(recipe, { replace: editing });
        activeRecipeId = recipe.id;
        search.value = '';
        editor.close();
        renderCatalog();
        const success = editing ? 'La recette a été modifiée.' : 'Votre recette a été ajoutée.';
        message(saved === false ? 'Recette gardée en mémoire. Exportez une sauvegarde avant de quitter.' : success);
        detail.focus({ preventScroll: true });
        detail.scrollIntoView?.({ block: 'nearest' });
      } catch (error) {
        editorError(error.message);
      }
    }

    function open(pick = false) {
      choosing = pick;
      $('catalog-title').textContent = pick ? 'Choisir une recette' : 'Catalogue de recettes';
      search.value = '';
      message('');
      renderCatalog();
      catalog.showModal();
      search.focus();
    }

    $('catalog-button').addEventListener('click', () => open());
    $('recipe-create').addEventListener('click', () => openEditor());
    personalFilter.addEventListener('click', () => {
      personalOnly = !personalOnly;
      personalFilter.setAttribute('aria-pressed', String(personalOnly));
      renderCatalog();
    });
    $('recipe-add-ingredient').addEventListener('click', () => addIngredientRow(true));
    search.addEventListener('input', renderCatalog);
    form.addEventListener('submit', submitRecipe);
    return { open };
  }

  window.MenuRecipeUI = Object.freeze({ create });
})();
