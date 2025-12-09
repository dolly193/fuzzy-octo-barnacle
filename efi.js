// efi.js
const EfiPay = require('sdk-node-apis-efi');
const path = require('path');
const fs = require('fs');

let efi;
let efiReady = false;

/**
 * Inicializa a SDK da Efi com as credenciais e o certificado.
 * @param {object} config As configurações da aplicação.
 * @returns {boolean} Verdadeiro se a inicialização for bem-sucedida.
 */
function initializeEfi(config) {
  if (!config.efiClientId || !config.efiClientSecret) {
    console.warn('Credenciais da Efi (Client ID/Secret) não configuradas. A geração de PIX está desativada.');
    efiReady = false;
    return false;
  }

  let certificateBuffer;
  const certEnvVar = config.efiSandbox ? process.env.EFI_CERT_HOMOLOGACAO_BASE64 : process.env.EFI_CERT_PRODUCAO_BASE64;

  if (certEnvVar) {
    // Se a variável de ambiente existir, decodifica de Base64 para o buffer do certificado.
    console.log('Carregando certificado da Efi a partir da variável de ambiente.');
    certificateBuffer = Buffer.from(certEnvVar, 'base64');
  } else {
    // Se não, tenta carregar o arquivo localmente (para desenvolvimento).
    console.log('Carregando certificado da Efi a partir de arquivo local.');
    const certName = config.efiSandbox ? 'homologacao.p12' : 'producao.p12';
    const certPath = path.join(__dirname, 'certs', certName);
    if (!fs.existsSync(certPath)) {
      console.warn(`Certificado da Efi (${certName}) não encontrado em ${certPath} nem em variáveis de ambiente. A geração de PIX está desativada.`);
      efiReady = false;
      return false;
    }
    certificateBuffer = fs.readFileSync(certPath);
  }

  const options = {
    clientID: config.efiClientId,
    clientSecret: config.efiClientSecret,
    sandbox: config.efiSandbox,
    cert: certificateBuffer,
  };

  efi = new EfiPay(options);
  efiReady = true;
  console.log(`SDK da Efi inicializada em modo ${config.efiSandbox ? 'Homologação' : 'Produção'}.`);
  return true;
}

/**
 * Gera uma cobrança PIX imediata.
 * @param {number} value O valor da cobrança em centavos (ex: 1000 para R$ 10,00).
 * @param {string} txid O ID único da transação.
 * @param {number} expiration Segundos para a expiração do QR Code.
 * @returns {Promise<object|null>} O objeto com os dados do QR Code ou nulo em caso de erro.
 */
async function createPixCharge(value, txid, expiration = 3600) {
  if (!efiReady) {
    console.error('Tentativa de criar cobrança PIX com a SDK da Efi não inicializada.');
    return null;
  }

  const body = {
    calendario: { expiracao: expiration },
    valor: { original: (value / 100).toFixed(2) },
    chave: process.env.EFI_PIX_KEY, // Sua chave PIX cadastrada na Efi
    solicitacaoPagador: `Pagamento para DOLLYA STORE`,
  };

  return efi.pixCreateImmediateCharge({ txid }, body);
}

/**
 * Configura o webhook PIX na Efi.
 * @param {string} webhookUrl A URL do seu webhook.
 * @returns {Promise<void>}
 */
async function configureWebhook(webhookUrl) {
  if (!efiReady || !process.env.EFI_PIX_KEY) {
    console.warn('Efi não pronta ou chave PIX não definida. Pulando configuração do webhook.');
    return;
  }

  const params = {
    chave: process.env.EFI_PIX_KEY,
  };

  const body = {
    webhookUrl: webhookUrl,
  };

  try {
    // O método pixConfigWebhook já verifica se o webhook existe e o atualiza se necessário.
    await efi.pixConfigWebhook(params, body);
    console.log(`Webhook da Efi configurado com sucesso para: ${webhookUrl}`);
  } catch (error) {
    console.error('Falha ao configurar o webhook da Efi:', error.detail || error);
  }
}


module.exports = { initializeEfi, createPixCharge, isEfiReady: () => efiReady, configureWebhook };