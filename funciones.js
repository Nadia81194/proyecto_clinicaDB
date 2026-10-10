require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);
let coleccion;

async function getColeccion() {
  if (!coleccion) {
    await client.connect();
    coleccion = client.db('expedientes').collection('notas_clinicas');
  }
  return coleccion;
}

// Convierte el id de la URL a número (igual que el SERIAL de Postgres)
function parseId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function agregarNota(paciente_id, nota) {
  const col = await getColeccion();
  const doc = {
    ...nota,                                   // campos libres según la especialidad
    paciente_id,                               // va después para que el body no lo pueda cambiar
    fecha: nota.fecha ? new Date(nota.fecha) : new Date()
  };
  const result = await col.insertOne(doc);
  return { _id: result.insertedId, ...doc };
}

async function notasPorPaciente(paciente_id) {
  const col = await getColeccion();
  return col.find({ paciente_id }).sort({ fecha: -1 }).toArray();
}

// Rutas
const router = express.Router();

// POST /pacientes/:id/notas
router.post('/pacientes/:id/notas', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id de paciente inválido' });
  if (!req.body.diagnostico) {
    return res.status(400).json({ error: 'El diagnóstico es obligatorio' });
  }
  try {
    const nota = await agregarNota(id, req.body);
    res.status(201).json(nota);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la nota' });
  }
});

// GET /pacientes/:id/notas
router.get('/pacientes/:id/notas', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id de paciente inválido' });
  try {
    res.json(await notasPorPaciente(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las notas' });
  }
});

module.exports = { agregarNota, notasPorPaciente, router };