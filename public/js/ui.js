export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function toast(message, error = false) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live','polite'); document.body.append(host); }
  const item = document.createElement('div'); item.className = `toast ${error ? 'error' : ''}`; item.textContent = message; host.append(item); setTimeout(() => item.remove(), 6500);
}
export function dialog(title, content, submit = 'Guardar', cancel = 'Cancelar') {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'app-dialog';
    d.innerHTML = `<form><p class="eyebrow">BERTHA & JOSUE</p><h2>${escapeHTML(title)}</h2><div class="dialog-body">${content}</div><footer><button type="button" data-cancel>${escapeHTML(cancel)}</button><button class="primary" type="submit">${escapeHTML(submit)}</button></footer></form>`;
    document.body.append(d); const form = d.querySelector('form');
    const heading = d.querySelector('h2'); heading.id = 'dialog-' + crypto.randomUUID(); d.setAttribute('aria-labelledby', heading.id);
    const close = result => { d.close(); d.remove(); resolve(result); };
    d.querySelector('[data-cancel]').onclick = () => close(null);
    d.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    form.onsubmit = e => { e.preventDefault(); if (form.reportValidity()) close(new FormData(form)); };
    d.showModal();
  });
}
export function errorMessage(e) {
  if (e.code?.includes('permission-denied')) return 'Acceso denegado. Revisa las reglas de Firestore y la autorización del administrador.';
  if (e.code?.startsWith('auth/')) return 'No se pudo iniciar sesión. Revisa tu correo, contraseña y que Email/Password esté habilitado.';
  if (e.code === 'unavailable') return 'No hay conexión con Firebase. Intenta nuevamente.';
  return e.message || 'No se pudo completar la operación.';
}
