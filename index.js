const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Postgres corriendo en el puerto ${PORT}`);
});