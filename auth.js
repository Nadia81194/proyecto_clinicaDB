require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Falta JWT_SECRET en el archivo .env');

const COOKIE = 'sesion';
const HASH_FALSO = bcrypt.hashSync('no-existe', 10); // para que tarde igual si el correo no existe

function parseId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function leerCookie(req, nombre) {
  const todas = req.headers.cookie || '';
  for (const parte of todas.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

// ---------- Middlewares ----------
function requireAuth(req, res, next) {
  const token = leerCookie(req, COOKIE);
  if (!token) return res.status(401).json({ error: 'Inicia sesión' });
  try {
    req.usuario = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Sesión vencida' });
  }
}

function soloMedico(req, res, next) {
  if (req.usuario.rol !== 'medico') {
    return res.status(403).json({ error: 'Solo el médico puede hacer esto' });
  }
  next();
}

// ¿Este usuario puede ver al paciente?
async function tieneAcceso(usuario, pacienteId) {
  if (usuario.rol === 'paciente') return usuario.paciente_id === pacienteId;
  if (usuario.rol === 'medico') {
    const r = await pool.query(
      'SELECT 1 FROM medico_paciente WHERE medico_id = $1 AND paciente_id = $2',
      [usuario.medico_id, pacienteId]
    );
    return r.rows.length > 0;
  }
  return false;
}

async function accesoPaciente(req, res, next) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    if (!(await tieneAcceso(req.usuario, id))) {
      return res.status(403).json({ error: 'No tienes acceso a este expediente' });
    }
    req.pacienteId = id;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------- Rutas ----------
const router = express.Router();

router.post('/auth/login', async (req, res) => {
  const correo = String(req.body.correo || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  try {
    const r = await pool.query(
      `SELECT u.*, COALESCE(m.nombre, p.nombre) AS nombre
       FROM usuarios u
       LEFT JOIN medicos m ON m.id = u.medico_id
       LEFT JOIN pacientes p ON p.id = u.paciente_id
       WHERE lower(u.correo) = $1`,
      [correo]
    );
    const u = r.rows[0];
    const ok = await bcrypt.compare(password, u ? u.password_hash : HASH_FALSO);
    if (!u || !ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

    const datos = {
      uid: u.id, rol: u.rol, medico_id: u.medico_id,
      paciente_id: u.paciente_id, nombre: u.nombre
    };
    const token = jwt.sign(datos, SECRET, { expiresIn: '8h' });
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000 });
    res.json(datos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.get('/auth/yo', requireAuth, (req, res) => res.json(req.usuario));

module.exports = { router, requireAuth, soloMedico, accesoPaciente, tieneAcceso, parseId };