const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const required = [
  'id="warehouse"',
  'id="clearBtn"',
  'id="search"',
  'id="area"',
  'id="reserve"',
  'id="results"',
  'id="retryBtn"',
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
console.log('index.html: проверка пройдена');
