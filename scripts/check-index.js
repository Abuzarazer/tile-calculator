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
