const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const required = [
  'id="warehouse"',
  'id="clearBtn"',
  'id="addItemBtn"',
  'id="itemsList"',
  'id="summary"',
  'id="retryBtn"',
  'class="item-search"',
  'class="item-area"',
  'class="item-packs"',
  'class="item-reserve"',
  "findAll(['склад','твер'])",
  "findAll(['резерв','твер'])",
  "find(['вагон','в пути'])",
  'function wagonStatus(t)',
  'function stockDetails(t)',
  'Math.max(stock - reserved, 0)'
];
required.forEach(function (value) {
  if (html.indexOf(value) === -1) throw new Error('Не найден обязательный элемент: ' + value);
});

const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
if (scripts.length !== 1) throw new Error('Ожидался один встроенный JavaScript-блок');
new vm.Script(scripts[0].replace(/^<script>|<\/script>$/g, ''), { filename: 'index.html' });

const warehouseStock = html.match(/function warehouseStock\(t\)\{[\s\S]*?\n\}/);
if (!warehouseStock) throw new Error('Не найдена логика складских остатков');
const stockCheck = new vm.Script(
  'var ACTIVE_WAREHOUSE="tver";' + warehouseStock[0] +
  ';warehouseStock({stockTver:100,reserveTver:12})'
).runInNewContext();
if (stockCheck.stock !== 100 || stockCheck.reserved !== 12 || stockCheck.available !== 88) {
  throw new Error('Неверный расчёт доступного остатка');
}

const wagonStatus = html.match(/function wagonStatus\(t\)\{[\s\S]*?\n\}/);
if (!wagonStatus) throw new Error('Не найдена логика статуса вагона');
const wagonCheck = new vm.Script(wagonStatus[0] + ';[wagonStatus({wagon:"Патриция Стон 964"}), wagonStatus({})]').runInNewContext();
if (wagonCheck.join("|") !== "Вагон едет|Вагон не едет") {
  throw new Error("Неверный статус вагона: " + wagonCheck.join("|"));
}

// статусы наличия: резерв съел остаток, данных нет, реальный ноль, норма
const stockStatusFn = html.match(/function stockStatus\(t\)\{[\s\S]*?\n\}/);
const stockDetailsFn = html.match(/function stockDetails\(t\)\{[\s\S]*?\n\}/);
const fmtFn = html.match(/function fmt\(n, dec\)\{[\s\S]*?\n\}/);
const warehouseNameFn = html.match(/function warehouseName\(\)\{[\s\S]*?\n\}/);
if (!stockStatusFn || !stockDetailsFn) throw new Error('Не найдена логика статуса наличия');

const statusCtx = { ACTIVE_WAREHOUSE: 'moscow' };
vm.createContext(statusCtx);
new vm.Script(
  fmtFn[0] + warehouseNameFn[0] + warehouseStock[0] + wagonStatus[0] + stockDetailsFn[0] + stockStatusFn[0]
).runInContext(statusCtx);

// Минерал Грей: остаток 74.92, резерв 79.2 -> свободного нет, но товар на складе есть
const allReserved = statusCtx.stockStatus({ pack: 1.44, stockMoscow: 74.92, reserveMoscow: 79.2, wagon: '576' });
if (allReserved.text.indexOf('Всё в резерве') !== 0) {
  throw new Error('Остаток под резервом должен читаться как «Всё в резерве»: ' + allReserved.text);
}
const allReservedLine = statusCtx.stockDetails({ pack: 1.44, stockMoscow: 74.92, reserveMoscow: 79.2, wagon: '576' });
if (allReservedLine.indexOf('74.92') === -1 || allReservedLine.indexOf('79.20') === -1) {
  throw new Error('Расшифровка склада обязана показывать остаток и резерв: ' + allReservedLine);
}

// нет данных по складу — это не «нет в наличии»
const unknown = statusCtx.stockStatus({ pack: 1.44, stockMoscow: null, reserveMoscow: 0, wagon: '' });
if (unknown.pillClass !== 'pill-unknown') {
  throw new Error('Пустой остаток нельзя выдавать за отсутствие товара: ' + unknown.text);
}

// настоящий ноль и нормальный остаток
if (statusCtx.stockStatus({ pack: 1.44, stockMoscow: 0, reserveMoscow: 0, wagon: '' }).text.indexOf('Нет в наличии') !== 0) {
  throw new Error('Нулевой остаток должен читаться как «Нет в наличии»');
}
if (statusCtx.stockStatus({ pack: 1.44, stockMoscow: 183.6, reserveMoscow: 53.28, wagon: '' }).pillClass !== 'pill-ok') {
  throw new Error('Свободный остаток должен читаться как «В наличии»');
}

// расчёт позиции: по площади (с запасом) и по количеству упаковок
const computeItem = html.match(/function computeItemResult\(item\)\{[\s\S]*?\n\}/);
if (!computeItem) throw new Error('Не найдена логика расчёта позиции');
const calcContext = {
  ACTIVE_WAREHOUSE: 'moscow',
  toNumber: function (v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim().replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  },
  warehouseStock: function () { return { stock: null, reserved: 0, available: null }; }
};
vm.createContext(calcContext);
new vm.Script(computeItem[0]).runInContext(calcContext);

const tile = { pack: 1.44, pieces: 2, weight: 27, price: null };

// 4.32 м² = ровно 3 упаковки (защита от ошибки плавающей точки)
const byArea = calcContext.computeItemResult({ tile: tile, mode: 'area', area: '4.32', price: '', reserve: '' });
if (!byArea || byArea.packs !== 3) {
  throw new Error('Расчёт по площади: ожидалось 3 упаковки, получено ' + (byArea && byArea.packs));
}

// запас 10% от 10 м² -> 11 м² -> 8 упаковок по 1.44
const withReserve = calcContext.computeItemResult({ tile: tile, mode: 'area', area: '10', price: '', reserve: '10' });
if (!withReserve || withReserve.packs !== 8) {
  throw new Error('Расчёт с запасом: ожидалось 8 упаковок, получено ' + (withReserve && withReserve.packs));
}

// прямой ввод упаковок
const byPacks = calcContext.computeItemResult({ tile: tile, mode: 'packs', packsCount: '5', price: '1000', reserve: '' });
if (!byPacks || byPacks.packs !== 5 || Math.abs(byPacks.buyArea - 7.2) > 1e-6 || Math.abs(byPacks.total - 7200) > 1e-6) {
  throw new Error('Расчёт по упаковкам неверен: ' + JSON.stringify(byPacks));
}

console.log('index.html: проверка пройдена');
