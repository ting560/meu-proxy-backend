import express from 'express';
import axios from 'axios';
// --- CORREÇÃO AQUI ---
import pkg from 'http-proxy-agent'; // Importa o módulo CommonJS como um objeto 'pkg'
const { HttpProxyAgent } = pkg;     // Acessa a exportação 'HttpProxyAgent' dentro desse objeto
// --- FIM CORREÇÃO ---
import { URL } from 'url'; // Necessário para construir a URL do proxy

const app = express();
// O Render define a porta via variável de ambiente
const port = process.env.PORT || 3000;

// **ATENÇÃO**: Use variáveis de ambiente no Render para segurança!
const PROXY_URL = process.env.PROXY_URL;         // Ex: http://cdn11.cc:80
const PROXY_USER = process.env.PROXY_USER;       // Ex: usuario
const PROXY_PASSWORD = process.env.PROXY_PASSWORD; // Ex: epg

// Verifica se as variáveis de ambiente estão configuradas
if (!PROXY_URL || !PROXY_USER || !PROXY_PASSWORD) {
    console.error("ERRO: As variáveis de ambiente PROXY_URL, PROXY_USER e PROXY_PASSWORD devem estar configuradas no Render.");
    process.exit(1); // Encerrar se não estiver configurado
}

// Constrói a URL do proxy com autenticação para o agente
let authenticatedProxyUrl;
try {
    authenticatedProxyUrl = new URL(PROXY_URL);
    authenticatedProxyUrl.username = encodeURIComponent(PROXY_USER); // Codifica usuário e senha para URLs
    authenticatedProxyUrl.password = encodeURIComponent(PROXY_PASSWORD);
} catch (e) {
    console.error("ERRO: URL do proxy inválida:", PROXY_URL);
    process.exit(1);
}


// Cria o agente proxy que o axios usará
// Aparentemente HttpProxyAgent pode ser instanciado diretamente com a URL string
const proxyAgent = new HttpProxyAgent(authenticatedProxyUrl.toString());

// Middleware para todas as requisições (GET, POST, etc.)
// Assumimos que o player enviará a URL de destino completa no caminho da requisição
// Ex: Player requisita HTTPS://sua-app-render.onrender.com/http://site-real.com/dados
app.all('*', async (req, res) => {
    // Extrai a URL de destino do caminho da requisição
    // Remove a barra inicial '/' do caminho
    const targetUrl = req.originalUrl.substring(1);

    if (!targetUrl) {
        return res.status(400).send("A URL de destino não foi fornecida no caminho da requisição.");
    }

    console.log(`Recebida requisição para: ${targetUrl}`);
    console.log(`Método: ${req.method}`);

    try {
        // Prepara os cabeçalhos: Copia os cabeçalhos da requisição original,
        // mas remove cabeçalhos "hop-by-hop" e deixa o axios gerenciar o 'Host'.
        const requestHeaders = { ...req.headers };
        delete requestHeaders.host; // Axios definirá o cabeçalho Host correto
        delete requestHeaders.connection;
        delete requestHeaders['proxy-connection'];
        delete requestHeaders['keep-alive'];
        delete requestHeaders['transfer-encoding'];
        delete requestHeaders['upgrade'];
        // Adicione outros cabeçalhos que você saiba que o player envia e são importantes
        // ou remova cabeçalhos que podem causar problemas.

        // Faz a requisição ao destino usando o proxy configurado
        const response = await axios({
            method: req.method,             // Usa o método da requisição original (GET, POST, etc.)
            url: targetUrl,                 // A URL de destino real
            headers: requestHeaders,        // Cabeçalhos filtrados
            data: req.body,                 // Dados da requisição (para POST, PUT, etc.)
            httpAgent: proxyAgent,          // Usa o agente para requisições HTTP via proxy
            httpsAgent: proxyAgent,         // Usa o agente para requisições HTTPS via proxy
            validateStatus: () => true,     // Não lançar erro para status 4xx/5xx
            responseType: 'stream',         // Recebe a resposta como stream para melhor performance
            timeout: 60000                  // Timeout de 60 segundos para a requisição
        });

        // Define o status e os cabeçalhos da resposta de volta para o player
        res.status(response.status);
        // Copia os cabeçalhos da resposta, filtrando hop-by-hop
        Object.keys(response.headers).forEach(key => {
            if (!['connection', 'proxy-connection', 'keep-alive', 'transfer-encoding', 'upgrade'].includes(key.toLowerCase())) {
                 res.setHeader(key, response.headers[key]);
            }
        });

        // Envia o corpo da resposta de volta ao player (stream)
        response.data.pipe(res);

        console.log(`Requisição proxied com sucesso para ${targetUrl} com status ${response.status}`);

    } catch (error) {
        console.error(`Erro ao processar requisição para ${targetUrl}:`, error.message);

        // Envia uma resposta de erro para o player
        if (error.response) {
            // Se o proxy (ou destino) retornou uma resposta de erro
            res.status(error.response.status).send(`Proxy Error: ${error.response.statusText || 'Unknown Error'}`);
        } else if (error.code === 'ETIMEDOUT') {
             res.status(504).send('Gateway Timeout');
        }
         else {
            // Outros erros (rede, conexão com o proxy, etc.)
            res.status(500).send(`Internal Proxy Error: ${error.message}`);
        }
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Intermediário Proxy HTTPS escutando na porta ${port}`);
});
