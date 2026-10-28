require('dotenv').config();
const pool = require('./db');
const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    console.log('--- PostgreSQL ---');
    for (const t of ['pacientes', 'medicos', 'medico_paciente', 'usuarios']) {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
      console.log(t.padEnd(18), r.rows[0].n);
    }

    await client.connect();
    const col = client.db('expedientes').collection('notas_clinicas');
    console.log('--- MongoDB ---');
    console.log('notas_clinicas'.padEnd(18), await col.countDocuments());

    const ids = (await pool.query('SELECT id FROM pacientes')).rows.map(r => r.id);
    const huerfanas = await col.countDocuments({ paciente_id: { $nin: ids } });
    console.log('--- Consistencia ---');
    console.log('notas sin paciente en Postgres:', huerfanas);
    console.log('índices en Mongo:', (await col.indexes()).map(i => i.name).join(', '));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
    await pool.end();
  }
})();