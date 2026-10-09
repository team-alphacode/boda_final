import { ref, getDoc, submitRSVP } from './data.js?v=15';

const $ = (id) => document.getElementById(id);

const ui = {
  form: $('form-asistencia'),
  name: $('campo-nombre'),
  email: $('campo-correo'),
  yes: $('radio-si'),
  no: $('radio-no'),
  status: $('rsvp-estado'),

  modal: $('modal-rsvp'),
  close: $('rsvp-cerrar'),
  stepBadge: $('rsvp-paso-etiqueta'),
  stepCount: $('rsvp-paso-cantidad'),
  stepNames: $('rsvp-paso-nombres'),
  count: $('rsvp-cantidad'),
  countText: $('rsvp-cupo-texto'),
  minus: $('rsvp-restar'),
  plus: $('rsvp-sumar'),
  next: $('rsvp-continuar'),
  namesCopy: $('rsvp-nombres-copy'),
  list: $('rsvp-lista-nombres'),
  back: $('rsvp-volver'),
  save: $('rsvp-guardar'),

  noModal: $('modal-no'),
  betterYes: $('rsvp-mejor-si'),
  confirmNo: $('rsvp-confirmar-no'),

  msgModal: $('modal-mensaje'),
  msgIcon: $('rsvp-mensaje-icono'),
  msgTitle: $('rsvp-mensaje-titulo'),
  msgText: $('rsvp-mensaje-texto'),
  msgClose: $('rsvp-mensaje-cerrar')
};

const state = {
  token: '',
  invitation: null,
  maxPeople: 1,
  count: 1,
  submitting: false,
  locked: false,
  step: 'count'
};

function invitationToken() {
  const params = new URLSearchParams(window.location.search);
  let value = params.get('t') || params.get('token') || params.get('invite') || '';
  if (!value && window.location.hash.startsWith('#')) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    value = hashParams.get('t') || hashParams.get('token') || hashParams.get('invite') || '';
  }
  return value.trim();
}

function validEmail(value) {
  const email = String(value || '').trim();
  return email.length === 0 || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function showOverlay(element) {
  if (!element) return;
  element.hidden = false;
  element.inert = false;
  element.setAttribute('aria-hidden', 'false');
  document.body.classList.add('rsvp-modal-open');
}

function hideOverlay(element) {
  if (!element) return;

  // Evita el warning de accesibilidad de Chrome: nunca ocultamos un modal
  // mientras un botón/input que está dentro todavía conserva el foco.
  const active = document.activeElement;
  if (active && element.contains(active)) active.blur();

  element.inert = true;
  element.hidden = true;
  element.setAttribute('aria-hidden', 'true');

  if (![ui.modal, ui.noModal, ui.msgModal].some(el => el && !el.hidden)) {
    document.body.classList.remove('rsvp-modal-open');
  }
}

function showMessage({ icon = '♡', title = 'Gracias', text, button = 'Continuar viendo la invitación' }) {
  ui.msgIcon.textContent = icon;
  ui.msgTitle.textContent = title;
  ui.msgText.textContent = text;
  ui.msgClose.textContent = button;
  showOverlay(ui.msgModal);
}

function markStatus(text) {
  ui.status.textContent = text;
  ui.status.hidden = false;
}

function lockForm(message = 'Respuesta registrada ♡') {
  state.locked = true;
  ui.form.classList.add('is-locked');
  ui.email.disabled = true;
  ui.yes.disabled = true;
  ui.no.disabled = true;
  markStatus(message);
}

function unlockForm() {
  state.locked = false;
  ui.form.classList.remove('is-locked');
  ui.email.disabled = false;
  ui.yes.disabled = false;
  ui.no.disabled = false;
  ui.status.hidden = true;
}

// El correo es opcional: devolvemos '' cuando no se proporciona.
// Solo rechazamos un valor no vacío con formato incorrecto.
function optionalEmail() {
  const email = ui.email.value.trim();
  if (validEmail(email)) return email;

  ui.email.focus({ preventScroll: false });
  showMessage({
    icon: '✉',
    title: 'Revisa el correo',
    text: 'El correo electrónico es opcional. Puedes dejarlo vacío o escribir una dirección válida para que tengamos otra forma de comunicarnos.'
  });
  return null;
}

function setCount(value) {
  state.count = Math.max(1, Math.min(state.maxPeople, Number(value) || 1));
  ui.count.textContent = String(state.count);
  ui.minus.disabled = state.count <= 1;
  ui.plus.disabled = state.count >= state.maxPeople;
}

function renderNameFields() {
  const previous = [...ui.list.querySelectorAll('input')].map(i => i.value);
  ui.list.innerHTML = '';

  for (let i = 0; i < state.count; i += 1) {
    const wrap = document.createElement('div');
    wrap.className = 'rsvp-person-field';

    const label = document.createElement('label');
    label.htmlFor = `rsvp-person-${i}`;
    label.textContent = i === 0 ? 'Tu nombre completo' : `Acompañante ${i}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `rsvp-person-${i}`;
    input.name = `person-${i}`;
    input.maxLength = 120;
    input.autocomplete = i === 0 ? 'name' : 'off';
    input.placeholder = i === 0 ? 'Tu nombre completo' : `Nombre completo del acompañante ${i}`;
    input.value = previous[i] || '';
    input.required = true;

    wrap.append(label, input);
    ui.list.appendChild(wrap);
  }
}

function showStep(step, { focus = true } = {}) {
  state.step = step;
  if (step === 'count') ui.stepNames.classList.remove('rsvp-one-person');
  const countStep = step === 'count';

  ui.stepCount.hidden = !countStep;
  ui.stepNames.hidden = countStep;
  ui.stepBadge.textContent = state.maxPeople <= 1
    ? 'CONFIRMACIÓN'
    : (countStep ? 'PASO 1 DE 2' : 'PASO 2 DE 2');

  if (!countStep && focus) {
    requestAnimationFrame(() => ui.list.querySelector('input')?.focus({ preventScroll: true }));
  }
}

function prepareNamesStep() {
  renderNameFields();
  ui.stepNames.classList.toggle('rsvp-one-person', state.count === 1);
  ui.namesCopy.textContent = state.count === 1
    ? 'Solo regálanos tu nombre completo, por favor. ♡'
    : `Escribe el nombre completo de las ${state.count} personas que asistirán.`;
  ui.back.hidden = state.maxPeople <= 1;
  showStep('names');
}

function openAttendeeModal() {
  if (state.locked || state.submitting) return;

  state.count = 1;
  setCount(1);
  ui.countText.textContent = `Tu invitación permite hasta ${state.maxPeople} ${state.maxPeople === 1 ? 'persona' : 'personas'}, incluyéndote.`;

  showOverlay(ui.modal);

  if (state.maxPeople <= 1) {
    prepareNamesStep();
  } else {
    showStep('count', { focus: false });
  }
}

function closeAttendeeModal({ resetRadio = true } = {}) {
  hideOverlay(ui.modal);
  ui.list.innerHTML = '';
  showStep('count', { focus: false });
  if (resetRadio && !state.locked) ui.yes.checked = false;
}

function collectNames() {
  const inputs = [...ui.list.querySelectorAll('input')];
  const names = inputs.map(i => i.value.trim());
  const bad = inputs.find(i => !i.value.trim());
  if (bad) {
    bad.focus();
    showMessage({
      icon: '✎',
      title: 'Nos falta un nombre',
      text: 'Completa el nombre de cada persona que asistirá para poder reservar correctamente sus lugares.'
    });
    return null;
  }
  return names;
}

async function friendlyError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');

  if (/ya fue respondida|respuesta ya existe|already/i.test(msg)) {
    return 'Esta invitación ya tiene una respuesta registrada y no puede modificarse desde el enlace público.';
  }

  if (code.includes('permission-denied')) {
    // No convertimos automáticamente cualquier 403 en "ya respondiste".
    // Primero verificamos el único indicador público permitido: responded.
    try {
      const snap = await getDoc(ref('publicInvitations', state.token));
      if (snap.exists() && snap.data().responded === true) {
        return 'Esta invitación ya tiene una respuesta registrada y no puede modificarse desde el enlace público.';
      }
    } catch (_) {
      // Si la verificación falla, mostramos un mensaje neutro al invitado.
    }
    return 'No pudimos registrar tu respuesta en este momento. Inténtalo nuevamente; si el problema continúa, contáctanos directamente.';
  }

  if (/no está disponible|not available/i.test(msg)) {
    return 'Esta invitación ya no está disponible. Si crees que es un error, escríbenos directamente.';
  }
  if (/cantidad|nombres|asistentes/i.test(msg)) {
    return 'Revisa la cantidad de asistentes y los nombres antes de guardar.';
  }
  return 'No pudimos guardar la respuesta. Revisa tu conexión e inténtalo nuevamente.';
}

async function saveYes() {
  if (state.submitting || state.locked) return;
  const email = optionalEmail();
  if (email === null) return;
  const names = collectNames();
  if (!names) return;

  state.submitting = true;
  ui.save.disabled = true;
  ui.save.textContent = 'Guardando...';

  try {
    await submitRSVP(state.token, true, names, email);
    hideOverlay(ui.modal);
    lockForm('✓ Asistencia confirmada');
    ui.yes.checked = true;
    showMessage({
      icon: '♡',
      title: '¡Confirmación recibida!',
      text: 'Gracias por acompañarnos. Nos emociona muchísimo compartir este día contigo. Más adelante compartiremos por WhatsApp la información de tu asiento.'
    });
  } catch (error) {
    console.error('No se pudo guardar el RSVP:', error);
    showMessage({ icon: '!', title: 'No pudimos guardar', text: await friendlyError(error) });
  } finally {
    state.submitting = false;
    ui.save.disabled = false;
    ui.save.textContent = 'Guardar';
  }
}

async function saveNo() {
  if (state.submitting || state.locked) return;
  const email = optionalEmail();
  if (email === null) {
    hideOverlay(ui.noModal);
    ui.no.checked = false;
    return;
  }

  state.submitting = true;
  ui.confirmNo.disabled = true;
  ui.confirmNo.textContent = 'Guardando...';

  try {
    await submitRSVP(state.token, false, [], email);
    hideOverlay(ui.noModal);
    lockForm('Respuesta registrada ♡');
    ui.no.checked = true;
    showMessage({
      icon: '♡',
      title: 'Gracias por responder',
      text: 'Gracias por regalarnos un momento de tu tiempo. Aunque no puedas acompañarnos ese día, te apreciamos mucho y nos alegra que formes parte de nuestra historia.'
    });
  } catch (error) {
    console.error('No se pudo guardar el RSVP negativo:', error);
    hideOverlay(ui.noModal);
    showMessage({ icon: '!', title: 'No pudimos guardar', text: await friendlyError(error) });
  } finally {
    state.submitting = false;
    ui.confirmNo.disabled = false;
    ui.confirmNo.textContent = 'Estoy seguro';
  }
}

async function loadInvitation() {
  state.token = invitationToken();

  if (!/^[a-f0-9]{64}$/i.test(state.token)) {
    ui.name.value = 'Invitación no válida';
    lockForm('Enlace de invitación no válido');
    return;
  }

  try {
    const snap = await getDoc(ref('publicInvitations', state.token));
    if (!snap.exists() || snap.data().active !== true) {
      ui.name.value = 'Invitación no disponible';
      lockForm('Esta invitación no está disponible');
      return;
    }

    state.invitation = snap.data();
    state.maxPeople = Math.max(1, Math.min(20, Number(state.invitation.maxPeople) || 1));
    ui.name.value = state.invitation.name || 'Invitado especial';

    if (state.invitation.responded === true) {
      lockForm('✓ Respuesta ya registrada');
    } else {
      unlockForm();
    }
  } catch (error) {
    console.error('No se pudo cargar la invitación:', error);
    ui.name.value = 'No pudimos cargar la invitación';
    lockForm('Revisa tu conexión y vuelve a intentarlo');
  }
}

ui.yes?.addEventListener('change', () => {
  if (!ui.yes.checked || state.locked) return;
  const email = optionalEmail();
  if (email === null) {
    ui.yes.checked = false;
    return;
  }
  openAttendeeModal();
});

ui.no?.addEventListener('change', () => {
  if (!ui.no.checked || state.locked) return;
  const email = optionalEmail();
  if (email === null) {
    ui.no.checked = false;
    return;
  }
  showOverlay(ui.noModal);
});

ui.minus?.addEventListener('click', () => setCount(state.count - 1));
ui.plus?.addEventListener('click', () => setCount(state.count + 1));
ui.next?.addEventListener('click', prepareNamesStep);
ui.back?.addEventListener('click', () => showStep('count', { focus: false }));
ui.save?.addEventListener('click', saveYes);
ui.close?.addEventListener('click', () => closeAttendeeModal());

ui.betterYes?.addEventListener('click', () => {
  hideOverlay(ui.noModal);
  ui.no.checked = false;
  ui.yes.checked = true;
  openAttendeeModal();
});

ui.confirmNo?.addEventListener('click', saveNo);
ui.msgClose?.addEventListener('click', () => hideOverlay(ui.msgModal));

[ui.modal, ui.noModal].forEach(overlay => {
  overlay?.addEventListener('click', event => {
    if (event.target !== overlay) return;
    if (overlay === ui.modal) closeAttendeeModal();
    if (overlay === ui.noModal) {
      hideOverlay(ui.noModal);
      if (!state.locked) ui.no.checked = false;
    }
  });
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!ui.modal.hidden) closeAttendeeModal();
  else if (!ui.noModal.hidden) {
    hideOverlay(ui.noModal);
    if (!state.locked) ui.no.checked = false;
  } else if (!ui.msgModal.hidden) hideOverlay(ui.msgModal);
});

loadInvitation();
