// UI-перевірки: NFR-01 (клавіатура, доступні імена, структура сторінки) та NFR-08 (ширина 360 px).
// Запуск: node e2e/ui-checks.js <мітка>  → docs/test-results/ui-checks-<мітка>.json (+ знімки 360 px у docs/screenshots/)
// Потрібен запущений сервер (npm start) і puppeteer (npm i -D puppeteer); CHROME_PATH — за потреби.
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LABEL = process.argv[2] || 'run';
const RES = path.join(__dirname, '..', 'docs', 'test-results');
const SHOTS = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(RES, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const result = { label: LABEL, keyboard: [], names: [], structure: [], responsive: [] };

const Q = 'checkIn=2026-11-10&checkOut=2026-11-13';
const PAGES = [
  ['login.html', null],
  ['client-search.html', 'client'],
  [`client-search-results.html?${Q}`, 'client'],
  [`client-booking-payment.html?roomId=1&number=204&category=comfort&price=1450&${Q}`, 'client'],
  ['client-booking-success.html?id=1&number=204&category=comfort&checkIn=2026-11-10&checkOut=2026-11-13&total=5150', 'client'],
  ['client-my-bookings.html', 'client'],
  ['admin-dashboard.html', 'admin'],
  ['cleaning-queue.html', 'cleaning_staff'],
];
const CREDS = { client: ['client@example.com', 'client123'], admin: ['admin@example.com', 'admin123'], cleaning_staff: ['cleaning@example.com', 'clean123'] };
async function session(role) {
  const r = await fetch(BASE + '/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CREDS[role][0], password: CREDS[role][1] }) });
  return await r.json();
}

(async () => {
  const browser = await puppeteer.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const sessions = { client: await session('client'), admin: await session('admin'), cleaning_staff: await session('cleaning_staff') };
  const newPage = async (w = 1000) => {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    p.on('dialog', (d) => d.accept());
    return p;
  };
  const setSession = async (p, role) => {
    await p.goto(BASE + '/login.html');
    await p.evaluate((s) => localStorage.setItem('hotelSession', JSON.stringify(s)), sessions[role]);
  };

  // ---------- A. Сценарій US-02 лише клавіатурою ----------
  {
    const p = await newPage();
    await p.goto(BASE + '/login.html', { waitUntil: 'networkidle0' });
    await p.evaluate(() => localStorage.clear());
    let totalTabs = 0; const invisibleFocus = [];
    const describe = () => p.evaluate(() => {
      const e = document.activeElement; const cs = getComputedStyle(e);
      const label = e.labels && e.labels[0] ? e.labels[0].textContent.trim() : (e.textContent || e.value || '').trim().slice(0, 40);
      // Кнопка календаря всередині <input type=date> — елемент shadow DOM: браузер малює на ній власну рамку фокусу
      // (перевірено знімком), а :focus для самого поля на цій зупинці не спрацьовує.
      const uaPicker = e.type === 'date' && !e.matches(':focus');
      const ringed = uaPicker || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
      return { tag: e.tagName.toLowerCase(), id: e.id, label, ringed };
    });
    async function tabTo(sel, step, max = 40) {
      for (let i = 0; i < max; i++) {
        await p.keyboard.press('Tab'); totalTabs++;
        const d = await describe();
        if (!d.ringed) invisibleFocus.push(`${step}: ${d.tag}#${d.id} «${d.label}»`);
        if (await p.evaluate((s) => document.activeElement.matches(s), sel)) return { tabs: i + 1, ...d };
      }
      throw new Error(`Не вдалося дійти Tab-ом до ${sel} (${step})`);
    }
    const rec = (step, ok, note) => { result.keyboard.push({ step, ok, note }); console.log(ok ? 'OK  ' : 'FAIL', step, '—', note); };

    await tabTo('#email', 'вхід'); await p.keyboard.press('Tab'); totalTabs++;
    await tabTo('button[type=submit]', 'вхід');
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.keyboard.press('Enter')]);
    rec('1. Вхід: Tab до полів і кнопки, надсилання клавішею Enter', p.url().endsWith('client-search.html'), p.url().replace(BASE, ''));

    await tabTo('#category', 'пошук'); await p.keyboard.press('ArrowDown');
    const cat = await p.$eval('#category', (e) => e.value);
    await tabTo('#search-form button[type=submit]', 'пошук');
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.keyboard.press('Enter')]);
    rec('2. Пошук: вибір категорії стрілкою («' + cat + '»), надсилання Enter', p.url().includes('category=' + cat), p.url().replace(BASE, ''));
    await p.waitForSelector('.room-card, .empty-state');
    if (await p.$('.empty-state')) await p.goto(BASE + `/client-search-results.html?${Q}`, { waitUntil: 'networkidle0' });

    await tabTo('.room-card a.btn', 'результати');
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.keyboard.press('Enter')]);
    rec('3. Вибір номера: Tab до кнопки «Обрати», активація Enter', p.url().includes('client-booking-payment'), p.url().replace(BASE, '').slice(0, 60));

    await tabTo('#svc1', 'бронювання'); await p.keyboard.press('Space');
    const checked = await p.$eval('#svc1', (e) => e.checked);
    await tabTo('#cardnum', 'бронювання'); await p.keyboard.type('4111111111111111');
    const total = await p.$eval('.summary-line.total', (e) => e.textContent.replace(/\s+/g, ' '));
    rec('4. Послуга обрана клавішею Пробіл, номер картки введено з клавіатури', checked, total);
    await tabTo('#pay-btn', 'бронювання');
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.keyboard.press('Enter')]);
    rec('5. Оплата кнопкою через Enter → екран підтвердження', p.url().includes('client-booking-success'), await p.$eval('#msg', (e) => e.textContent));
    const role = await p.$eval('.banner-success', (e) => e.getAttribute('role'));
    rec('6. Повідомлення про успіх має role="status"', role === 'status', 'role=' + role);

    await p.goto(BASE + '/client-my-bookings.html', { waitUntil: 'networkidle0' });
    await tabTo('[data-cancel]', 'мої бронювання'); await p.keyboard.press('Enter');
    await new Promise((x) => setTimeout(x, 600));
    const badges = await p.$$eval('.badge', (n) => n.map((x) => x.textContent));
    rec('7. Скасування бронювання клавіатурою (Tab → Enter, підтвердження діалогу)', badges.includes('Скасовано'), badges.join(', '));
    rec('8. Усі зупинки фокусу мають видимий індикатор', invisibleFocus.length === 0,
        invisibleFocus.length ? 'без індикатора: ' + [...new Set(invisibleFocus)].join('; ') : `перевірено зупинок фокусу: ${totalTabs}`);
    result.keyboardTabs = totalTabs;
    await p.close();
  }

  // ---------- B. Доступні імена та структура сторінок ----------
  for (const [page, sessRole] of PAGES) {
    const p = await newPage();
    if (sessRole) await setSession(p, sessRole); else await p.goto(BASE + '/login.html');
    await p.goto(BASE + '/' + page, { waitUntil: 'networkidle0' });
    await new Promise((x) => setTimeout(x, 400));
    const info = await p.evaluate(() => {
      const nameOf = (e) => {
        if (e.getAttribute('aria-label')) return e.getAttribute('aria-label');
        const lb = e.getAttribute('aria-labelledby'); if (lb) return document.getElementById(lb)?.textContent.trim() || '';
        if (e.labels && e.labels.length) return [...e.labels].map((l) => l.textContent.trim()).join(' ');
        return (e.textContent || '').trim();
      };
      const controls = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea')]
        .filter((e) => e.offsetParent !== null || e.classList.contains('skip-link'));
      return {
        controls: controls.length, unnamed: controls.filter((e) => !nameOf(e)).map((e) => e.outerHTML.slice(0, 80)),
        lang: document.documentElement.lang, title: !!document.title,
        h1: document.querySelectorAll('h1').length, main: document.querySelectorAll('main').length,
        skipLink: !!document.querySelector('a.skip-link[href="#main"]') && !!document.getElementById('main'),
      };
    });
    const name = page.split('?')[0];
    result.names.push({ page: name, controls: info.controls, unnamed: info.unnamed });
    result.structure.push({ page: name, lang: info.lang, title: info.title, h1: info.h1, main: info.main, skipLink: info.skipLink });
    console.log(info.unnamed.length ? 'FAIL' : 'OK  ', 'імена:', name.padEnd(28), `елементів ${info.controls}, без імені ${info.unnamed.length}`,
                '| lang=' + info.lang, '| h1=' + info.h1, '| main=' + info.main, '| skip-link=' + info.skipLink);
    await p.close();
  }

  // ---------- C. Адаптивність: 360 px і 1280 px ----------
  for (const width of [360, 1280]) {
    for (const [page, sessRole] of PAGES) {
      const p = await newPage(width);
      if (sessRole) await setSession(p, sessRole);
      await p.goto(BASE + '/' + page, { waitUntil: 'networkidle0' });
      await new Promise((x) => setTimeout(x, 400));
      const m = await p.evaluate((vw) => {
        const clipped = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.overflowX === 'hidden' && el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40));
        }
        return { pageScroll: document.documentElement.scrollWidth > vw + 1, scrollWidth: document.documentElement.scrollWidth, clipped };
      }, width);
      const ok = !m.pageScroll && m.clipped.length === 0;
      const name = page.split('?')[0];
      result.responsive.push({ page: name, width, ok, ...m });
      console.log(ok ? 'OK  ' : 'FAIL', `${width}px`, name.padEnd(28), m.pageScroll ? `горизонтальний скрол сторінки (${m.scrollWidth}px) ` : '', m.clipped.length ? 'обрізано: ' + m.clipped.join(', ') : '');
      if (width === 360 && /booking-payment|admin-dashboard|cleaning-queue/.test(page)) {
        const h = await p.evaluate(() => document.body.scrollHeight);
        await p.setViewport({ width, height: Math.min(h, 2000), deviceScaleFactor: 2 });
        await p.screenshot({ path: path.join(SHOTS, `mobile-360-${LABEL}-${name.replace('.html', '')}.png`), fullPage: true });
      }
      await p.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(RES, `ui-checks-${LABEL}.json`), JSON.stringify(result, null, 2));
  const fails = result.keyboard.filter((x) => !x.ok).length + result.names.filter((x) => x.unnamed.length).length +
    result.structure.filter((x) => !x.skipLink || x.main !== 1 || x.h1 !== 1 || !x.lang || !x.title).length + result.responsive.filter((x) => !x.ok).length;
  console.log(`\nПІДСУМОК (${LABEL}): невідповідностей — ${fails}`);
})().catch((e) => { console.error('ПОМИЛКА:', e); process.exit(1); });
