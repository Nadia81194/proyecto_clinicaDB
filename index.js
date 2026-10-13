const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==================== ENDPOINTS DE PACIENTES ====================

app.get('/pacientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los pacientes' });
  }
});

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

// ==================== ENDPOINTS DE MÉDICOS ====================

app.get('/medicos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM medicos ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los médicos' });
  }
});

app.post('/medicos', async (req, res) => {
  const { nombre, especialidad, correo, telefono } = req.body;
  try {
    const query = `
      INSERT INTO medicos (nombre, especialidad, correo, telefono) 
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [nombre, especialidad, correo, telefono];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el médico' });
  }
});

// ==================== ENDPOINTS DE RELACIÓN (MÉDICO - PACIENTE) ====================

app.get('/medico-paciente', async (req, res) => {
  try {
    const query = `
      SELECT mp.id, m.nombre AS medico, p.nombre AS paciente, mp.fecha_asignacion 
      FROM medico_paciente mp
      JOIN medicos m ON mp.medico_id = m.id
      JOIN pacientes p ON mp.paciente_id = p.id
      ORDER BY mp.id ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las relaciones' });
  }
});

app.post('/medico-paciente', async (req, res) => {
  const { medico_id, paciente_id } = req.body;
  try {
    const query = `
      INSERT INTO medico_paciente (medico_id, paciente_id) 
      VALUES ($1, $2) RETURNING *;
    `;
    const values = [medico_id, paciente_id];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al asignar el paciente al médico' });
  }
});

app.get('/medicos/:id/pacientes', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT p.* FROM pacientes p
      JOIN medico_paciente mp ON p.id = mp.paciente_id
      WHERE mp.medico_id = $1;
    `;
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los pacientes del médico' });
  }
});

// ==================== ENDPOINTS DE USUARIOS ====================

// Obtener todos los usuarios del sistema
app.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, correo, rol, medico_id, paciente_id FROM usuarios ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
});

// Registrar un nuevo usuario (respetando la lógica de rol: médico o paciente)
app.post('/usuarios', async (req, res) => {
  const { correo, password_hash, rol, medico_id, paciente_id } = req.body;
  try {
    const query = `
      INSERT INTO usuarios (correo, password_hash, rol, medico_id, paciente_id) 
      VALUES ($1, $2, $3, $4, $5) RETURNING id, correo, rol, medico_id, paciente_id;
    `;
    const values = [correo, password_hash, rol, medico_id || null, paciente_id || null];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el usuario. Verifica que cumpla con las restricciones de rol.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Postgres corriendo en el puerto ${PORT}`);
});