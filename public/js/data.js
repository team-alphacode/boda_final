import { db } from './firebase.js';
import { doc, collection, runTransaction, serverTimestamp, onSnapshot, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { token, partySize, validNames, moveSeats } from './domain.js';
export { doc, collection, getDoc, setDoc, serverTimestamp };
export const ref = (c, id) => doc(db, c, id);
export const watch = (c, next, error) => onSnapshot(collection(db, c), s => next(s.docs.map(d => ({...d.data(), id:d.id}))), error);
export async function saveGuest(id, values, rotate = false) {
  const guestRef = id ? ref('guests', id) : doc(collection(db,'guests'));
  const nextToken = token();
  await runTransaction(db, async tx => {
    const snap = await tx.get(guestRef), old = snap.data();
    const response = old ? await tx.get(ref('responses',old.token)) : null;
    const count = response?.data()?.names?.length || 0;
    const maxPeople = partySize(values.maxPeople);
    if (!values.name.trim()) throw Error('Escribe el nombre de la invitación.');
    if (maxPeople < count) throw Error(`Ya hay ${count} personas confirmadas. Modifica primero la confirmación.`);
    const invitationToken = old && !rotate ? old.token : nextToken;
    if (!old || rotate) {
      const collision = await tx.get(ref('publicInvitations', invitationToken));
      if (collision.exists()) throw Error('No se pudo generar el enlace. Intenta nuevamente.');
    }
    const data = { name: values.name.trim(), maxPeople, active: values.active ?? true, configured: values.configured ?? old?.configured ?? false, message: values.message ?? old?.message ?? '', token: invitationToken, createdAt: old?.createdAt || serverTimestamp(), updatedAt:serverTimestamp() };
    tx.set(guestRef,data);
    tx.set(ref('publicInvitations',invitationToken), {name:data.name,maxPeople,active:data.active,message:data.message,responded:response?.exists?.() === true});
    if (old && rotate) {
      tx.delete(ref('publicInvitations',old.token));
      if(response.exists()) { tx.set(ref('responses',invitationToken),{...response.data(),updatedAt:serverTimestamp()}); tx.delete(ref('responses',old.token)); }
    }
  });
  return guestRef.id;
}
export async function submitRSVP(invitationToken, attending, names, email, allowExisting = false) {
  const cleanEmail = String(email || '').trim();
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw Error('Escribe un correo electrónico válido.');
  }

  return runTransaction(db, async tx => {
    const invitationRef = ref('publicInvitations', invitationToken);
    const responseRef = ref('responses', invitationToken);

    const invitation = await tx.get(invitationRef);
    if (!invitation.exists()) {
      throw Error('La invitación no está disponible.');
    }
    if (!allowExisting && !invitation.data().active) {
      throw Error('La invitación no está disponible.');
    }

    // Público: una sola respuesta. Administración: puede corregir la respuesta.
    if (!allowExisting && invitation.data().responded === true) {
      throw Error('Esta invitación ya fue respondida.');
    }

    const clean = validNames(names, invitation.data().maxPeople, attending);

    tx.set(responseRef, {
      attending,
      names: clean,
      email: cleanEmail,
      updatedAt: serverTimestamp()
    });

    // Solo marcamos responded si todavía no estaba marcado.
    if (invitation.data().responded !== true) {
      tx.update(invitationRef, { responded: true });
    }
  });
}
export async function saveTable(id, name, capacity) {
  const tableRef = id ? ref('tables',id) : doc(collection(db,'tables'));
  capacity = Number(capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) throw Error('Capacidad válida: 1 a 50.');
  await runTransaction(db, async tx => {
    const current = await tx.get(tableRef), seats = current.data()?.seats || {};
    if (Object.values(seats).some(n => n > capacity)) throw Error('Reubica los asientos que superan la nueva capacidad.');
    tx.set(tableRef,{name:name.trim(),capacity,seats,updatedAt:serverTimestamp()});
  });
}
export async function assignSeat(person, tableId, seat) {
  await runTransaction(db, async tx => {
    const pRef = ref('participants',person.id), pSnap = await tx.get(pRef), profile = pSnap.data() || {};
    const guest = await tx.get(ref('guests',person.guestId));
    const response = await tx.get(ref('responses',guest.data().token));
    if (!guest.data().active || !response.data()?.attending || response.data().names[person.index] !== person.name) throw Error('La confirmación cambió. Actualiza la lista antes de asignar.');
    const old = profile.tableId ? await tx.get(ref('tables',profile.tableId)) : null;
    const target = tableId ? await tx.get(ref('tables',tableId)) : null;
    if (tableId && !target.exists()) throw Error('Esta mesa ya no existe.');
    if (old?.exists() && profile.tableId !== tableId) { const seats = {...old.data().seats}; delete seats[person.id]; tx.update(old.ref,{seats}); }
    if (target) tx.update(target.ref,{seats:moveSeats(target.data().seats,person.id,Number(seat),target.data().capacity)});
    tx.set(pRef,{...profile,assignedName:person.name,tableId:tableId || '',seat:tableId ? Number(seat) : 0});
  });
}
export async function deleteTable(tableId) {
  await runTransaction(db,async tx => {
    const table = await tx.get(ref('tables',tableId));
    if (!table.exists()) return;
    const profiles = await Promise.all(Object.keys(table.data().seats).map(id => tx.get(ref('participants',id))));
    profiles.forEach(p => { if(p.exists() && p.data().tableId === tableId) tx.update(p.ref,{tableId:'',seat:0}); });
    tx.delete(table.ref);
  });
}
