require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { requireAuth, soloMedico, accesoPaciente, tieneAcceso } = require('./auth');

const client = new MongoClient(process.env.MONGO_URI);
let coleccion;

async function getColeccion() {
  if (!coleccion) {
    await client.connect();
    coleccion = client.db('expedientes').collection('notas_clinicas');
  }
  return coleccion;
}

// Campos extra por especialidad (el formulario se arma a partir de esto)
const CAMPOS_ESPECIALIDAD = {
  'Cardiología': [
    { clave: 'presion_arterial', etiqueta: 'Presión arterial', tipo: 'texto', ejemplo: '120/80' },
    { clave: 'frecuencia_cardiaca', etiqueta: 'Frecuencia cardiaca (lpm)', tipo: 'numero', ejemplo: '75' },
    { clave: 'electrocardiograma', etiqueta: 'Electrocardiograma', tipo: 'texto', ejemplo: 'ritmo sinusal' }
  ],
  'Endocrinología': [
    { clave: 'glucosa_mg_dl', etiqueta: 'Glucosa (mg/dl)', tipo: 'numero', ejemplo: '110' },
    { clave: 'hba1c', etiqueta: 'HbA1c (%)', tipo: 'numero', ejemplo: '6.5' }
  ],
  'Neurología': [
    { clave: 'escala_glasgow', etiqueta: 'Escala de Glasgow', tipo: 'numero', ejemplo: '15' },
    { clave: 'reflejos', etiqueta: 'Reflejos', tipo: 'texto', ejemplo: 'normales' },
    { clave: 'estudio_solicitado', etiqueta: 'Estudio solicitado', tipo: 'texto', ejemplo: 'electromiografía' }
  ],
  'Pediatría': [
    { clave: 'peso_kg', etiqueta: 'Peso (kg)', tipo: 'numero', ejemplo: '18.5' },
    { clave: 'talla_cm', etiqueta: 'Talla (cm)', tipo: 'numero', ejemplo: '108' },
    { clave: 'esquema_vacunacion', etiqueta: 'Esquema de vacunación', tipo: 'texto', ejemplo: 'completo' }
  ],
  'Ginecología': [
    { clave: 'semanas_gestacion', etiqueta: 'Semanas de gestación', tipo: 'numero', ejemplo: '14' },
    { clave: 'altura_uterina_cm', etiqueta: 'Altura uterina (cm)', tipo: 'numero', ejemplo: '14' }
  ]
};
const TODOS_LOS_CAMPOS = Object.values(CAMPOS_ESPECIALIDAD).flat();

// Valida y separa los campos extra: cuáles guardar ($set) y cuáles quitar ($unset)
function procesarExtras(body, especialidad, quitarOtros) {
  const propios = CAMPOS_ESPECIALIDAD[especialidad] || [];
  const set = {};
  const unset = {};
  for (const c of propios) {
    const v = body[c.clave];
    if (v === undefined || v === null || String(v).trim() === '') {
      unset[c.clave] = '';
      continue;
    }
    if (c.tipo === 'numero') {
      const n = Number(v);
      if (!Number.isFinite(n)) return { error: `${c.etiqueta} debe ser un número` };
      set[c.clave] = n;
    } else {
      const t = String(v).trim();
      if (c.clave === 'presion_arterial' && !/^\d{2,3}\/\d{2,3}$/.test(t)) {
        return { error: 'La presión arterial debe tener el formato 120/80' };
      }
      set[c.clave] = t;
    }
  }
  if (quitarOtros) { // al cambiar de especialidad se limpian los campos de la anterior
    for (const c of TODOS_LOS_CAMPOS) {
      if (!propios.some(p => p.clave === c.clave)) unset[c.clave] = '';
    }
  }
  return { set, unset };
}

function limpiarLista(sintomas) {
  return Array.isArray(sintomas) ? sintomas.map(s => String(s).trim()).filter(Boolean) : [];
}
function limpiarMeds(meds) {
  return Array.isArray(meds)
    ? meds.map(m => ({
        nombre: String(m.nombre || '').trim(),
        dosis: String(m.dosis || '').trim(),
        frecuencia: String(m.frecuencia || '').trim()
      })).filter(m => m.nombre)
    : [];
}

// Borra todas las notas de un paciente (se usa al eliminar al paciente)
async function borrarNotasDePaciente(paciente_id) {
  const col = await getColeccion();
  const r = await col.deleteMany({ paciente_id });
  return r.deletedCount;
}

const router = express.Router();

// Campos extra por especialidad (para armar el formulario y poner etiquetas)
router.get('/campos-especialidad', requireAuth, (req, res) => res.json(CAMPOS_ESPECIALIDAD));

// POST /pacientes/:id/notas -> solo médico con acceso al paciente
router.post('/pacientes/:id/notas', requireAuth, soloMedico, accesoPaciente, async (req, res) => {
  const b = req.body;
  if (!b.diagnostico || !String(b.diagnostico).trim()) {
    return res.status(400).json({ error: 'El diagnóstico es obligatorio' });
  }
  const especialidad = String(b.especialidad || '').trim();
  const extras = procesarExtras(b, especialidad, false);
  if (extras.error) return res.status(400).json({ error: extras.error });
  try {
    const col = await getColeccion();
    const doc = {
      paciente_id: req.pacienteId,
      fecha: new Date(),
      especialidad,
      diagnostico: String(b.diagnostico).trim(),
      sintomas: limpiarLista(b.sintomas),
      medicamentos: limpiarMeds(b.medicamentos),
      texto_libre: String(b.texto_libre || '').trim(),
      ...extras.set,
      registrado_por: req.usuario.medico_id // quién escribió la nota (auditoría)
    };
    const r = await col.insertOne(doc);
    res.status(201).json({ _id: r.insertedId, ...doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la nota' });
  }
});

// PUT /notas/:id -> actualizar (solo médico con acceso al paciente de esa nota)
router.put('/notas/:id', requireAuth, soloMedico, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'id de nota inválido' });
  const b = req.body;
  if (b.diagnostico !== undefined && !String(b.diagnostico).trim()) {
    return res.status(400).json({ error: 'El diagnóstico es obligatorio' });
  }
  try {
    const col = await getColeccion();
    const _id = new ObjectId(req.params.id);
    const nota = await col.findOne({ _id });
    if (!nota) return res.status(404).json({ error: 'Nota no encontrada' });
    if (!(await tieneAcceso(req.usuario, nota.paciente_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este expediente' });
    }

    const set = {};
    if (b.especialidad !== undefined) set.especialidad = String(b.especialidad).trim();
    if (b.diagnostico !== undefined) set.diagnostico = String(b.diagnostico).trim();
    if (b.sintomas !== undefined) set.sintomas = limpiarLista(b.sintomas);
    if (b.medicamentos !== undefined) set.medicamentos = limpiarMeds(b.medicamentos);
    if (b.texto_libre !== undefined) set.texto_libre = String(b.texto_libre).trim();

    const especialidad = set.especialidad !== undefined ? set.especialidad : nota.especialidad;
    const extras = procesarExtras(b, especialidad, b.especialidad !== undefined);
    if (extras.error) return res.status(400).json({ error: extras.error });

    const update = { $set: { ...set, ...extras.set } };
    if (Object.keys(extras.unset).length) update.$unset = extras.unset;
    if (Object.keys(update.$set).length === 0) delete update.$set;
    if (!update.$set && !update.$unset) return res.status(400).json({ error: 'No hay nada que actualizar' });

    await col.updateOne({ _id }, update);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la nota' });
  }
});

// DELETE /notas/:id
router.delete('/notas/:id', requireAuth, soloMedico, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'id de nota inválido' });
  try {
    const col = await getColeccion();
    const _id = new ObjectId(req.params.id);
    const nota = await col.findOne({ _id });
    if (!nota) return res.status(404).json({ error: 'Nota no encontrada' });
    if (!(await tieneAcceso(req.usuario, nota.paciente_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este expediente' });
    }
    await col.deleteOne({ _id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al borrar la nota' });
  }
});

module.exports = { router, borrarNotasDePaciente };