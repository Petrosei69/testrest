// Логика взята из excel_script.js и адаптирована под папку new/ и файл data.xlsx

const $fio = document.getElementById('fio');
const $btn = document.getElementById('findBtn');
const $addresses = document.getElementById('addresses');
const $container = document.querySelector('.container');

let excelData = { выборка: null, тексты: null };
let restaurantTexts = null;

const statusIndicator = document.createElement('div');
statusIndicator.className = 'status-indicator';
document.body.appendChild(statusIndicator);

function normalizeString(text) {
  if (!text) return '';
  return text.toString().toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е');
}

function htmlEscape(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function showStatus(message, isError = false) {
  statusIndicator.textContent = message;
  statusIndicator.className = `status-indicator ${isError ? 'error' : 'success'} show`;
  setTimeout(() => statusIndicator.classList.remove('show'), 3000);
}

function showLoading(button, text = 'Загрузка...') {
  const originalText = button.textContent;
  button.disabled = true;
  button.innerHTML = `<span class="loading">${text}</span>`;
  return originalText;
}

function hideLoading(button, originalText) {
  button.disabled = false;
  button.textContent = originalText;
}

async function loadRestaurantTexts() {
  try {
    const response = await fetch('restaurant-texts.json');
    if (!response.ok) {
      throw new Error('Не удалось загрузить файл с текстами');
    }
    restaurantTexts = await response.json();
    return true;
  } catch (e) {
    console.error('Ошибка загрузки текстов:', e);
    showStatus('Ошибка загрузки текстов', true);
    return false;
  }
}

async function loadExcelFile() {
  try {
    if (location.protocol === 'file:') {
      showStatus('Откройте через http://localhost/ (не file://)', true);
      return false;
    }

    // Загружаем JSON с текстами параллельно
    const textsPromise = loadRestaurantTexts();

    // Сначала ищем рядом со страницей (new/data.xlsx), затем пробуем из корня проекта
    const candidatePaths = ['data.xlsx', 'Таблица для загрузки.xlsx', '../data.xlsx', '../Таблица для загрузки.xlsx'];
    let response = null;
    for (const path of candidatePaths) {
      try {
        const r = await fetch(encodeURI(path));
        if (r.ok) { response = r; break; }
      } catch (_) {}
    }
    if (!response) { throw new Error('Excel не найден рядом со страницей'); }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    if (workbook.SheetNames.includes('Выборка')) {
      excelData.выборка = XLSX.utils.sheet_to_json(workbook.Sheets['Выборка']);
    } else {
      showStatus('Нет листа "Выборка"', true);
      return false;
    }

    if (workbook.SheetNames.includes('Тексты')) {
      excelData.тексты = XLSX.utils.sheet_to_json(workbook.Sheets['Тексты'], { header: 1 });
    } else {
      // Лист "Тексты" может быть в подготовке — не блокируем работу, просто не будет инструкций
      excelData.тексты = [];
    }

    // Ждем загрузки текстов
    await textsPromise;

    showStatus(`Excel загружен (${excelData.выборка.length})`);
    return true;
  } catch (e) {
    console.error(e);
    showStatus('Ошибка загрузки Excel', true);
    return false;
  }
}

async function findAssignments(fio) {
  if (!excelData.выборка) {
    const ok = await loadExcelFile();
    if (!ok) return [];
  }

  const normalizedFio = normalizeString(fio);

  const results = [];
  excelData.выборка.forEach(row => {
    const tester = normalizeString(row['Тестировщик'] || '');
    const waveRaw = row['№ волны'];
    const waveStr = String(waveRaw ?? '').trim().toLowerCase();
    const isWave1 = waveStr === 'волна 1';

    if (tester.includes(normalizedFio) && isWave1) {
      results.push({
        partner: row['Партнер'] || '',
        restaurant: row['Ресторан'] || '',
        address: row['Адрес'] || '',
        city: row['Город'] || '',
        method: row['Способ проверки'] || '',
        display: `${row['Партнер'] || ''} → ${row['Ресторан'] || ''} → ${row['Адрес'] || ''} → ${row['Способ проверки'] || ''}`
      });
    }
  });

  return results;
}

async function findText(partner, method) {
  // Сначала пробуем найти в новой JSON структуре
  if (!restaurantTexts) {
    await loadRestaurantTexts();
  }
  
  if (restaurantTexts && restaurantTexts.specific_texts) {
    const np = normalizeString(partner);
    const nm = normalizeString(method);
    
    // Ищем точное совпадение в JSON
    for (const [key, textData] of Object.entries(restaurantTexts.specific_texts)) {
      if (normalizeString(textData.partner) === np && normalizeString(textData.method) === nm) {
        return textData;
      }
    }
  }
  
  // Fallback на старую систему Excel если не найдено в JSON
  if (!excelData.тексты) { await loadExcelFile(); }
  if (!excelData.тексты || excelData.тексты.length < 3) return '';
  
  const partnersRow = excelData.тексты[0] || [];
  const methodsRow = excelData.тексты[1] || [];
  const textsRow = excelData.тексты[2] || [];
  const np = normalizeString(partner), nm = normalizeString(method);
  
  for (let i = 1; i < partnersRow.length; i++) {
    if (normalizeString(partnersRow[i]) === np && normalizeString(methodsRow[i]) === nm) {
      return textsRow[i] || '';
    }
  }
  return textsRow[textsRow.length - 1] || '';
}

function renderAddresses(items) {
  if (!items || items.length === 0) {
    $addresses.innerHTML = '<div class="addr">Адреса не найдены для этой волны</div>';
    $addresses.style.display = 'block';
    $container.classList.add('with-result');
    return;
  }

  const html = items.map(item => `
    <div class="addr" data-partner="${htmlEscape(item.partner)}" data-method="${htmlEscape(item.method)}" data-restaurant="${htmlEscape(item.restaurant)}" data-address="${htmlEscape(item.address)}" data-city="${htmlEscape(item.city)}">
      <div class="addr-header"><strong>${htmlEscape(item.partner)}</strong> — ${htmlEscape(item.restaurant)}</div>
      <div class="addr-details"><em class="addr-line">${htmlEscape(item.address)}</em><br><span class="method-strong">${htmlEscape(item.method)}</span></div>
    </div>
  `).join('');

  $addresses.innerHTML = html;
  $addresses.style.display = 'block';
  $container.classList.add('with-result');

  document.querySelectorAll('.addr').forEach(node => {
    node.addEventListener('click', async () => {
      const partner = node.dataset.partner;
      const method = node.dataset.method;
      const restaurant = node.dataset.restaurant || '';
      const address = node.dataset.address || '';
      const city = node.dataset.city || '';
      await onPick({ partner, method, restaurant, address, city });
    });
  });
}

function createCollapsibleBlock(title, content) {
  return `
    <div class="collapsible">
      <div class="collapsible-header">
        <span>${title}</span>
        <span class="arrow">▼</span>
      </div>
      <div class="collapsible-content">
        <p>${content.replace(/\n/g, '<br>')}</p>
      </div>
    </div>
  `;
}

function formatText(textData, item) {
  if (typeof textData === 'string') {
    // Старый формат из Excel
    return textData.replace(/\n/g, '<br>');
  }
  
  if (!textData || typeof textData !== 'object') {
    return 'Инструкция не найдена для данной комбинации партнера и способа проверки.';
  }
  
  // Новый формат из JSON
  let generalTemplate = '';
  if (restaurantTexts && restaurantTexts.templates && restaurantTexts.templates.general) {
    generalTemplate = restaurantTexts.templates.general.content;
  }
  
  // Сначала заменяем плейсхолдеры в специфичном тексте
  let specificContent = (textData.content || '')
    .replace(/&lt;Название&gt;/g, htmlEscape(item.restaurant))
    .replace(/&lt;Адрес&gt;/g, htmlEscape(item.address))
    .replace(/&lt;Способ проверки&gt;/g, htmlEscape(item.method))
    .replace(/&lt;Сервис для оформления доставки&gt;/g, 'нужный сервис доставки');
  
  // Теперь заменяем плейсхолдеры в общем шаблоне
  let result = generalTemplate
    .replace(/&lt;ФИО&gt;/g, htmlEscape($fio.value))
    .replace(/&lt;Название&gt;/g, htmlEscape(item.restaurant))
    .replace(/&lt;Адрес&gt;/g, htmlEscape(item.address))
    .replace(/&lt;Способ проверки&gt;/g, htmlEscape(item.method))
    .replace(/{SPECIFIC_TEXT}/g, specificContent);
  
  // Добавляем сворачивающиеся блоки если есть
  if (textData.collapsible_sections && textData.collapsible_sections.length > 0) {
    let collapsibleHTML = '';
    textData.collapsible_sections.forEach(section => {
      collapsibleHTML += createCollapsibleBlock(section.title, section.content);
    });
    result += collapsibleHTML;
  }
  
  // Добавляем формы заполнения если есть ссылки
  let formLink = null;
  
  // Проверяем form_link в объекте
  if (textData.form_link) {
    formLink = textData.form_link;
  }
  // Fallback - ищем в тексте
  else if (textData.content && textData.content.includes('forms.gle/')) {
    const formMatch = textData.content.match(/https:\/\/forms\.gle\/[a-zA-Z0-9_-]+/);
    if (formMatch) {
      formLink = formMatch[0];
    }
  }
  
  if (formLink) {
    result += `
      <div class="report-section">
        <h4>Заполнение формы</h4>
        <p>После завершения посещения ресторана, пожалуйста, заполните отчет о проведенной проверке <strong>(не заполняйте отчет в самом ресторане, только после выхода из него, можете заполнить с ПК или со смартфона)</strong></p>
        <a href="${formLink}" target="_blank" class="report-link">Заполнить отчет</a>
        <p>После отправки отчета, пожалуйста, нажмите кнопку "Отправил отчет" ниже, чтобы ресторан отметился как проверенный. Спасибо!</p>
        <button class="report-completed-btn" onclick="markAsCompleted('${htmlEscape(item.partner)}', '${htmlEscape(item.restaurant)}')">Отправил отчет</button>
      </div>
    `;
  }
  
  return result.replace(/\n/g, '<br>');
}

function initCollapsibleBlocks() {
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', function() {
      const collapsible = this.parentElement;
      collapsible.classList.toggle('active');
    });
  });
}

async function onPick(item) {
  let details = document.getElementById('details');
  if (!details) {
    details = document.createElement('div');
    details.id = 'details';
    details.className = 'details';
    details.innerHTML = '<div class="tester"></div><div class="place"></div><div class="text"></div>';
    $container.appendChild(details);
  }
  
  const textData = await findText(item.partner, item.method);
  details.style.display = 'block';
  details.querySelector('.tester').innerHTML = `Тестировщик: <strong>${htmlEscape($fio.value)}</strong>`;
  details.querySelector('.place').innerHTML = `
    <div><strong>${htmlEscape(item.partner)}</strong> — ${htmlEscape(item.restaurant)}</div>
    <div><em class="addr-line">${htmlEscape(item.address)}</em></div>
    <div><span class="method-strong">${htmlEscape(item.method)}</span></div>
  `;
  
  const formattedText = formatText(textData, item);
  details.querySelector('.text').innerHTML = formattedText;
  
  // Инициализируем сворачивающиеся блоки после добавления контента
  setTimeout(() => {
    initCollapsibleBlocks();
  }, 100);
  
  details.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function performSearch() {
  const fio = $fio.value.trim();
  if (!fio) { showStatus('Введите ФИО', true); $fio.focus(); return; }
  const orig = showLoading($btn, 'Поиск адресов...');
  try {
    const items = await findAssignments(fio);
    renderAddresses(items);
    const details = document.getElementById('details');
    if (details) details.style.display = 'none';
  } catch (e) {
    console.error(e); showStatus('Ошибка поиска', true);
  } finally { hideLoading($btn, orig); }
}

function markAsCompleted(partner, restaurant) {
  showStatus(`Ресторан "${restaurant}" отмечен как проверенный`, false);
  // Здесь можно добавить логику отправки данных на сервер
  const btn = event.target;
  btn.textContent = 'Отчет отправлен ✓';
  btn.disabled = true;
  btn.style.background = '#27ae60';
}

document.addEventListener('DOMContentLoaded', async () => {
  $fio.focus();
  $btn.addEventListener('click', performSearch);
  $fio.addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });
  await loadExcelFile();
});


