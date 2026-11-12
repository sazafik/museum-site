/* Надсилання заявки з форми запису.
   Серверної частини ще немає (музей ще не вирішив, хто отримуватиме заявки): поки це заглушка, яка через 1,2 с
   приймає заявку. Щоб перевірити стан «не вдалося надіслати», відкрийте сторінку з ?fail=1.
   Коли з'явиться ендпоінт, замініть тіло функції на fetch('/api/booking', …). */
window.submitBooking = function (data) {
  var shouldFail = /[?&]fail=1\b/.test(window.location.search);
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      if (shouldFail) reject(new Error('booking stub: fail=1'));
      else resolve({ ok: true, data: data });
    }, 1200);
  });
};
