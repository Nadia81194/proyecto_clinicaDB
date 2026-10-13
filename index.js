require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { notasPorPaciente } = require('./funciones'); // código de Leslye
const { router: authRouter, requireAuth, soloMedico, accesoPaciente, parseId } = require('./auth');
const { router: notasRouter, borrarNotasDePaciente } = require('./crud-notas');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(authRouter);   // /auth/login, /auth/logout, /auth/yo
app.use(notasRouter);  // notas (Mongo) con permisos

// Columnas: con alias p. para los JOIN, y sin alias para INSERT/UPDATE ... RETURNING
const COL_P = `p.id, p.nombre, to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, p.sexo, p.telefono`;
const COL = `id, nombre, to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, sexo, telefono`;

// ---------- Salud ----------
app.get('/salud', async (req, res) => {
  const estado = { postgres: 'error', mongo: 'error' };
  try { await pool.query('SELECT 1'); estado.postgres = 'ok'; }
  catch (err) { console.error(err.message); }
  try { await notasPorPaciente(1); estado.mongo = 'ok'; }
  catch (err) { console.error(err.message); }
  res.json(estado);
});

// ---------- Pacientes (Postgres) ----------
// El médico solo ve a los pacientes que tiene asignados
app.get('/pacientes', requireAuth, soloMedico, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${COL_P} FROM pacientes p
       JOIN medico_paciente mp ON mp.paciente_id = p.id
       WHERE mp.medico_id = $1
       ORDER BY p.id ASC`,
      [req.usuario.medico_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los pacientes' });
  }
});

// Crea paciente + lo asigna al médico + crea su usuario, todo en UNA transacción de Postgres
app.post('/pacientes', requireAuth, soloMedico, async (req, res) => {
  const { nombre, fecha_nacimiento, sexo, telefono } = req.body;
  if (!nombre || !String(nombre).trim() || !fecha_nacimiento) {
    return res.status(400).json({ error: 'Nombre y fecha de nacimiento son obligatorios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO pacientes (nombre, fecha_nacimiento, sexo, telefono)
       VALUES ($1, $2, $3, $4) RETURNING ${COL}`,
      [nombre.trim(), fecha_nacimiento, sexo, telefono]
    );
    const paciente = r.rows[0];
    await client.query(
      'INSERT INTO medico_paciente (medico_id, paciente_id) VALUES ($1, $2)',
      [req.usuario.medico_id, paciente.id]
    );
    const correo = `paciente${paciente.id}@clinica.test`;
    const password = crypto.randomBytes(4).toString('hex'); // contraseña temporal de 8 caracteres
    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO usuarios (correo, password_hash, rol, paciente_id) VALUES ($1, $2, 'paciente', $3)`,
      [correo, hash, paciente.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...paciente, acceso: { correo, password } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al crear el paciente' });
  } finally {
    client.release();
  }
});

app.put('/pacientes/:id', requireAuth, soloMedico, accesoPaciente, async (req, res) => {
  const { nombre, fecha_nacimiento, sexo, telefono } = req.body;
  if (!nombre || !String(nombre).trim() || !fecha_nacimiento) {
    return res.status(400).json({ error: 'Nombre y fecha de nacimiento son obligatorios' });
  }
  try {
    const result = await pool.query(
      `UPDATE pacientes SET nombre = $1, fecha_nacimiento = $2, sexo = $3, telefono = $4
       WHERE id = $5 RETURNING ${COL}`,
      [nombre.trim(), fecha_nacimiento, sexo, telefono, req.pacienteId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el paciente' });
  }
});

// Borrado coordinado: primero Postgres (paciente, asignación y usuario por CASCADE), luego Mongo
app.delete('/pacientes/:id', requireAuth, soloMedico, accesoPaciente, async (req, res) => {
  const id = req.pacienteId;
  try {
    const result = await pool.query('DELETE FROM pacientes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
  } catch (err) {
    console.error(err);
    if (err.code === '23503') {
      return res.status(409).json({ error: 'No se puede borrar: el paciente tiene registros relacionados' });
    }
    return res.status(500).json({ error: 'Error al borrar el paciente' });
  }
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

// ---------- Expediente: la unión de las dos bases ----------
// Médico (si es su paciente) o el propio paciente
app.get('/expediente/:id', requireAuth, accesoPaciente, async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${COL} FROM pacientes WHERE id = $1`, [req.pacienteId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    const notas = await notasPorPaciente(req.pacienteId);
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