require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { notasPorPaciente, router: notasRouter } = require('./funciones');

const app = express();
app.use(express.json());
app.use(express.static('public')); // aquí irá la interfaz

// ---------- Conexión a Postgres ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- Prueba de conexión a ambas bases ----------
app.get('/salud', async (req, res) => {
  const estado = { postgres: 'error', mongo: 'error' };
  try {
    await pool.query('SELECT 1');
    estado.postgres = 'ok';
  } catch (err) {
    estado.postgres = err.message;
  }
  try {
    await notasPorPaciente(1);
    estado.mongo = 'ok';
  } catch (err) {
    estado.mongo = err.message;
  }
  res.json(estado);
});

// Endpoint GET: Listar pacientes
app.get('/pacientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los pacientes' });
  }
});

// Endpoint POST: Crear un paciente
app.post('/pacientes', async (req, res) => {
  const { nombre, fecha_nacimiento, sexo, telefono } = req.body;
  try {
    const query = `
      INSERT INTO pacientes (nombre, fecha_nacimiento, sexo, telefono) 
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [nombre, fecha_nacimiento, sexo, telefono];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el paciente' });
  }
});

// ---------- Notas (Mongo): rutas de Leslye ----------
// Aporta POST y GET /pacientes/:id/notas
app.use(notasRouter);

// ---------- Expediente: la unión de las dos bases ----------
app.get('/expediente/:id', async (req, res) => {
  const id = Number(req.params.id); // Mongo guarda paciente_id como número
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id inválido' });
  }
  try {
    // 1. Paciente en Postgres
    const result = await pool.query('SELECT * FROM pacientes WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    // 2. Notas en Mongo
    const notas = await notasPorPaciente(id);
    // 3. Un solo JSON con ambas
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