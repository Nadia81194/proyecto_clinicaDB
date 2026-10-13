require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

(async () => {
  try {
    // 1. Cifra las contraseñas que estén en texto plano (las de bcrypt empiezan con $2)
    const planos = (await pool.query(
      "SELECT id, correo, password_hash FROM usuarios WHERE password_hash NOT LIKE '$2%'"
    )).rows;
    for (const u of planos) {
      const hash = await bcrypt.hash(u.password_hash, 10);
      await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, u.id]);
      console.log('Contraseña cifrada para', u.correo);
    }

    // 2. Pacientes sin médico asignado -> al primer médico
    const medicos = (await pool.query('SELECT id FROM medicos ORDER BY id')).rows;
    if (medicos.length > 0) {
      await pool.query(
        `INSERT INTO medico_paciente (medico_id, paciente_id)
         SELECT $1, p.id FROM pacientes p
         WHERE NOT EXISTS (SELECT 1 FROM medico_paciente mp WHERE mp.paciente_id = p.id)`,
        [medicos[0].id]
      );
    }

    // 3. Pacientes que no tengan usuario: se les crea uno (contraseña paciente123)
    const sinUsuario = (await pool.query(
      `SELECT id FROM pacientes p
       WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.paciente_id = p.id)`
    )).rows;
    const hashPac = await bcrypt.hash('paciente123', 10);
    for (const p of sinUsuario) {
      const correo = `paciente${p.id}@clinica.test`;
      await pool.query(
        `INSERT INTO usuarios (correo, password_hash, rol, paciente_id)
         VALUES ($1, $2, 'paciente', $3) ON CONFLICT (correo) DO NOTHING`,
        [correo, hashPac, p.id]
      );
      console.log('Usuario creado:', correo, ' contraseña: paciente123');
    }
    console.log('Listo.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();