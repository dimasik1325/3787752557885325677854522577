// Minecraft Java Fansite — скрипты
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('downloadBtn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      // Говорим пользователю, что клик уведомлён (ссылка уже открывается в новой вкладке через target="_blank")
      console.log('Открыта ссылка на скачивание Minecraft');
    });
  }

  // Плавная прокрутка для внутренних ссылок
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
    });
  });
});
