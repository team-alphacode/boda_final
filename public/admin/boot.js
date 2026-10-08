import('./admin.js?v=cards3').catch((error) => {
  console.error('No se pudo iniciar el panel de administración:', error);

  document.getElementById('session-loading').hidden = true;
  document.getElementById('login').hidden = false;

  const errorBox = document.getElementById('login-error');
  if (errorBox) {
    errorBox.textContent = 'No pudimos iniciar el panel. Abre la consola del navegador para ver el error técnico.';
  }

  const button = document.querySelector('#login-form button');
  if (button) button.disabled = true;

  const form = document.getElementById('login-form');
  if (form) form.onsubmit = event => event.preventDefault();
});
