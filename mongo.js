require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('expedientes');
  console.log('Conectado. Notas en la colección:',
    await db.collection('notas_clinicas').countDocuments());
  await client.close();
})();