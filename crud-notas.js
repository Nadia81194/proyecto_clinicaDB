require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);
let coleccion;

async function getColeccion() {
  if (!coleccion) {
    await client.connect();
    coleccion = client.db('expedientes').collection('notas_clinicas');
  }
  return coleccion;
}

// Borra todas las notas de un paciente (se usa al eliminar al paciente)
async function borrarNotasDePaciente(paciente_id) {
  const col = await getColeccion();
  const r = await col.deleteMany({ paciente_id });
  return r.deletedCount;
}

const router = express.Router();

// PUT /notas/:id  -> actualizar una nota
router.put('/notas/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'id de nota inválido' });
  }
  // Solo estos campos se pueden editar (paciente_id nunca)
  const permitidos = ['especialidad', 'diagnostico', 'sintomas', 'medicamentos', 'texto_libre'];
  const cambios = {};
  for (const campo of permitidos) {
    if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
  }
  if (cambios.diagnostico !== undefined && !String(cambios.diagnostico).trim()) {
    return res.status(400).json({ error: 'El diagnóstico es obligatorio' });
  }
  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No hay nada que actualizar' });
  }
  try {
    const col = await getColeccion();
    const r = await col.updateOne({ _id: new ObjectId(req.params.id) }, { $set: cambios });
    if (r.matchedCount === 0) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la nota' });
  }
});

// DELETE /notas/:id  -> borrar una nota
router.delete('/notas/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'id de nota inválido' });
  }
  try {
    const col = await getColeccion();
    const r = await col.deleteOne({ _id: new ObjectId(req.params.id) });
    if (r.deletedCount === 0) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al borrar la nota' });
  }
});

module.exports = { router, borrarNotasDePaciente };