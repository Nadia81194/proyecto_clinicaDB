//require('node:dns').setServers(['8.8.8.8', '1.1.1.1']); //si tu red lo necesita
const express = require('express');
const { router } = require('./funciones');

const app = express();
app.use(express.json());
app.use(router);

const PORT = process.env.PORT_NOTAS || 3001;
app.listen(PORT, () => {
  console.log(`Servidor de notas (Mongo) corriendo en el puerto ${PORT}`);
});