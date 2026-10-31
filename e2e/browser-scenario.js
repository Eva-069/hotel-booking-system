// Наскрізна перевірка живого прототипу в реальному браузері (Chromium/Puppeteer).
// Запуск: npm run seed && npm start (в іншому терміналі), потім node e2e/browser-scenario.js
// Змінні середовища: PUPPETEER_PATH (шлях до модуля), CHROME_PATH (шлях до браузера), BASE_URL.
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = require('path').join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const log = [];
const step = (m) => { log.push(m); console.log('•', m); };

(async () => {
  const browser = await puppeteer.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const shot = async (page, name) => {
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 1000, height: Math.min(Math.max(h, 500), 2400), deviceScaleFactor: 2 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  };
  async function login(page, role) {
    await page.goto(BASE + '/login.html', { waitUntil: 'networkidle0' });
    await page.select('#role-pick', role);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);
  }

  // ---------- КЛІЄНТ ----------
  let page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 2 });
  await page.goto(BASE + '/login.html', { waitUntil: 'networkidle0' });
  await shot(page, '01_login');
  await login(page, 'client');
  step('Клієнт увійшов: ' + page.url());

  // негативний: некоректні дати на формі (INV-01, клієнтська перевірка)
  await page.$eval('#checkin', (e) => (e.value = '2026-11-13'));
  await page.$eval('#checkout', (e) => (e.value = '2026-11-10'));
  await page.click('#search-form button[type=submit]');
  await shot(page, '02_search_invalid_dates');
  const errText = await page.$eval('.field-error', (e) => e.textContent);
  step('Негативний: помилка дат показана → «' + errText + '»');

  // позитивний пошук
  await page.$eval('#checkin', (e) => (e.value = '2026-11-10'));
  await page.$eval('#checkout', (e) => (e.value = '2026-11-13'));
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#search-form button[type=submit]')]);
  await page.waitForSelector('.room-card');
  await shot(page, '03_search_results');
  const cards = await page.$$eval('.room-card h3', (n) => n.map((x) => x.textContent));
  step('Результати пошуку (Комфорт): ' + cards.join('; '));

  // обираємо перший номер
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.room-card a.btn')]);
  await page.click('#svc1'); await page.click('#svc3');
  await page.type('#cardnum', '4111111111111111');
  await shot(page, '04_booking_form');
  const totalText = await page.$eval('.summary-line.total', (e) => e.textContent);
  step('Форма бронювання: ' + totalText.replace(/\s+/g, ' '));

  // негативний: відмова оплати
  await page.click('#simulate-decline');
  await page.click('#pay-btn');
  await page.waitForSelector('.banner-error');
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, '05_payment_declined');
  step('Негативний: відмова оплати → ' + (await page.$eval('.banner-error strong', (e) => e.textContent)));

  // повторна спроба (успіх)
  await page.click('#simulate-decline');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#pay-btn')]);
  await shot(page, '06_booking_success');
  step('Успіх оплати: ' + page.url().split('?')[0] + ' → ' + (await page.$eval('#msg', (e) => e.textContent)));

  await page.goto(BASE + '/client-my-bookings.html', { waitUntil: 'networkidle0' });
  await shot(page, '07_my_bookings');
  step('Мої бронювання: ' + (await page.$$eval('.panel h2', (n) => n.map((x) => x.textContent))).join('; '));

  // ---------- АДМІНІСТРАТОР ----------
  await page.evaluate(() => localStorage.clear());
  await login(page, 'admin');
  await page.waitForSelector('table.data');
  await shot(page, '08_admin_paid');
  for (const [act, label, shotName] of [['confirm', 'Підтвердити', '09_admin_confirmed'], ['check-in', 'Заселити', '10_admin_checked_in'], ['check-out', 'Оформити виїзд', '11_admin_checked_out']]) {
    await page.click(`[data-act="${act}"]`);
    await new Promise((r) => setTimeout(r, 500));
    await shot(page, shotName);
    step(`Адмін: «${label}» → статус у таблиці: ` + (await page.$eval('table.data tbody tr:first-child .badge', (e) => e.textContent)));
  }

  // ---------- ПЕРСОНАЛ ПРИБИРАННЯ ----------
  await page.evaluate(() => localStorage.clear());
  await login(page, 'cleaning_staff');
  await page.waitForSelector('table.data');
  await shot(page, '12_cleaning_queue');
  const queueBefore = await page.$$eval('table.data tbody tr', (r) => r.length);
  step('Черга прибирання до дії: ' + queueBefore + ' номерів');
  while ((await page.$$('[data-room]')).length) {
    await page.click('[data-room]');
    await new Promise((r) => setTimeout(r, 400));
  }
  await shot(page, '13_cleaning_empty');
  step('Черга прибирання після дій: ' + (await page.$eval('.empty-state h2', (e) => e.textContent)));

  // ---------- ЗАХИСТ ДОСТУПУ ----------
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '/admin-dashboard.html', { waitUntil: 'networkidle0' });
  step('Без сесії відкрито admin-dashboard → перенаправлення на: ' + page.url().replace(BASE, ''));

  await browser.close();
  fs.writeFileSync(OUT + '/e2e_log.txt', log.join('\n'));
  console.log('\nГОТОВО');
})().catch((e) => { console.error('E2E ПОМИЛКА:', e); process.exit(1); });
