/**
 * seed-reservations-demo.ts
 * Creates demo data for the reservations module.
 * Idempotent: skips if any reservations already exist.
 * Can be cleared by deleting reservations with notes LIKE '%[DEMO]%'
 */
import { db } from "@workspace/db";
import {
  reservationsTable,
  serviceShiftsTable,
  waitingListTable,
  crmClientsTable,
  restaurantTablesTable,
} from "@workspace/db";
import { count, eq } from "drizzle-orm";

function dateFromNow(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

export async function seedReservationsDemo() {
  // Skip if data already exists
  const [{ total }] = await db.select({ total: count() }).from(serviceShiftsTable);
  if ((total ?? 0) > 0) return;

  // ── 1. Service shifts ──────────────────────────────────────────────────────
  await db.insert(serviceShiftsTable).values([
    {
      nombre: "Comida (1er turno)",
      tipo: "comida",
      horaInicio: "13:00",
      horaFin: "14:30",
      intervaloMinutos: 15,
      capacidadMax: 40,
      maxReservas: 15,
      maxComensales: 40,
      duracionDefault: 90,
      diasActivos: [1,2,3,4,5,6,0],
      activo: true,
    },
    {
      nombre: "Comida (2º turno)",
      tipo: "comida",
      horaInicio: "15:00",
      horaFin: "16:30",
      intervaloMinutos: 15,
      capacidadMax: 40,
      maxReservas: 15,
      maxComensales: 40,
      duracionDefault: 90,
      diasActivos: [1,2,3,4,5,6,0],
      activo: true,
    },
    {
      nombre: "Cena (1er turno)",
      tipo: "cena",
      horaInicio: "20:00",
      horaFin: "21:30",
      intervaloMinutos: 15,
      capacidadMax: 50,
      maxReservas: 20,
      maxComensales: 50,
      duracionDefault: 90,
      diasActivos: [1,2,3,4,5,6,0],
      activo: true,
    },
    {
      nombre: "Cena (2º turno)",
      tipo: "cena",
      horaInicio: "22:00",
      horaFin: "23:30",
      intervaloMinutos: 30,
      capacidadMax: 50,
      maxReservas: 15,
      maxComensales: 50,
      duracionDefault: 90,
      diasActivos: [4,5,6,0],
      activo: true,
    },
    {
      nombre: "Evento especial",
      tipo: "especial",
      horaInicio: "19:00",
      horaFin: "23:59",
      intervaloMinutos: 60,
      capacidadMax: 80,
      maxReservas: 5,
      maxComensales: 80,
      duracionDefault: 180,
      diasActivos: [5,6],
      activo: false,
    },
  ]);

  // ── 2. CRM demo clients ────────────────────────────────────────────────────
  let clientId1: string | null = null;
  let clientId2: string | null = null;

  try {
    const [c1] = await db.insert(crmClientsTable).values({
      nombre: "María",
      apellidos: "García López",
      telefono: "+34 612 345 678",
      email: "maria.garcia@ejemplo.es",
      observaciones: "Cliente habitual desde 2022. Le gusta la terraza.",
      totalVisitas: 12,
      totalGasto: "680.50",
      rgpdConsentimiento: true,
      rgpdFecha: new Date(),
      activo: true,
    }).returning();
    clientId1 = c1?.id ?? null;

    const [c2] = await db.insert(crmClientsTable).values({
      nombre: "Carlos",
      apellidos: "Martínez Ruiz",
      telefono: "+34 698 765 432",
      email: "carlos.martinez@ejemplo.com",
      observaciones: "Alérgico al marisco.",
      totalVisitas: 3,
      totalGasto: "210.00",
      rgpdConsentimiento: true,
      rgpdFecha: new Date(),
      activo: true,
      noPresentados: 1,
      flagNoPresentado: true,
    }).returning();
    clientId2 = c2?.id ?? null;
  } catch { /* crm clients may already exist */ }

  const today = dateFromNow(0);
  const tomorrow = dateFromNow(1);
  const dayAfter = dateFromNow(2);
  const yesterday = dateFromNow(-1);

  // ── 3. Reservations ────────────────────────────────────────────────────────
  await db.insert(reservationsTable).values([
    // Today — various statuses
    {
      fecha: today, hora: "13:00", nombre: "María García", telefono: "+34 612 345 678",
      email: "maria.garcia@ejemplo.es", personas: 2, clientId: clientId1,
      duracionMinutos: 90, canal: "phone", status: "confirmada",
      notes: "Mesa interior preferida [DEMO]",
      alergias: "", trona: false, accesibilidad: false, mascota: false,
    },
    {
      fecha: today, hora: "13:00", nombre: "Familia Rodríguez", telefono: "+34 655 123 456",
      email: "", personas: 4, duracionMinutos: 120, canal: "web", status: "pendiente",
      notes: "Trona para el bebé [DEMO]",
      alergias: "", trona: true, accesibilidad: false, mascota: false,
    },
    {
      fecha: today, hora: "14:00", nombre: "Carlos Martínez", telefono: "+34 698 765 432",
      email: "carlos.martinez@ejemplo.com", personas: 2, clientId: clientId2,
      duracionMinutos: 90, canal: "phone", status: "pendiente",
      notes: "[DEMO]", alergias: "Alérgico al marisco",
      trona: false, accesibilidad: false, mascota: false,
      confirmacionRequerida: true,
    },
    {
      fecha: today, hora: "20:00", nombre: "Laura y Pedro", telefono: "+34 634 987 654",
      email: "laura.p@ejemplo.com", personas: 2, duracionMinutos: 90,
      canal: "web", status: "confirmada", ocasion: "anniversary",
      notes: "Aniversario de bodas. Sorpresa en el postre [DEMO]",
      alergias: "", trona: false, accesibilidad: false, mascota: false,
    },
    {
      fecha: today, hora: "20:30", nombre: "Empresa TechCorp", telefono: "+34 91 234 5678",
      email: "eventos@techcorp.es", personas: 8, duracionMinutos: 150,
      canal: "email", status: "confirmada", ocasion: "business",
      notes: "Reunión de directivos. Menú degustación [DEMO]",
      alergias: "Un comensal vegetariano", trona: false, accesibilidad: true, mascota: false,
    },
    {
      fecha: today, hora: "21:00", nombre: "Grupo Amigos", telefono: "+34 677 890 123",
      email: "", personas: 6, duracionMinutos: 120, canal: "phone",
      status: "cliente_llegado", notes: "[DEMO]",
      alergias: "", trona: false, accesibilidad: false, mascota: false,
    },
    // Yesterday — terminal
    {
      fecha: yesterday, hora: "13:30", nombre: "Ana Fernández", telefono: "+34 611 222 333",
      email: "", personas: 3, duracionMinutos: 90, canal: "walkin",
      status: "finalizada", notes: "[DEMO]",
      alergias: "", trona: false, accesibilidad: false, mascota: false,
    },
    {
      fecha: yesterday, hora: "20:00", nombre: "Roberto Sanz", telefono: "+34 699 444 555",
      email: "", personas: 2, duracionMinutos: 90, canal: "phone",
      status: "no_presentado", notes: "[DEMO]",
      alergias: "", trona: false, accesibilidad: false, mascota: false,
    },
    // Tomorrow
    {
      fecha: tomorrow, hora: "13:00", nombre: "Cumpleaños Ana", telefono: "+34 666 777 888",
      email: "ana@ejemplo.com", personas: 10, duracionMinutos: 180, canal: "phone",
      status: "confirmada", ocasion: "birthday",
      notes: "Pastel de cumpleaños encargado. Decoración mesa [DEMO]",
      alergias: "Una persona con celiaquía (sin gluten)",
      trona: false, accesibilidad: false, mascota: false,
    },
    {
      fecha: tomorrow, hora: "20:00", nombre: "Srta. Wouters", telefono: "+32 456 789 012",
      email: "wouters@ejemplo.be", personas: 2, duracionMinutos: 90,
      canal: "google", idioma: "en", status: "pendiente",
      notes: "[DEMO]", alergias: "", trona: false, accesibilidad: false, mascota: false,
      confirmacionRequerida: true,
    },
    {
      fecha: tomorrow, hora: "21:00", nombre: "Sr. Hernández con mascota", telefono: "+34 645 321 098",
      email: "", personas: 4, duracionMinutos: 90, canal: "phone",
      status: "pendiente", notes: "Terraza exterior [DEMO]",
      alergias: "", trona: false, accesibilidad: false, mascota: true,
    },
    // Day after tomorrow
    {
      fecha: dayAfter, hora: "13:30", nombre: "PMR - Silla de ruedas", telefono: "+34 688 123 456",
      email: "", personas: 3, duracionMinutos: 120, canal: "phone",
      status: "confirmada", notes: "[DEMO]",
      alergias: "", trona: false, accesibilidad: true, mascota: false,
    },
    {
      fecha: dayAfter, hora: "20:00", nombre: "Comunión Familia López", telefono: "+34 634 567 890",
      email: "lopez.familia@ejemplo.es", personas: 20, duracionMinutos: 240,
      canal: "phone", status: "confirmada", ocasion: "communion",
      notes: "Sala privada. Menú cerrado a 35€/persona [DEMO]",
      alergias: "3 niños: menú infantil", trona: true, accesibilidad: false, mascota: false,
    },
  ]).catch(() => { /* ignore duplicates */ });

  // ── 4. Waiting list entries ────────────────────────────────────────────────
  await db.insert(waitingListTable).values([
    {
      nombre: "Sra. Pérez", telefono: "+34 611 000 111", personas: 2,
      horaLlegada: new Date(Date.now() - 8 * 60000), // 8 min ago
      status: "esperando", observaciones: "Mesa interior",
    },
    {
      nombre: "Grupo García", telefono: "+34 622 333 444", personas: 5,
      horaLlegada: new Date(Date.now() - 22 * 60000), // 22 min ago
      status: "avisado", observaciones: "Terraza preferida, avisados por teléfono",
    },
    {
      nombre: "Sr. Kim", telefono: "", personas: 1,
      horaLlegada: new Date(Date.now() - 35 * 60000), // 35 min ago
      status: "esperando", observaciones: "",
    },
  ]).catch(() => { /* ignore */ });
}
