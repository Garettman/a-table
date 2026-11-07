/* À table — application statique, sans dépendance ni connexion à un serveur. */
(function () {
  'use strict';
  const C = window.MenuCore;
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
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
          data = C.normalizeBackup(JSON.parse(raw));
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
      if (meal.ingredients.trim()) {
        const preview = meal.ingredients.length > 135 ? meal.ingredients.slice(0, 132) + '…' : meal.ingredients;
        button.append(element('span', 'meal-ingredients', preview));
      }
      if (meal.note.trim()) {
        const note = element('span', 'meal-note-preview');
        note.append(icon('note'), document.createTextNode('Une note à retrouver'));
        button.append(note);
      }
      const printDetails = element('span', 'meal-print-detail');
      if (meal.ingredients.trim()) printDetails.append(element('span', '', meal.ingredients));
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

  function renderShopping() {
    const items = readWeek().shopping;
    const list = document.createDocumentFragment();
    items.forEach((item) => {
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
      const remove = element('button', 'shopping-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Retirer ' + item.name + ' de la liste');
      remove.append(icon('close'));
      check.addEventListener('change', () => {
        const current = readWeek().shopping.find((entry) => entry.id === item.id);
        if (!current) return;
        current.checked = check.checked;
        li.classList.toggle('checked', check.checked);
        persist();
        updateShoppingCounts();
      });
      remove.addEventListener('click', () => {
        writableWeek().shopping = readWeek().shopping.filter((entry) => entry.id !== item.id);
        persist();
        renderShopping();
        $('shopping-name').focus();
      });
      li.append(label, remove);
      list.append(li);
    });
    $('shopping-list').replaceChildren(list);
    $('shopping-empty').hidden = items.length > 0;
    updateShoppingCounts();
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
    $('meal-ingredients').value = meal?.ingredients || '';
    $('meal-note').value = meal?.note || '';
    $('delete-meal').hidden = !meal;
    $('meal-error').hidden = true;
    $('meal-dialog').showModal();
    $('meal-name').focus();
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

  $('meal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('meal-name').value.trim();
    if (!name) {
      $('meal-error').textContent = 'Indiquez le nom du plat pour enregistrer ce menu.';
      $('meal-error').hidden = false;
      $('meal-name').focus();
      return;
    }
    try {
      writableWeek(editingWeek).meals[editingSlot] = { name, ingredients: $('meal-ingredients').value.trim(), note: $('meal-note').value.trim() };
      const saved = persist();
      $('meal-dialog').close();
      renderPlanner();
      document.querySelector('[data-slot-id="' + editingSlot + '"]')?.focus();
      toast(saved ? 'Le menu est enregistré.' : 'Menu gardé en mémoire. Pensez à exporter vos données.');
    } catch (error) {
      $('meal-error').textContent = error.message;
      $('meal-error').hidden = false;
    }
  });

  $('delete-meal').addEventListener('click', async () => {
    if (!await requestConfirm('Supprimer ce menu ?', 'Le plat, ses ingrédients et sa note seront supprimés. Les courses resteront dans votre liste.', 'Supprimer')) return;
    delete writableWeek(editingWeek).meals[editingSlot];
    persist();
    $('meal-dialog').close();
    renderPlanner();
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
      const incoming = C.normalizeBackup(parsed);
      const count = Object.keys(incoming.weeks).length;
      if (!await requestConfirm('Importer cette sauvegarde ?', 'Elle contient ' + count + (count > 1 ? ' semaines' : ' semaine') + '. Toutes vos semaines actuelles seront remplacées, y compris leurs courses. Exportez-les d’abord si vous souhaitez les conserver.', 'Remplacer mes données')) return;
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
      if (Object.keys(readWeek(target).meals).length && !await requestConfirm('Remplacer les menus existants ?', 'Les menus du ' + weekLabel(target) + ' seront remplacés par ceux de la semaine affichée, y compris les emplacements vides. Les courses de destination seront conservées.', 'Remplacer les menus')) return;
      writableWeek(target).meals = clone(readWeek().meals);
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
        data = event.newValue ? C.normalizeBackup(JSON.parse(event.newValue)) : C.emptyData();
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
