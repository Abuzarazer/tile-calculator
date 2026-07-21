const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const required = ['id="search"', 'id="area"', 'id="reserve"', 'id="results"', 'id="retryBtn"'];
required.forEach(function (value) {
  if (html.indexOf(value) === -1) throw new Error('Не найден обязательный элемент: ' + value);
});

const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
if (scripts.length !== 1) throw new Error('Ожидался один встроенный JavaScript-блок');
new vm.Script(scripts[0].replace(/^<script>|<\/script>$/g, ''), { filename: 'index.html' });
console.log('index.html: проверка пройдена');
