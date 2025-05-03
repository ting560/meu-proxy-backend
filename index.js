const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para logs de requisições
app.use((req, res, next) => {
  console.log(`Recebendo requisição para /proxy`);
  console.log(`Parâmetros da query string:`, req.query);
  next();
});

// Rota para fazer requisições ao servidor pfsv.io
app.get("/proxy", async (req, res) => {
  try {
    const { url, password, action } = req.query;
    if (!url || !password || !action) {
      return res.status(400).send("Missing parameters: 'url', 'password', or 'action'");
    }

    // Montar a URL completa com todos os parâmetros
    const fullUrl = `${url}&password=${password}&action=${action}`;

    console.log(`Fazendo requisição para:`, fullUrl);

    // Adicionar cabeçalhos personalizados
    const response = await axios.get(fullUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Accept-Encoding": "gzip, deflate, br",
      },
      timeout: 10000, // Definir timeout de 10 segundos
    });

    console.log(`Resposta recebida:`, response.data);
    res.json(response.data);
  } catch (error) {
    console.error("Erro ao fazer a requisição:", error.message);
    console.error("Detalhes do erro:", error.response?.data || error);
    res.status(500).send("Erro ao acessar o servidor.");
  }
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});