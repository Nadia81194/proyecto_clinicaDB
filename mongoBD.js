require('node:dns').setServers(['8.8.8.8', '1.1.1.1']); // solo si lo necesitas en tu red
require('dotenv').config();
const { MongoClient } = require('mongodb');

const IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const notas = [
  // Medicina general
  { paciente_id: IDS[0], fecha: new Date('2026-09-02'), especialidad: 'Medicina general',
    diagnostico: 'Infección respiratoria aguda', sintomas: ['tos', 'fiebre', 'dolor de garganta'],
    medicamentos: [{ nombre: 'Paracetamol', dosis: '500 mg', frecuencia: 'cada 8 h' }],
    texto_libre: 'Paciente con 3 días de evolución. Se indica reposo e hidratación.' },
  { paciente_id: IDS[0], fecha: new Date('2026-09-16'), especialidad: 'Medicina general',
    diagnostico: 'Control posterior a infección', sintomas: ['tos leve'],
    medicamentos: [],
    texto_libre: 'Evolución favorable. Alta médica.' },
  { paciente_id: IDS[1], fecha: new Date('2026-09-05'), especialidad: 'Medicina general',
    diagnostico: 'Gastritis', sintomas: ['dolor abdominal', 'náusea'],
    medicamentos: [{ nombre: 'Omeprazol', dosis: '20 mg', frecuencia: 'cada 24 h' }],
    texto_libre: 'Se recomienda evitar irritantes y comidas pesadas.' },

  // Cardiología 
  { paciente_id: IDS[2], fecha: new Date('2026-09-08'), especialidad: 'Cardiología',
    diagnostico: 'Hipertensión arterial', sintomas: ['cefalea', 'mareo'],
    presion_arterial: '150/95', frecuencia_cardiaca: 88,
    medicamentos: [{ nombre: 'Losartán', dosis: '50 mg', frecuencia: 'cada 24 h' }],
    texto_libre: 'Se inicia tratamiento y control en 15 días.' },
  { paciente_id: IDS[2], fecha: new Date('2026-09-23'), especialidad: 'Cardiología',
    diagnostico: 'Hipertensión arterial, seguimiento', sintomas: ['cefalea leve'],
    presion_arterial: '135/85', frecuencia_cardiaca: 80,
    medicamentos: [{ nombre: 'Losartán', dosis: '50 mg', frecuencia: 'cada 24 h' }],
    texto_libre: 'Mejoría. Se continúa mismo esquema.' },
  { paciente_id: IDS[3], fecha: new Date('2026-09-10'), especialidad: 'Cardiología',
    diagnostico: 'Arritmia', sintomas: ['palpitaciones'],
    presion_arterial: '130/80', frecuencia_cardiaca: 112, electrocardiograma: 'taquicardia sinusal',
    medicamentos: [{ nombre: 'Metoprolol', dosis: '25 mg', frecuencia: 'cada 12 h' }],
    texto_libre: 'Se solicita Holter de 24 horas.' },

  // Neurología 
  { paciente_id: IDS[4], fecha: new Date('2026-09-12'), especialidad: 'Neurología',
    diagnostico: 'Migraña', sintomas: ['cefalea pulsátil', 'fotofobia'],
    escala_glasgow: 15, reflejos: 'normales',
    medicamentos: [{ nombre: 'Sumatriptán', dosis: '50 mg', frecuencia: 'al inicio de la crisis' }],
    texto_libre: 'Se recomienda llevar diario de crisis.' },
  { paciente_id: IDS[5], fecha: new Date('2026-09-14'), especialidad: 'Neurología',
    diagnostico: 'Neuropatía periférica', sintomas: ['hormigueo en pies', 'debilidad'],
    escala_glasgow: 15, reflejos: 'disminuidos', estudio_solicitado: 'electromiografía',
    medicamentos: [{ nombre: 'Gabapentina', dosis: '300 mg', frecuencia: 'cada 12 h' }],
    texto_libre: 'Pendiente resultado de estudios.' },

  // Pediatría / Ginecología / Endocrinología
  { paciente_id: IDS[6], fecha: new Date('2026-09-18'), especialidad: 'Pediatría',
    diagnostico: 'Control de niño sano', sintomas: [],
    peso_kg: 18.5, talla_cm: 108, esquema_vacunacion: 'completo para su edad',
    medicamentos: [],
    texto_libre: 'Desarrollo adecuado.' },
  { paciente_id: IDS[7], fecha: new Date('2026-09-20'), especialidad: 'Ginecología',
    diagnostico: 'Control prenatal', sintomas: ['náusea matutina'],
    semanas_gestacion: 14, altura_uterina_cm: 14,
    medicamentos: [{ nombre: 'Ácido fólico', dosis: '5 mg', frecuencia: 'cada 24 h' }],
    texto_libre: 'Embarazo sin complicaciones. Próxima cita en 4 semanas.' },
  { paciente_id: IDS[8], fecha: new Date('2026-09-22'), especialidad: 'Endocrinología',
    diagnostico: 'Diabetes mellitus tipo 2', sintomas: ['sed excesiva', 'cansancio'],
    glucosa_mg_dl: 210, hba1c: 8.4,
    medicamentos: [{ nombre: 'Metformina', dosis: '850 mg', frecuencia: 'cada 12 h' }],
    texto_libre: 'Se indica dieta y control de glucosa en casa.' },
  { paciente_id: IDS[8], fecha: new Date('2026-10-04'), especialidad: 'Endocrinología',
    diagnostico: 'Diabetes mellitus tipo 2, seguimiento', sintomas: ['cansancio'],
    glucosa_mg_dl: 160, hba1c: 7.6,
    medicamentos: [{ nombre: 'Metformina', dosis: '850 mg', frecuencia: 'cada 12 h' }],
    texto_libre: 'Mejoría del control glucémico.' },

  // Otras
  { paciente_id: IDS[9], fecha: new Date('2026-09-25'), especialidad: 'Traumatología',
    diagnostico: 'Esguince de tobillo grado II', sintomas: ['dolor', 'inflamación'],
    medicamentos: [{ nombre: 'Ibuprofeno', dosis: '400 mg', frecuencia: 'cada 8 h' }],
    texto_libre: 'Inmovilización por 2 semanas.' },
  { paciente_id: IDS[3], fecha: new Date('2026-10-01'), especialidad: 'Cardiología',
    diagnostico: 'Arritmia, resultado de Holter', sintomas: ['palpitaciones ocasionales'],
    presion_arterial: '125/80', frecuencia_cardiaca: 92,
    medicamentos: [{ nombre: 'Metoprolol', dosis: '25 mg', frecuencia: 'cada 12 h' }],
    texto_libre: 'Holter sin eventos graves. Continuar tratamiento.' },
  { paciente_id: IDS[1], fecha: new Date('2026-10-06'), especialidad: 'Medicina general',
    diagnostico: 'Gastritis, seguimiento', sintomas: ['molestia leve'],
    medicamentos: [{ nombre: 'Omeprazol', dosis: '20 mg', frecuencia: 'cada 24 h' }],
    texto_libre: 'Mejoría con dieta.' },
];

(async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const col = client.db('expedientes').collection('notas_clinicas');
    await col.deleteMany({});            // limpia para poder repetir el seed
    const r = await col.insertMany(notas);
    console.log('Notas insertadas:', r.insertedCount);
  } catch (err) {
    console.error('Error en el seed:', err.message);
  } finally {
    await client.close();
  }
})();