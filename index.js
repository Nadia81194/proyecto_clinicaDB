require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { notasPorPaciente, router: notasRouter } = require('./funciones');
const { router: crudNotasRouter, borrarNotasDePaciente } = require('./crud-notas');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ---------- Postgres ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const COLUMNAS = `id, nombre, to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, sexo, telefono`;

function parseId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------- Salud ----------
app.get('/salud', async (req, res) => {
  const estado = { postgres: 'error', mongo: 'error' };
  try { await pool.query('SELECT 1'); estado.postgres = 'ok'; }
  catch (err) { estado.postgres = err.message; }
  try { await notasPorPaciente(1); estado.mongo = 'ok'; }
  catch (err) { estado.mongo = err.message; }
  res.json(estado);
});

// ---------- Pacientes (Postgres): CRUD ----------
app.get('/pacientes', async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${COLUMNAS} FROM pacientes ORDER BY id ASC`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los pacientes' });
  }
});

app.post('/pacientes', async (req, res) => {
  const { nombre, fecha_nacimiento, sexo, telefono } = req.body;
  if (!nombre || !String(nombre).trim() || !fecha_nacimiento) {
    return res.status(400).json({ error: 'Nombre y fecha de nacimiento son obligatorios' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO pacientes (nombre, fecha_nacimiento, sexo, telefono)
       VALUES ($1, $2, $3, $4) RETURNING ${COLUMNAS};`,
      [nombre.trim(), fecha_nacimiento, sexo, telefono]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el paciente' });
  }
});

app.put('/pacientes/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  const { nombre, fecha_nacimiento, sexo, telefono } = req.body;
  if (!nombre || !String(nombre).trim() || !fecha_nacimiento) {
    return res.status(400).json({ error: 'Nombre y fecha de nacimiento son obligatorios' });
  }
  try {
    const result = await pool.query(
      `UPDATE pacientes SET nombre = $1, fecha_nacimiento = $2, sexo = $3, telefono = $4
       WHERE id = $5 RETURNING ${COLUMNAS};`,
      [nombre.trim(), fecha_nacimiento, sexo, telefono, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el paciente' });
  }
});

// Borrado coordinado: primero Postgres, luego las notas en Mongo
app.delete('/pacientes/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    const result = await pool.query('DELETE FROM pacientes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
  } catch (err) {
    console.error(err);
    if (err.code === '23503') { // llave foránea: otra tabla depende de este paciente
      return res.status(409).json({ error: 'No se puede borrar: el paciente tiene registros relacionados' });
    }
    return res.status(500).json({ error: 'Error al borrar el paciente' });
  }
  // El paciente ya no existe en Postgres; ahora limpiamos sus notas
  let notasBorradas = 0;
  let aviso = null;
  try {
    notasBorradas = await borrarNotasDePaciente(id);
  } catch (err) {
    console.error('Notas huérfanas del paciente', id, err.message);
    aviso = 'Paciente borrado, pero sus notas en Mongo no se pudieron eliminar';
  }
  res.json({ ok: true, notasBorradas, aviso });
});

// ---------- Notas (Mongo) ----------
app.use(notasRouter);      // POST y GET /pacientes/:id/notas (Leslye)
app.use(crudNotasRouter);  // PUT y DELETE /notas/:id

// ---------- Expediente: unión de las dos bases ----------
app.get('/expediente/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    const result = await pool.query(`SELECT ${COLUMNAS} FROM pacientes WHERE id = $1`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    const notas = await notasPorPaciente(id);
    res.json({ paciente: result.rows[0], notas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el expediente' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});