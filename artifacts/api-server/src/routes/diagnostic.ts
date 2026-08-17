import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, diagnosticRecordsTable } from "@workspace/db";
import {
  CreateAppointmentBody,
  CreateAppointmentResponse,
  CreatePatientBody,
  CreatePatientResponse,
  GetAppointmentParams,
  GetAppointmentResponse,
  GetDashboardSummaryResponse,
  ListActivityResponse,
  ListAppointmentsQueryParams,
  ListAppointmentsResponse,
  ListPatientsQueryParams,
  ListPatientsResponse,
  ListSlotsQueryParams,
  ListSlotsResponse,
  ListTestsResponse,
  UpdateAppointmentPaymentBody,
  UpdateAppointmentPaymentParams,
  UpdateAppointmentStatusBody,
  UpdateAppointmentStatusParams,
} from "@workspace/api-zod";

type JsonRecord = Record<string, unknown>;
type Entity = "appointment" | "patient" | "test" | "slot" | "activity";

const router: IRouter = Router();
let seedPromise: Promise<void> | undefined;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const seed = (): Record<Entity, JsonRecord[]> => {
  const date = today();
  return {
    patient: [
      { id: "pat-001", uhid: "UHID-240381", name: "Ananya Mehta", mobile: "9876543210", whatsapp: "9876543210", email: "ananya@example.com", age: 34, gender: "Female", lastVisit: date, totalVisits: 4 },
      { id: "pat-002", uhid: "UHID-240402", name: "Rohan Kapoor", mobile: "9811122233", whatsapp: "9811122233", email: "rohan@example.com", age: 49, gender: "Male", lastVisit: date, totalVisits: 2 },
      { id: "pat-003", uhid: "UHID-240417", name: "Priya Nair", mobile: "9898989898", whatsapp: "9898989898", email: null, age: 28, gender: "Female", lastVisit: "2026-08-12", totalVisits: 6 },
      { id: "pat-004", uhid: "UHID-240431", name: "Vikram Singh", mobile: "9900112233", whatsapp: "9900112233", email: null, age: 61, gender: "Male", lastVisit: "2026-08-10", totalVisits: 3 },
    ],
    test: [
      { id: "test-pet", name: "PET CT Scan", shortName: "PET CT", department: "Nuclear Medicine", duration: 45, price: 7800, active: true },
      { id: "test-mri", name: "MRI Brain", shortName: "MRI Brain", department: "Radiology", duration: 60, price: 5200, active: true },
      { id: "test-cbc", name: "Complete Blood Count", shortName: "CBC", department: "Pathology", duration: 15, price: 450, active: true },
      { id: "test-thyroid", name: "Thyroid Profile", shortName: "Thyroid", department: "Pathology", duration: 20, price: 850, active: true },
      { id: "test-usg", name: "Ultrasound Whole Abdomen", shortName: "USG Abdomen", department: "Radiology", duration: 30, price: 1800, active: true },
    ],
    appointment: [
      { id: "APT-1048", patientId: "pat-001", patientName: "Ananya Mehta", uhid: "UHID-240381", mobile: "9876543210", testId: "test-pet", testName: "PET CT Scan", lab: "Nuclear Medicine", branch: "Indiranagar", date, time: "09:30 AM", doctor: "Dr. Kavita Rao", status: "Confirmed", paymentStatus: "Paid", reportStatus: "Pending", amount: 7800, source: "Doctor", createdBy: "Rahul Sharma", notes: null, updatedAt: new Date().toISOString() },
      { id: "APT-1049", patientId: "pat-002", patientName: "Rohan Kapoor", uhid: "UHID-240402", mobile: "9811122233", testId: "test-mri", testName: "MRI Brain", lab: "Radiology", branch: "Indiranagar", date, time: "10:15 AM", doctor: "Dr. Arjun Menon", status: "Patient Arrived", paymentStatus: "Paid", reportStatus: "Pending", amount: 5200, source: "Frontdesk", createdBy: "Neha Verma", notes: "Bring prior scans", updatedAt: new Date().toISOString() },
      { id: "APT-1050", patientId: "pat-003", patientName: "Priya Nair", uhid: "UHID-240417", mobile: "9898989898", testId: "test-cbc", testName: "Complete Blood Count", lab: "Central Lab", branch: "Koramangala", date, time: "11:00 AM", doctor: null, status: "Sample Collected", paymentStatus: "Pending", reportStatus: "Pending", amount: 450, source: "Website", createdBy: "System", notes: null, updatedAt: new Date().toISOString() },
      { id: "APT-1051", patientId: "pat-004", patientName: "Vikram Singh", uhid: "UHID-240431", mobile: "9900112233", testId: "test-thyroid", testName: "Thyroid Profile", lab: "Central Lab", branch: "Koramangala", date, time: "12:30 PM", doctor: "Dr. Kavita Rao", status: "Pending Payment", paymentStatus: "Pending", reportStatus: "Pending", amount: 850, source: "Walk-in", createdBy: "Neha Verma", notes: null, updatedAt: new Date().toISOString() },
      { id: "APT-1052", patientId: "pat-001", patientName: "Ananya Mehta", uhid: "UHID-240381", mobile: "9876543210", testId: "test-usg", testName: "Ultrasound Whole Abdomen", lab: "Radiology", branch: "Indiranagar", date: "2026-08-18", time: "09:00 AM", doctor: null, status: "Confirmed", paymentStatus: "Paid", reportStatus: "Pending", amount: 1800, source: "Agent", createdBy: "Rahul Sharma", notes: null, updatedAt: new Date().toISOString() },
    ],
    slot: [
      { id: "slot-pet-0930", date, startTime: "09:30 AM", endTime: "10:15 AM", capacity: 2, booked: 1, status: "Available", testName: "PET CT Scan", lab: "Nuclear Medicine" },
      { id: "slot-pet-1030", date, startTime: "10:30 AM", endTime: "11:15 AM", capacity: 2, booked: 2, status: "Full", testName: "PET CT Scan", lab: "Nuclear Medicine" },
      { id: "slot-mri-1015", date, startTime: "10:15 AM", endTime: "11:15 AM", capacity: 2, booked: 1, status: "Available", testName: "MRI Brain", lab: "Radiology" },
      { id: "slot-cbc-1100", date, startTime: "11:00 AM", endTime: "11:15 AM", capacity: 4, booked: 1, status: "Available", testName: "Complete Blood Count", lab: "Central Lab" },
      { id: "slot-cbc-1130", date, startTime: "11:30 AM", endTime: "11:45 AM", capacity: 4, booked: 4, status: "Full", testName: "Complete Blood Count", lab: "Central Lab" },
      { id: "slot-usg-tomorrow", date: "2026-08-18", startTime: "09:00 AM", endTime: "09:30 AM", capacity: 3, booked: 1, status: "Available", testName: "Ultrasound Whole Abdomen", lab: "Radiology" },
    ],
    activity: [
      { id: "act-1", title: "Report uploaded", detail: "MRI Brain · Rohan Kapoor", time: "8 min ago", type: "report" },
      { id: "act-2", title: "Payment received", detail: "APT-1048 · ₹7,800 via UPI", time: "21 min ago", type: "payment" },
      { id: "act-3", title: "New appointment created", detail: "PET CT Scan · Ananya Mehta", time: "34 min ago", type: "appointment" },
      { id: "act-4", title: "WhatsApp delivered", detail: "Reminder sent to 18 patients", time: "1 hr ago", type: "whatsapp" },
    ],
  };
};

async function ensureSeed() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await db.select({ id: diagnosticRecordsTable.id }).from(diagnosticRecordsTable).limit(1);
      if (existing.length) return;
      const data = seed();
      const values = (Object.entries(data) as [Entity, JsonRecord[]][]).flatMap(([entity, items]) =>
        items.map((payload) => ({ id: `${entity}:${String(payload.id)}`, entity, payload })),
      );
      await db.insert(diagnosticRecordsTable).values(values);
    })();
  }
  await seedPromise;
}

async function records(entity: Entity) {
  await ensureSeed();
  const rows = await db.select().from(diagnosticRecordsTable).where(eq(diagnosticRecordsTable.entity, entity));
  return rows.map((row) => row.payload as JsonRecord);
}

async function record(entity: Entity, id: string) {
  await ensureSeed();
  const rows = await db.select().from(diagnosticRecordsTable).where(and(eq(diagnosticRecordsTable.entity, entity), eq(diagnosticRecordsTable.id, `${entity}:${id}`)));
  return rows[0]?.payload as JsonRecord | undefined;
}

async function save(entity: Entity, payload: JsonRecord) {
  await db.update(diagnosticRecordsTable).set({ payload }).where(eq(diagnosticRecordsTable.id, `${entity}:${String(payload.id)}`));
}

function parseBody<T>(schema: { parse: (input: unknown) => T }, request: Request) {
  return schema.parse(request.body);
}

router.get("/dashboard/summary", async (_req, res) => {
  const appointments = await records("appointment");
  const date = today();
  const todays = appointments.filter((item) => item.date === date);
  const statusBreakdown = ["Confirmed", "Pending Payment", "Patient Arrived", "Sample Collected", "Completed"].map((label) => ({ label, value: todays.filter((item) => item.status === label).length })).filter((item) => item.value);
  const summary = {
    todayAppointments: todays.length,
    confirmed: todays.filter((item) => item.status === "Confirmed").length,
    pending: todays.filter((item) => ["Pending Payment", "Draft"].includes(String(item.status))).length,
    completed: todays.filter((item) => ["Completed", "Test Completed"].includes(String(item.status))).length,
    pendingPayments: todays.filter((item) => item.paymentStatus !== "Paid").length,
    revenue: todays.filter((item) => item.paymentStatus === "Paid").reduce((sum, item) => sum + Number(item.amount), 0),
    reportsPending: todays.filter((item) => item.reportStatus === "Pending").length,
    whatsappSent: 18,
    appointmentTrend: [{ label: "Mon", value: 14 }, { label: "Tue", value: 18 }, { label: "Wed", value: 12 }, { label: "Thu", value: 22 }, { label: "Fri", value: 19 }, { label: "Sat", value: 27 }, { label: "Today", value: todays.length }],
    statusBreakdown,
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/appointments", async (req, res) => {
  const params = ListAppointmentsQueryParams.parse(req.query);
  let items = await records("appointment");
  if (params.date) items = items.filter((item) => item.date === params.date);
  if (params.status && params.status !== "All statuses") items = items.filter((item) => item.status === params.status);
  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter((item) => [item.patientName, item.mobile, item.uhid, item.id, item.testName].some((value) => String(value).toLowerCase().includes(query)));
  }
  items.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const start = (params.page - 1) * params.pageSize;
  res.json(ListAppointmentsResponse.parse({ items: items.slice(start, start + params.pageSize), page: params.page, pageSize: params.pageSize, total: items.length }));
});

router.post("/appointments", async (req, res) => {
  const body = parseBody(CreateAppointmentBody, req);
  const patients = await records("patient");
  const tests = await records("test");
  const patient = patients.find((item) => item.id === body.patientId);
  const test = tests.find((item) => item.id === body.testId);
  if (!patient || !test) return res.status(400).json({ error: "Patient or test not found." });
  const slots = await records("slot");
  const slot = slots.find((item) => item.id === body.slotId);
  if (!slot || Number(slot.booked) >= Number(slot.capacity)) return res.status(409).json({ error: "Slot no longer available." });
  const appointment = {
    id: `APT-${Math.floor(1053 + Math.random() * 800)}`,
    patientId: body.patientId,
    patientName: patient.name,
    uhid: patient.uhid,
    mobile: patient.mobile,
    testId: body.testId,
    testName: test.name,
    lab: test.department === "Pathology" ? "Central Lab" : test.department,
    branch: "Indiranagar",
    date: body.date,
    time: body.time,
    doctor: body.doctor ?? null,
    status: body.paymentStatus === "Paid" ? "Confirmed" : "Pending Payment",
    paymentStatus: body.paymentStatus,
    reportStatus: "Pending",
    amount: Number(test.price),
    source: body.source,
    createdBy: "Current User",
    notes: body.notes ?? null,
    updatedAt: new Date().toISOString(),
  };
  await db.insert(diagnosticRecordsTable).values({ id: `appointment:${appointment.id}`, entity: "appointment", payload: appointment });
  await db.update(diagnosticRecordsTable).set({ payload: { ...slot, booked: Number(slot.booked) + 1, status: Number(slot.booked) + 1 >= Number(slot.capacity) ? "Full" : "Available" } }).where(eq(diagnosticRecordsTable.id, `slot:${slot.id}`));
  req.log.info({ appointmentId: appointment.id }, "Appointment created");
  return res.status(201).json(CreateAppointmentResponse.parse(appointment));
});

router.get("/appointments/:id", async (req, res) => {
  const params = GetAppointmentParams.parse(req.params);
  const item = await record("appointment", params.id);
  if (!item) return res.status(404).json({ error: "Appointment not found." });
  return res.json(GetAppointmentResponse.parse(item));
});

router.patch("/appointments/:id/status", async (req, res) => {
  const params = UpdateAppointmentStatusParams.parse(req.params);
  const body = parseBody(UpdateAppointmentStatusBody, req);
  const item = await record("appointment", params.id);
  if (!item) return res.status(404).json({ error: "Appointment not found." });
  const updated = { ...item, status: body.status, updatedAt: new Date().toISOString() };
  await save("appointment", updated);
  req.log.info({ appointmentId: params.id, status: body.status }, "Appointment status updated");
  return res.json(updated);
});

router.patch("/appointments/:id/payment", async (req, res) => {
  const params = UpdateAppointmentPaymentParams.parse(req.params);
  const body = parseBody(UpdateAppointmentPaymentBody, req);
  const item = await record("appointment", params.id);
  if (!item) return res.status(404).json({ error: "Appointment not found." });
  const updated = { ...item, paymentStatus: body.paymentStatus, status: body.paymentStatus === "Paid" && item.status === "Pending Payment" ? "Confirmed" : item.status, updatedAt: new Date().toISOString() };
  await save("appointment", updated);
  req.log.info({ appointmentId: params.id, paymentStatus: body.paymentStatus }, "Appointment payment updated");
  return res.json(updated);
});

router.get("/patients", async (req, res) => {
  const params = ListPatientsQueryParams.parse(req.query);
  let items = await records("patient");
  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter((item) => [item.name, item.mobile, item.uhid].some((value) => String(value).toLowerCase().includes(query)));
  }
  res.json(ListPatientsResponse.parse(items));
});

router.post("/patients", async (req, res) => {
  const body = parseBody(CreatePatientBody, req);
  const items = await records("patient");
  const duplicate = items.find((item) => item.mobile === body.mobile);
  if (duplicate) return res.status(409).json({ error: "A patient with this mobile number already exists." });
  const patient = { id: uid("pat"), uhid: `UHID-${Math.floor(240500 + Math.random() * 400)}`, name: body.name, mobile: body.mobile, whatsapp: body.whatsapp || body.mobile, email: body.email ?? null, age: body.age, gender: body.gender, lastVisit: today(), totalVisits: 0 };
  await db.insert(diagnosticRecordsTable).values({ id: `patient:${patient.id}`, entity: "patient", payload: patient });
  req.log.info({ patientId: patient.id }, "Patient created");
  return res.status(201).json(CreatePatientResponse.parse(patient));
});

router.get("/tests", async (_req, res) => res.json(ListTestsResponse.parse(await records("test"))));

router.get("/slots", async (req, res) => {
  const params = ListSlotsQueryParams.parse(req.query);
  let items = await records("slot");
  if (params.date) items = items.filter((item) => item.date === params.date);
  if (params.testId) {
    const test = (await records("test")).find((item) => item.id === params.testId);
    if (test) items = items.filter((item) => item.testName === test.name);
  }
  res.json(ListSlotsResponse.parse(items));
});

router.get("/activity", async (_req, res) => res.json(ListActivityResponse.parse(await records("activity"))));

export default router;