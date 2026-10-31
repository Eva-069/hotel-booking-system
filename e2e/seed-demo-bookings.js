// Додає в демонстраційну БД два бронювання (оплачене й підтверджене), щоб панель адміністратора мала рядки.
const b = process.env.API || 'http://localhost:3000/v1';
const j = async (m, u, t, body) => (await fetch(b + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
(async () => {
  const c = (await j('POST', '/auth/login', null, { email: 'client@example.com', password: 'client123' })).token;
  const a = (await j('POST', '/auth/login', null, { email: 'admin@example.com', password: 'admin123' })).token;
  for (const [room, ci, co] of [[2, '2026-11-10', '2026-11-13'], [4, '2026-11-20', '2026-11-22']]) {
    const d = await j('POST', '/bookings/draft', c, { roomId: room, checkInDate: ci, checkOutDate: co, serviceIds: [1] });
    const p = await j('POST', '/payments', c, { draftId: d.draftId, amount: d.totalPrice, currency: 'UAH' });
    if (room === 4) await j('POST', '/bookings/' + p.id + '/confirm', a);
  }
  console.log('додано бронювань:', (await j('GET', '/bookings', a)).length);
})();
