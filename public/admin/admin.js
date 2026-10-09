import { db } from '../js/firebase.js';
import { auth } from '../js/firebase-auth.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { runTransaction } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { watch, ref, getDoc, setDoc, saveGuest, saveTable, assignSeat, deleteTable, submitRSVP } from '../js/data.js?v=15';
import { participants } from '../js/domain.js';
import { escapeHTML as e, toast, dialog, errorMessage } from '../js/ui.js';
const $ = s => document.querySelector(s);
const state = {guests:[],responses:[],participants:[],tables:[]};

// OPTIMIZACIÓN DE LECTURAS FIRESTORE
// ---------------------------------
// Antes, el panel abría listeners de guests, responses, participants y tables en
// cada inicio de sesión, incluso si la vista actual no utilizaba esos datos.
// Ahora cada listener se inicia solamente cuando una pantalla lo necesita.
// Una vez iniciado se conserva hasta cerrar sesión para evitar volver a leer toda
// la colección al entrar y salir repetidamente de una sección.
const loadedCollections = new Set();
const pendingWatches = new Map();
let dataTransition = false;

const pageCollections = {
  home: ['guests','responses','tables'],
  guests: ['guests','responses','participants','tables'],
  cards: ['guests','responses'],
  'card-manager': ['guests'],
  people: ['guests','responses','participants','tables'],
  tables: ['guests','responses','participants','tables'],
  album: ['guests','responses','participants','tables'],
  settings: []
};

function pageFromHash() {
  const wanted = location.hash.slice(1) || 'home';
  return pages.some(p => p[0] === wanted) ? wanted : 'home';
}

function ensureWatch(name, currentSession) {
  if (loadedCollections.has(name)) return Promise.resolve();
  if (pendingWatches.has(name)) return pendingWatches.get(name);

  const firstSnapshot = new Promise((resolve, reject) => {
    let first = true;
    const stop = watch(name, data => {
      if (currentSession !== session) {
        if (first) resolve();
        return;
      }

      state[name] = data;
      loadedCollections.add(name);

      if (first) {
        first = false;
        resolve();
      } else if (ready && !dataTransition) {
        render();
      }
    }, err => {
      if (first) {
        first = false;
        reject(err);
        return;
      }
      ready = false;
      $('#content').innerHTML = empty('No pudimos cargar los datos', e(errorMessage(err)));
      toast(errorMessage(err), true);
    });
    subscriptions.push(stop);
  });

  pendingWatches.set(name, firstSnapshot);
  firstSnapshot.then(() => pendingWatches.delete(name), () => pendingWatches.delete(name));
  return firstSnapshot;
}

async function ensurePageData(targetPage, currentSession = session) {
  const required = pageCollections[targetPage] || pageCollections.home;
  await Promise.all(required.map(name => ensureWatch(name, currentSession)));
}
const pages = [['home','Inicio','⌂'],['guests','Invitados','♧'],['cards','Tarjetas','▱'],['card-manager','Gestión de tarjetas','▤'],['people','Participantes','♙'],['tables','Mesas y asientos','⊙'],['album','Álbum','❧'],['settings','Configuración','⚙']];
let ready = false, subscriptions = [], selected = '', search = '', filter = 'all', page = 'home', session = 0;
// Se activa solo cuando pulsas Editar dentro de Gestión de tarjetas.
let editingManagedCardId = '';
const status = g => { const r = state.responses.find(r => r.id === g.token); return !r ? 'pending' : r.attending ? 'yes' : 'no'; };
const labels = {pending:'Pendiente',yes:'Confirmado',no:'No asistirá'};
const badge = g => `<span class="badge ${status(g)}">${labels[status(g)]}</span>`;
const people = () => participants(state.guests,state.responses,state.participants);
const initials = name => e(name.split(/\s+/).slice(0,2).map(n => n[0]).join('').toUpperCase());
// OPCIONAL: si administras desde localhost pero tu invitación ya está publicada,
// indica la URL pública HTTPS de la página inicial (sin token).
// Ejemplo: 'https://tusitio.web.app/index.html'. En blanco conserva el comportamiento original.
const PUBLIC_INVITATION_BASE_URL = '';
const url = g => {
  const u = new URL(PUBLIC_INVITATION_BASE_URL || '../index.html', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('token', g.token);
  return u.href;
};
// WhatsApp comparte texto y un enlace real; nunca se incrusta un enlace funcional en un PNG.
// Mensaje sobrio: se genera desde el invitado YA cargado. Cero lecturas nuevas.
const whatsappMessage = g => {
  const cupos = Number(g.maxPeople) === 1
    ? 'Hemos reservado *un lugar especialmente para ti*.'
    : `Hemos reservado *${g.maxPeople} lugares para ustedes*, incluyéndote.`;
  return `*Una invitación especial para ${g.name}*\n\n` +
    `«El amor nunca deja de ser.»\n*1 Corintios 13:8*\n\n` +
    `Damos gracias a Dios por permitirnos dar este paso. Nos llenaría de alegría compartir contigo el comienzo de nuestra vida matrimonial.\n\n` +
    `${cupos}\n\n` +
    `*Abre tu invitación personal y confirma tu asistencia:*\n${url(g)}\n\n` +
    `Con cariño y gratitud,\n*Josué & Bertha*\n19 de diciembre de 2026 · 5:00 p. m.`;
};
const whatsappUrl = g => `https://wa.me/?text=${encodeURIComponent(whatsappMessage(g))}`;
// No usamos enlaces permanentes si el administrador está en localhost.
// Para enlaces oficiales puedes definir PUBLIC_INVITATION_BASE_URL arriba.
const isPreviewChannelUrl = g => /--[^/]+\.web\.app$/i.test(new URL(url(g)).hostname);
const isLocalInvitationUrl = g => {
  const invitationUrl = new URL(url(g));
  const hostname = invitationUrl.hostname.toLowerCase();
  return invitationUrl.protocol !== 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local') || hostname.startsWith('192.168.') || hostname.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);
};
const date = value => value?.toDate ? value.toDate().toLocaleString('es-NI',{timeZone:'America/Managua'}) : '—';
const empty = (title, text) => `<div class="empty"><div class="empty-icon">❧</div><h3>${title}</h3><p>${text}</p></div>`;
function heading(title, subtitle, action='') { return `<div class="page-heading"><div><p class="eyebrow">BERTHA & JOSUE / ${e(pages.find(p=>p[0]===page)?.[1] || '')}</p><h1>${title}</h1><p class="muted">${subtitle}</p></div>${action}</div>`; }
function button(action,text,id='',cls=''){return `<button class="${cls}" data-action="${action}" data-id="${e(id)}">${text}</button>`;}
function input(name,label,value='',type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;}
// ====== V14 · CONTROL DE INVITACIONES REPETIDAS (sin nuevas lecturas) ======
// Advertencias preventivas. No son una garantía de unicidad en la base de datos.
// Solo inspecciona state.guests, incluida la lista de archivados.
function normalizedGuestTokens(name) {
  const clean = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const noise = new Set(['de','del','la','las','los','el','y','sr','sra','don','dona','familia']);
  return clean.split(' ').filter(t => t.length > 1 && !noise.has(t)).sort();
}
// Distancia de edición con intercambio de letras adyacentes (Josue/Josué, Ramon/Roman).
function guestTokenDistance(a,b) {
  if (a === b) return 0;
  const dp = Array.from({length:a.length+1}, () => Array(b.length+1).fill(0));
  for (let i=0;i<=a.length;i++) dp[i][0]=i;
  for (let j=0;j<=b.length;j++) dp[0][j]=j;
  for (let i=1;i<=a.length;i++) for (let j=1;j<=b.length;j++) {
    const cost = a[i-1] === b[j-1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    if (i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) {
      dp[i][j] = Math.min(dp[i][j],dp[i-2][j-2]+1);
    }
  }
  return dp[a.length][b.length];
}
function compareGuestNames(first, second) {
  const a = normalizedGuestTokens(first), b = normalizedGuestTokens(second);
  if (!a.length || !b.length) return null;
  if (a.join(' ') === b.join(' ')) return { score:100, reason:'Mismo nombre (ignora tildes y orden)' };
  const edges = [];
  for (let i=0;i<a.length;i++) for (let j=0;j<b.length;j++) {
    const limit = Math.max(a[i].length,b[j].length) >= 5 ? 2 : 1;
    const d = guestTokenDistance(a[i],b[j]);
    if (d <= limit && d / Math.max(a[i].length,b[j].length) <= 0.40) {
      edges.push({i,j,d});
    }
  }
  edges.sort((x,y)=>x.d-y.d);
  const usedA=new Set(),usedB=new Set();let matched=0,edit=0;
  for (const edge of edges) {
    if (usedA.has(edge.i) || usedB.has(edge.j)) continue;
    usedA.add(edge.i);usedB.add(edge.j);matched++;edit+=edge.d;
  }
  // Dos componentes similares son necesarios para evitar avisos por "José" o "Castillo" solos.
  if (matched >= 2 && matched / Math.min(a.length,b.length) >= 0.66) {
    return {score:Math.round(88 - edit*4 - (Math.max(a.length,b.length)-matched)*4), reason:'Nombre y apellidos muy parecidos'};
  }
  // También cubre una invitación introducida solo con un apellido o un nombre propio.
  if (a.length === 1 && b.length === 1 && matched === 1) {
    return {score:80-edit*8,reason:'Nombre muy parecido'};
  }
  return null;
}
function findSimilarGuests(name, excludedId='') {
  return state.guests.flatMap(g=>{
    if(g.id === excludedId)return [];
    const similarity=compareGuestNames(name,g.name);
    return similarity ? [{...similarity, guest:g}] : [];
  }).sort((a,b)=>b.score-a.score).slice(0,4);
}
function duplicatesMarkup(name, excludedId) {
  const matches=findSimilarGuests(name,excludedId);
  if(!matches.length)return '';
  return `<div class="duplicate-alert" role="status"><strong>✦ Ya existe ${matches.length===1?'una invitación parecida':'invitaciones parecidas'}</strong><p>Comprueba que no sea la misma persona antes de guardar.</p><div class="duplicate-match-list">`+
    matches.map(({guest:g,reason})=>`<div class="duplicate-match">
      <div class="duplicate-match-art" aria-hidden="true"><img src="tarjeta-molde.png" alt=""><span>${e(g.name)}</span></div>
      <div class="duplicate-match-text"><strong>${e(g.name)}</strong><small>${e(reason)} · ${g.maxPeople} ${g.maxPeople===1?'cupo':'cupos'} · ${g.active?'Activa':'Archivada'} · ${g.configured?'Configurada':'Pendiente'}</small><button type="button" data-duplicate-view="${e(g.id)}">Ver tarjeta existente ↗</button></div>
    </div>`).join('')+`</div></div>`;
}
function paintDuplicateHint(inputElement) {
  if(!inputElement?.matches('[data-duplicate-name]'))return;
  const form=inputElement.closest('form');
  const container=form?.querySelector('.duplicate-hints');
  if(container)container.innerHTML=duplicatesMarkup(inputElement.value,inputElement.dataset.duplicateExclude || '');
}
function duplicateField(excludedId='') {
  return `<div class="duplicate-hints" aria-live="polite" data-for="${e(excludedId)}"></div>`;
}
let duplicateNavigationPending = '';
function takeDuplicateNavigation() {
  if(!duplicateNavigationPending)return false;
  const id=duplicateNavigationPending;
  duplicateNavigationPending='';
  goToExistingInvitation(id);
  return true;
}
function goToExistingInvitation(id) {
  const g=state.guests.find(item=>item.id===id);
  if(!g)return;
  selected=id;
  editingManagedCardId=g.configured?id:'';
  const destination=g.configured?'card-manager':'cards';
  if(pageFromHash()===destination)render();
  else location.hash=destination;
}
document.addEventListener('click', event=>{
  const hit=event.target.closest('[data-duplicate-view]');
  if(!hit)return;
  event.preventDefault();
  const id=hit.dataset.duplicateView;
  const modal=hit.closest('dialog.app-dialog');
  if(modal){
    // El flujo que abrió el diálogo tomará esta navegación al recibir "Cancelar".
    // Así evitamos reabrir accidentalmente otro diálogo encima de la tarjeta.
    duplicateNavigationPending=id;
    modal.querySelector('[data-cancel]')?.click();
  }else goToExistingInvitation(id);
});
// ====== FIN CONTROL DE INVITACIONES REPETIDAS ======

function guestCard(g) {
  const r = state.responses.find(r=>r.id===g.token), group = people().filter(p=>p.guestId===g.id);
  const tables = [...new Set(group.map(p=>state.tables.find(t=>t.id===p.tableId)?.name).filter(Boolean))];
  return `<article class="guest-card"><div class="card-top"><span class="avatar">${initials(g.name)}</span>${g.active ? badge(g) : '<span class="badge no">Archivada</span>'}</div><h3>${e(g.name)}</h3><small>${g.configured?'Tarjeta configurada':'Tarjeta por configurar'}</small><div class="card-facts"><span><strong>${g.maxPeople}</strong>Lugares reservados</span><span><strong>${r?.attending?r.names.length:0}</strong>Confirmados</span></div><p class="muted">${e(tables.join(', ') || 'Sin mesa asignada')}</p><div class="actions">${button('edit','Editar',g.id)}${button('card','Tarjeta ↗',g.id)}${button('rsvp','Asistentes',g.id)}${button(g.active?'archive':'restore',g.active?'Archivar':'Restaurar',g.id)}</div></article>`;
}
function home() {
  const gs=state.guests.filter(g=>g.active), confirmed=state.responses.filter(r=>r.attending && gs.some(g=>g.token===r.id)).reduce((n,r)=>n+(r.names?.length||0),0), seats=state.tables.reduce((n,t)=>n+t.capacity,0), occupied=state.tables.reduce((n,t)=>n+Object.keys(t.seats).length,0);
  const stats=[['Invitaciones activas',gs.length,'▱'],['Invitados principales',gs.length,'♙'],['Lugares reservados',gs.reduce((n,g)=>n+g.maxPeople,0),'♧'],['Personas confirmadas',confirmed,'✓'],['Cupos pendientes de respuesta',gs.filter(g=>status(g)==='pending').reduce((n,g)=>n+g.maxPeople,0),'◷'],['Cupos que no asistirán',gs.filter(g=>status(g)==='no').reduce((n,g)=>n+g.maxPeople,0),'—'],['Mesas creadas',state.tables.length,'⊙'],['Asientos disponibles',seats-occupied,'◇'],['Asientos ocupados',occupied,'◉']];
  const recent = state.responses.filter(r=>gs.some(g=>g.token===r.id)).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0)).slice(0,6);
  const days=Math.max(0,Math.ceil((new Date('2026-12-19T17:00:00-06:00')-new Date())/86400000));
  return heading('Todo comienza con un sí.','Cada persona, cada detalle, en un mismo lugar.',button('add','+ Agregar invitado','','primary'))+`<section class="hero"><div><span class="eyebrow">NUESTRO GRAN DÍA</span><h2>Una celebración.<br>Muchas personas especiales.</h2><p>Estamos preparando un lugar para cada historia que nos ha acompañado hasta aquí.</p></div><div class="count">${days}<small>DÍAS PARA EL SÍ</small></div></section><div class="stats">${stats.map(([l,v,i])=>`<div class="stat"><span>${l}</span><i>${i}</i><strong>${v.toString().padStart(2,'0')}</strong></div>`).join('')}</div><section class="panel"><div class="panel-head"><h3>Las últimas respuestas</h3><span class="eyebrow">EN TIEMPO REAL</span></div>${recent.length?recent.map(r=>{const g=gs.find(g=>g.token===r.id);return `<div class="row"><span class="avatar">${initials(g.name)}</span><div class="grow"><p>${e(g.name)}</p><small>${date(r.updatedAt)} · ${r.names.length} personas</small></div>${badge(g)}${button('card','Ver tarjeta',g.id)}</div>`;}).join(''):empty('Las respuestas llegarán aquí','Comparte las primeras invitaciones para comenzar.')}</section>`;
}
function guests() {
  const list=state.guests.filter(g=>g.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).filter(g=>filter==='archived'?!g.active:g.active && (filter==='all'||status(g)===filter||(filter==='configured'&&g.configured)||(filter==='unconfigured'&&!g.configured)));
  return heading('Personas que hacen historia.','Invitaciones únicas para quienes queremos cerca.',button('add','+ Agregar invitado','','primary'))+`<div class="toolbar"><input id="search" aria-label="Buscar invitado" placeholder="Buscar por nombre o familia…" value="${e(search)}"><select id="filter" aria-label="Filtrar invitados">${[['all','Todos'],['yes','Confirmados'],['pending','Pendientes'],['no','No asistirán'],['configured','Tarjeta configurada'],['unconfigured','Tarjeta pendiente'],['archived','Archivados']].map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="grid">${list.map(guestCard).join('')||empty('Un lugar para cada persona','Aún no hay invitados en esta vista. Agrega una invitación para comenzar.')}</div>`;
}
function cardArtwork(g, compact=false) {
  return `<div class="invite-card-art ${compact?'invite-card-art--compact':''}" aria-label="Tarjeta personal de ${e(g.name)}">
    <img src="tarjeta-molde.png" alt="" aria-hidden="true">
    <div class="invite-card-name">${e(g.name)}</div>
    <a class="invite-card-link" href="${e(url(g))}" target="_blank" rel="noopener noreferrer" aria-label="Abrir invitación de ${e(g.name)}">ABRIR INVITACIÓN</a>
  </div>`;
}
// El editor se reutiliza en dos contextos: pendientes y edición explícita desde Gestión.
function cardEditor(g) {
  return `<div class="split card-builder-layout">
    <section class="panel card-editor-panel">
      <form id="card-form">
        ${input('name','Invitación dirigida a',g.name,'text',`required maxlength="120" data-duplicate-name data-duplicate-exclude="${e(g.id)}"`)}${duplicateField(g.id)}
        ${input('maxPeople','Lugares reservados (incluye al invitado principal)',g.maxPeople,'number','required min="1" max="20"')}
        <label>Mensaje personal<textarea name="message" maxlength="600">${e(g.message||'')}</textarea></label>
        <button class="primary" type="submit">Guardar tarjeta</button>
      </form>
      <div class="row">${loadedCollections.has('responses')?badge(g):'<span class="badge">Tarjeta configurada</span>'}<small>${g.configured?'Configurada':'Pendiente de configurar'} · ${g.active?'Activa':'Archivada'}</small></div>
      <small>Creada: ${date(g.createdAt)}<br>Modificada: ${date(g.updatedAt)}</small>
      <p class="eyebrow" style="margin-top:22px">ENLACE PERSONAL</p>
      <p class="token">${e(url(g))}</p>
      <details><summary>Token de invitación</summary><p class="token">${e(g.token)}</p></details>
      <div class="actions" style="margin-top:18px">${button('copy','Copiar enlace',g.id)}${button('open','Ver invitación ↗',g.id)}${g.configured&&g.active?button('whatsapp','Compartir por WhatsApp',g.id):''}</div>
      <div class="danger-zone">${button('rotate','Regenerar token',g.id,'danger')}<p class="muted">El enlace anterior dejará de funcionar.</p></div>
    </section>
    <section class="card-preview-shell" aria-label="Vista previa de la tarjeta">
      ${cardArtwork(g)}
      <p class="card-preview-note">El nombre y “Abrir invitación” son elementos dinámicos. El botón abre exactamente el enlace único asociado al token de esta invitación.</p>
    </section>
  </div>`;
}

function cards() {
  // NUNCA mostrar como seleccionada una tarjeta ya configurada.
  // Solo se ofrecen tarjetas activas que siguen pendientes de configuración.
  const pending = state.guests.filter(g => g.active && !g.configured);
  const g = pending.find(g => g.id === selected) || pending[0];
  if (!g) {
    selected = '';
    return heading('Una invitación, una historia.', 'Aquí solo aparecen las tarjetas pendientes.', button('add','+ Agregar invitado','','primary')) +
      empty('No hay tarjetas pendientes de configurar', 'Agrega un invitado para configurar su tarjeta. Las que ya guardaste están en Gestión de tarjetas.');
  }
  selected = g.id;
  return heading('Una invitación, una historia.', 'Configura las tarjetas pendientes. Las ya creadas se administran en Gestión de tarjetas.') +
    `<div class="toolbar"><select id="card-select" aria-label="Seleccionar invitación pendiente">${pending.map(x=>`<option value="${e(x.id)}" ${g.id===x.id?'selected':''}>${e(x.name)}</option>`).join('')}</select></div>` +
    cardEditor(g);
}

function cardManager() {
  const configured = state.guests.filter(g => g.configured);
  // Editar una tarjeta existente es una acción EXPLÍCITA, desde esta misma sección.
  const editing = configured.find(g => g.id === editingManagedCardId);
  if (editing) {
    selected = editing.id;
    return heading('Editar tarjeta existente.', 'Modifica únicamente la tarjeta que elegiste.', button('manager-back','← Volver a tarjetas')) + cardEditor(editing);
  }
  editingManagedCardId = '';
  return heading('Tarjetas listas para compartir.', 'Cada tarjeta tiene su propio destinatario; la portada y la dedicatoria conservan nuestra identidad.') +
    `<div class="share-manager-intro"><span class="share-manager-seal" aria-hidden="true">J<span>&</span>B</span><div><span class="eyebrow">CORRESPONDENCIA ESPECIAL</span><h2>Un mensaje preparado con cariño.</h2><p>Elige una tarjeta y revisa cómo llegará el mensaje antes de abrir WhatsApp.</p></div><span class="share-manager-count">${configured.length}<small>tarjetas listas</small></span></div>` +
    (configured.length
      ? `<div class="card-manager-grid">${configured.map(g=>`<article class="managed-card ${!g.active?'is-archived':''}">
          ${cardArtwork(g,true)}
          <div class="managed-card-info">
            <div><span class="eyebrow">${g.active?'LISTA PARA COMPARTIR':'ARCHIVADA'}</span><h3>${e(g.name)}</h3><small>${g.maxPeople} ${g.maxPeople===1?'lugar reservado':'lugares reservados'}</small></div>
            <div class="share-card-actions">
                ${g.active?button('whatsapp','✦ Preparar envío por WhatsApp',g.id,'share-launch'):''}
                <div class="share-card-tools">
                  ${button('manager-edit','Editar',g.id)}
                  ${button('copy','Copiar enlace',g.id)}
                  ${button('open','Vista previa ↗',g.id)}
                </div>
              </div>
          </div>
        </article>`).join('')}</div>`
      : empty('Todavía no hay tarjetas guardadas', 'Configura una tarjeta en la sección Tarjetas y aparecerá automáticamente aquí.'));
}

const places = n => Number(n)===1?'Hemos reservado 1 lugar para ti.':`Hemos reservado ${n} lugares para ustedes.`;
function participantView(album=false) {
  const ps=people().filter(p=>`${p.name} ${p.invitation}`.toLowerCase().includes(search.toLowerCase()));
  return heading(album?'Álbum de nuestra boda.':'Cada nombre tiene su lugar.',album?'Las personas que forman parte de nuestra historia.':'Confirmados y vinculados a su invitación de origen.')+`<div class="toolbar"><input id="search" aria-label="Buscar participante" placeholder="Buscar persona o invitación…" value="${e(search)}"></div>${album?'<p class="note">Edición Spark · Álbum con iniciales y roles. La subida de fotografías está pendiente.</p>':''}<div class="grid">${ps.map(p=>`<article class="guest-card ${album?'album-card':''}">${album?`<div class="portrait">${initials(p.name)}</div>`:`<div class="card-top"><span class="avatar">${initials(p.name)}</span><span class="badge yes">Confirmado</span></div>`}<h3>${e(p.name)}</h3><p class="muted">${e(p.invitation)}</p><span class="badge">${e(p.role || (p.index===0?'Invitado principal':'Acompañante'))}</span><p class="muted">${e(state.tables.find(t=>t.id===p.tableId)?.name || 'Sin mesa')} ${p.tableId?`· Asiento ${p.seat}`:''}</p><div class="actions">${button('profile','Editar rol',p.id)}${button('seat','Asignar asiento',p.id)}${button('card','Ver invitación',p.guestId)}</div></article>`).join('')||empty('Las personas hacen la celebración','Los participantes aparecerán cuando se confirme la asistencia.')}</div>`;
}
function tables() {
  const ps=people();
  return heading('Un lugar para compartir.','Organiza mesas y asientos, sin perder ningún detalle.',button('new-table','+ Crear mesa','','primary'))+`<p class="note">${ps.filter(p=>!p.tableId).length} participantes sin mesa. Usa “Asignar” para elegir una persona y un asiento disponible.</p><div class="grid">${state.tables.map(t=>`<article class="guest-card"><div class="card-top"><span class="eyebrow">DISTRIBUCIÓN</span><span class="badge">${Object.keys(t.seats).length} / ${t.capacity}</span></div><div class="table-art"><strong>${e(t.name.replace(/mesa\s*/i,''))}</strong>${Array.from({length:Math.min(t.capacity,16)},(_,i)=>`<i class="seat-dot ${i<Object.keys(t.seats).length?'filled':''}" style="left:calc(50% + ${Math.cos(i/Math.min(t.capacity,16)*Math.PI*2)*66}px - 6px);top:calc(50% + ${Math.sin(i/Math.min(t.capacity,16)*Math.PI*2)*66}px - 6px)"></i>`).join('')}</div><h3>${e(t.name)}</h3><p class="muted">${t.capacity-Object.keys(t.seats).length} asientos disponibles</p><div class="seat-list">${Object.entries(t.seats).sort((a,b)=>a[1]-b[1]).map(([id,n])=>`<div class="row"><span>${n}. ${e(ps.find(p=>p.id===id&&p.tableId===t.id)?.name || 'Confirmación retirada / invitado archivado')}</span>${button('release','Quitar',id)}</div>`).join('')}</div><div class="actions" style="margin-top:20px">${button('table-assign','Asignar',t.id)}${button('edit-table','Editar',t.id)}${button('delete-table','Eliminar',t.id,'danger')}</div></article>`).join('')||empty('Diseña el encuentro','Crea la primera mesa y empieza a distribuir a tus invitados.')}</div>`;
}
function settings(){return heading('Cada detalle, en orden.','Configuración y acceso a tu espacio de administración.')+`<section class="panel"><h3>Bertha & Josue</h3><div class="settings-list"><p>Fecha de la boda: <strong>19 de diciembre de 2026 · 17:00 · Nicaragua</strong></p><p>Proyecto Firebase: <strong>amor-772d4</strong></p><p>Sesión: <strong>${e(auth.currentUser.email)}</strong></p><p>Plan: <strong>Spark · sin Storage ni servicios de pago</strong></p><p>Los administradores se autorizan desde Firebase Console mediante <code>admins/UID</code>. No hay registro público.</p><p>Los enlaces son privados por posesión: compártelos únicamente con su destinatario. Quien tenga un enlace puede consultar y responder esa invitación.</p><p>Al archivar se conserva la historia y se desactiva el enlace. Las plazas de mesa se conservan hasta retirarlas explícitamente.</p></div><div class="actions"><a href="../docs/GUIA.md" target="_blank" rel="noopener">Leer guía de configuración ↗</a>${button('logout','Cerrar sesión')}</div></section>`;}
function render(){
  if(!ready || dataTransition)return;
  page=pageFromHash();
  if((page==='cards'||(page==='card-manager' && editingManagedCardId)) && $('#card-form')?.dataset.dirty==='true' && $('#card-form').dataset.guest===selected)return;
  $('#nav').innerHTML=pages.map(([id,label,icon])=>`<a href="#${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}><span>${icon}</span>${label}</a>`).join('');
  $('#breadcrumb').textContent=pages.find(p=>p[0]===page)[1];
  const active=document.activeElement, focused=active?.id, start=active?.selectionStart;
  $('#content').innerHTML=({home,guests,cards,'card-manager':cardManager,people:()=>participantView(),album:()=>participantView(true),tables,settings})[page]();
  if($('#card-form'))$('#card-form').dataset.guest=selected;
  if(focused==='search'){const el=$('#search');el.focus();el.setSelectionRange(start,start);}
}
window.addEventListener('hashchange',async()=>{
  search='';filter='all';
  const target=pageFromHash();
  if (target !== 'card-manager') editingManagedCardId = '';
  dataTransition=true;
  try {
    await ensurePageData(target);
  } catch(err) {
    ready=false;
    $('#content').innerHTML=empty('No pudimos cargar los datos',e(errorMessage(err)));
    toast(errorMessage(err),true);
    return;
  } finally {
    dataTransition=false;
  }
  ready=true;
  render();
});
document.addEventListener('input',event=>{
  if(event.target.matches('[data-duplicate-name]')) paintDuplicateHint(event.target);
  if(event.target.id==='search'){search=event.target.value;render();}
  if(event.target.closest('#card-form')){const f=$('#card-form');f.dataset.dirty='true';const name=$('.invite-card-name');if(name)name.textContent=f.elements.name.value;}
});
document.addEventListener('change',event=>{if(event.target.id==='filter'){filter=event.target.value;render();}if(event.target.id==='card-select'){selected=event.target.value;render();}});
async function editGuest(g){
  // Al regresar desde la alerta se conserva lo escrito; ninguna escritura ocurre sin confirmar.
  let draft={name:g?.name||'',maxPeople:String(g?.maxPeople||1)};
  for(;;){
    const fields=input('name','Nombre de la persona o familia',draft.name,'text',`required maxlength="120" data-duplicate-name data-duplicate-exclude="${e(g?.id||'')}"`)+duplicateField(g?.id||'')+
      input('maxPeople','Máximo de personas, incluyendo al principal',draft.maxPeople,'number','required min="1" max="20"');
    const data=await dialog(g?'Editar invitación':'Una persona especial',fields);
    if(!data){takeDuplicateNavigation();return;}
    draft={name:String(data.get('name')||'').trim(),maxPeople:String(data.get('maxPeople')||1)};
    const matches=findSimilarGuests(draft.name,g?.id||'');
    if(matches.length){
      const approve=await dialog('¿Esta persona ya tiene invitación?',
        `<p class="muted">Encontramos coincidencias con el nombre que escribiste. Revisa las tarjetas existentes para evitar duplicados.</p>${duplicatesMarkup(draft.name,g?.id||'')}`,
        'Guardar de todos modos','Corregir nombre');
      if(!approve){if(takeDuplicateNavigation())return;continue;}
    }
    const id=await saveGuest(g?.id,{...g,name:draft.name,maxPeople:draft.maxPeople});
    toast('Invitado guardado correctamente.');
    if(!g){
      const next=await dialog('Invitado registrado correctamente','<p>¿Deseas configurar ahora su tarjeta de invitación?</p>','Configurar tarjeta','Configurar después');
      if(next){selected=id;location.hash='cards';render();}
    }
    return;
  }
}
async function editRSVP(g){
  const response=state.responses.find(r=>r.id===g.token);
  const data=await dialog('Administrar asistentes',`<p>${e(g.name)} · máximo ${g.maxPeople} personas.</p><label>Respuesta<select name="attending"><option value="yes">Sí asistirán</option><option value="no" ${response?.attending===false?'selected':''}>No asistirán</option></select></label>${input('email','Correo de contacto (opcional)',response?.email||'','email','maxlength="254"')}<p class="muted">Deja vacíos los lugares que no se utilizarán. El primer nombre corresponde al invitado principal.</p>${Array.from({length:g.maxPeople},(_,i)=>input('person',`Asistente ${i+1}`,response?.names[i]||'','text','maxlength="120"')).join('')}`);
  if(data)await submitRSVP(g.token,data.get('attending')==='yes',data.get('attending')==='yes'?data.getAll('person').filter(n=>n.trim()):[],data.get('email'),true);
}
async function seatModal(p,tableId=''){
  const ps=people(), target=tableId||p?.tableId;
  if(!ps.length||!state.tables.length)throw Error('Primero necesitas participantes confirmados y una mesa.');
  const data=await dialog('Un lugar en la mesa',`<label>Participante<select name="person">${(p?[p]:ps).map(p=>`<option value="${p.id}">${e(p.name)} · ${e(p.invitation)}</option>`).join('')}</select></label><label>Mesa<select name="table">${state.tables.map(t=>`<option value="${t.id}" ${t.id===target?'selected':''}>${e(t.name)} · ${t.capacity-Object.keys(t.seats).length} libres</option>`).join('')}</select></label>${input('seat','Número de asiento',p?.seat||1,'number','required min="1" max="50"')}<p class="muted">Se verificará que el asiento esté libre al guardar. Si mueves a una persona, se libera su asiento anterior.</p>`,'Asignar');
  if(data)await assignSeat(ps.find(p=>p.id===data.get('person')),data.get('table'),data.get('seat'));
}
document.addEventListener('submit',async event=>{
  if(event.target.id!=='card-form')return;event.preventDefault();const b=event.target.querySelector('button');b.disabled=true;
  try{const g=state.guests.find(g=>g.id===selected),f=new FormData(event.target);if(!g)throw Error('No encontramos esta invitación. Vuelve a seleccionar el invitado.');const similar=findSimilarGuests(f.get('name'),g.id);if(similar.length){const approved=await dialog('¿Es una invitación repetida?',`<p class="muted">Ya hay nombres parecidos registrados. Revisa antes de continuar.</p>${duplicatesMarkup(f.get('name'),g.id)}`,'Guardar de todos modos','Revisar nombre');if(!approved){takeDuplicateNavigation();return;}}await saveGuest(g.id,{...g,name:f.get('name'),maxPeople:f.get('maxPeople'),message:f.get('message'),configured:true});event.target.dataset.dirty='false';editingManagedCardId='';location.hash='card-manager';render();toast('Tarjeta guardada. Ya está disponible en Gestión de tarjetas.');}catch(err){toast(errorMessage(err),true);}finally{b.disabled=false;}
});

// ====== COMPARTIR EN WHATSAPP · DIÁLOGO PREVIO ELEGANTE ======
// Solo presenta enlaces y texto generados a partir de state.guests.
// Nunca escribe en Firestore, ni marca falsamente una tarjeta como «enviada».
let shareGuest = null;
let shareReturnFocus = null;
const shareDialog = document.getElementById('share-dialog');
const shareName = document.getElementById('share-person-name');
const shareSeats = document.getElementById('share-person-seats');
const shareMessage = document.getElementById('share-message');
const shareUrl = document.getElementById('share-url');
const shareWarning = document.getElementById('share-warning');
const sharePreviewImage = document.getElementById('share-preview-img');
function openShareDialog(g) {
  if (!shareDialog || !g?.configured || !g.active) return;
  shareGuest = g;
  shareReturnFocus = document.activeElement;
  shareName.textContent = g.name;
  shareSeats.textContent = Number(g.maxPeople) === 1 ? '1 lugar reservado' : `${g.maxPeople} lugares reservados · incluye al destinatario`;
  shareMessage.value = whatsappMessage(g);
  shareUrl.textContent = url(g);
  shareUrl.href = url(g);
  shareWarning.hidden = !isPreviewChannelUrl(g);
  // La imagen del modal es la misma portada que usará og:image.
  sharePreviewImage.src = '../og-boda.webp?v=14';
  const previewDomain = document.getElementById('share-preview-domain');
  if (previewDomain) previewDomain.textContent = new URL(url(g)).hostname;
  if (!shareDialog.open) shareDialog.showModal();
}
function closeShareDialog() {
  if (!shareDialog?.open) return;
  shareDialog.close();
}
shareDialog?.addEventListener('close', () => {
  shareGuest = null;
  if (shareReturnFocus?.isConnected) shareReturnFocus.focus({preventScroll:true});
  shareReturnFocus = null;
});
// Evitar cierres involuntarios al tocar las tarjetas del contenido.
shareDialog?.addEventListener('click', ev => {
  if (ev.target === shareDialog) closeShareDialog();
});
async function copyShareText(text, success) {
  try {
    await navigator.clipboard.writeText(text);
    toast(success);
  } catch (err) {
    toast('No se pudo copiar automáticamente. Selecciona el texto y cópialo.', true);
    shareMessage?.focus();
    shareMessage?.select();
  }
}
document.addEventListener('click', event => {
  const action = event.target.closest('[data-share-action]')?.dataset.shareAction;
  if (!action || !shareGuest || !shareDialog?.open) return;
  if (action === 'close') return closeShareDialog();
  if (action === 'copy-message') return void copyShareText(whatsappMessage(shareGuest), 'Mensaje copiado.');
  if (action === 'copy-link') return void copyShareText(url(shareGuest), 'Enlace personal copiado.');
  if (action === 'open-invite') return void window.open(url(shareGuest), '_blank', 'noopener,noreferrer');
  if (action === 'open-whatsapp') {
    // No hay envío automático. wa.me abre la aplicación y permite elegir contacto.
    const destination = whatsappUrl(shareGuest);
    window.open(destination, '_blank', 'noopener,noreferrer');
  }
});

document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id,g=state.guests.find(g=>g.id===id);b.disabled=true;
  try{
    if(action==='add'||action==='edit')await editGuest(g);
    if(action==='card' && g){selected=id;editingManagedCardId='';const target=g.configured?'card-manager':'cards';if(pageFromHash()===target)render();else location.hash=target;}
     if(action==='manager-edit' && g?.configured){editingManagedCardId=id;selected=id;if(pageFromHash()==='card-manager')render();else location.hash='card-manager';}
    if(action==='manager-back'){editingManagedCardId='';render();}
    if(action==='copy'){await navigator.clipboard.writeText(url(g));toast('Enlace copiado.');}
    if(action==='whatsapp' && g){
      if(!g.configured){toast('Primero debes guardar la tarjeta.',true);}
      else if(!g.active){toast('Restaura la invitación para poder compartirla.',true);}
      else if(isLocalInvitationUrl(g)){
        toast('La invitación necesita un enlace público HTTPS para compartirse. No puedes enviar la dirección local de tu computadora.',true);
      }else{
        // No abrimos la interfaz genérica de wa.me de inmediato.
        // Primero mostramos NUESTRA ventana de revisión; la persona decide enviar.
        openShareDialog(g);
      }
    }
    if(action==='open')window.open(url(g),'_blank','noopener,noreferrer');
    if(action==='rotate' && await dialog('¿Generar un nuevo enlace?','<p>El enlace anterior dejará de funcionar. Se conservarán la confirmación y los participantes. Tendrás que compartir el enlace nuevo.</p>','Regenerar token')){await saveGuest(g.id,g,true);toast('Enlace renovado.');}
    if(action==='archive' && await dialog('¿Archivar esta invitación?',`<p>Se desactivará el enlace de ${e(g.name)} y se excluirá a sus participantes de las listas activas.</p><p>Se conservarán la confirmación, roles y asientos. Puedes liberar los asientos desde Mesas, o restaurar la invitación más adelante.</p>`,'Archivar')){await saveGuest(g.id,{...g,active:false});toast('Invitación archivada.');}
    if(action==='restore'){await saveGuest(g.id,{...g,active:true});toast('Invitación restaurada.');}
    if(action==='rsvp')await editRSVP(g);
    if(action==='new-table'||action==='edit-table'){const t=state.tables.find(t=>t.id===id);const f=await dialog(t?'Editar mesa':'Una nueva mesa',input('name','Nombre',t?.name||`Mesa ${String(state.tables.length+1).padStart(2,'0')}`,'text','required maxlength="80"')+input('capacity','Capacidad',t?.capacity||8,'number','required min="1" max="50"'));if(f){await saveTable(t?.id,f.get('name'),f.get('capacity'));toast('Mesa guardada.');}}
    if(action==='delete-table' && await dialog('¿Eliminar esta mesa?','<p>Se quitarán todas sus asignaciones. Los participantes conservarán su confirmación y quedarán sin mesa.</p>','Eliminar mesa')){await deleteTable(id);toast('Mesa eliminada y asientos liberados.');}
    if(action==='seat'||action==='table-assign')await seatModal(action==='seat'?people().find(p=>p.id===id):null,action==='table-assign'?id:'');
    if(action==='release'){if(await dialog('¿Liberar este asiento?','<p>La persona conservará sus datos y su confirmación.</p>','Liberar')){await releaseSeat(id);toast('Asiento liberado.');}}
    if(action==='profile'){const p=people().find(p=>p.id===id);const f=await dialog('Un papel especial',`<p>${e(p.name)} · ${e(p.invitation)}</p><label>Rol<select name="role">${['Invitado principal','Acompañante','Novio','Novia','Padres','Damas','Caballeros','Pastor','Familiares','Invitados','Otros'].map(r=>`<option ${p.role===r?'selected':''}>${r}</option>`).join('')}</select></label>`);if(f){await setDoc(ref('participants',id),{role:f.get('role'),roleName:p.name},{merge:true});toast('Álbum actualizado.');}}
    if(action==='logout')await signOut(auth);
  }catch(err){toast(errorMessage(err),true);}finally{b.disabled=false;}
});
// Also supports releasing seats whose RSVP was withdrawn or invitation archived.
async function releaseSeat(id){await runTransaction(db,async tx=>{const p=await tx.get(ref('participants',id));if(!p.exists()||!p.data().tableId)return;const t=await tx.get(ref('tables',p.data().tableId));if(t.exists()){const seats={...t.data().seats};delete seats[id];tx.update(t.ref,{seats});}tx.update(p.ref,{tableId:'',seat:0});});}
$('#login-form').onsubmit=async event=>{event.preventDefault();const b=event.target.querySelector('button');b.disabled=true;$('#login-error').textContent='';try{await setPersistence(auth,browserSessionPersistence);await signInWithEmailAndPassword(auth,event.target.email.value,event.target.password.value);event.target.password.value='';}catch(err){$('#login-error').textContent=errorMessage(err);}finally{b.disabled=false;}};
$('#logout').onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{
  const current=++session;editingManagedCardId='';selected='';subscriptions.forEach(stop=>stop());subscriptions=[];pendingWatches.clear();loadedCollections.clear();ready=false;dataTransition=false;Object.keys(state).forEach(k=>state[k]=[]);$('#content').replaceChildren();$('#app').hidden=true;$('#login').hidden=true;$('#session-loading').hidden=false;
  if(!user){$('#session-loading').hidden=true;$('#login').hidden=false;return;}
  try{
    const admin=await getDoc(ref('admins',user.uid));if(current!==session)return;
    if(!admin.exists()||admin.data().active!==true)throw Error('Tu cuenta no está autorizada. Crea admins/'+user.uid+' con active: true desde Firebase Console.');
    $('#session-loading').hidden=true;$('#app').hidden=false;$('#content').innerHTML='<div class="stats"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';

    // Solo se abren los listeners que la pantalla inicial necesita. Los demás se
    // activan cuando el administrador entra por primera vez a una sección que los usa.
    await ensurePageData(pageFromHash(), current);
    if(current!==session)return;
    ready=true;
    render();
  }catch(err){await signOut(auth);$('#login-error').textContent=errorMessage(err);}
});

