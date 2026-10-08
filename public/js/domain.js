export const MAX_PARTY = 20;
export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
}
export function partySize(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARTY) throw Error('El cupo debe estar entre 1 y 20 personas.');
  return n;
}
export function validNames(names, max, attending) {
  if (!Array.isArray(names) || names.length > max || (attending && !names.length) || (!attending && names.length)) throw Error('Revisa la cantidad de asistentes.');
  return names.map(name => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw Error('Escribe nombres de entre 1 y 120 caracteres.');
    return name.trim();
  });
}
export function participants(guests, responses, profiles) {
  return guests.filter(g => g.active).flatMap(g => {
    const r = responses.find(r => r.id === g.token);
    return r?.attending ? r.names.map((name, index) => {
      const id = `${g.id}_${index}`;
      const profile = profiles.find(p => p.id === id) || {};
      return { ...profile, tableId: profile.assignedName === name ? profile.tableId : '', seat: profile.assignedName === name ? profile.seat : 0, role: profile.roleName === name ? profile.role : '', id, guestId: g.id, name, invitation: g.name, index, token: g.token };
    }) : [];
  });
}
export function moveSeats(oldSeats, id, seat, capacity) {
  const seats = { ...oldSeats };
  delete seats[id];
  if (!Number.isInteger(seat) || seat < 1 || seat > capacity) throw Error('Asiento fuera de la capacidad de la mesa.');
  if (Object.values(seats).includes(seat)) throw Error('Ese asiento ya está ocupado.');
  if (Object.keys(seats).length >= capacity) throw Error('La mesa está completa.');
  seats[id] = seat;
  return seats;
}
