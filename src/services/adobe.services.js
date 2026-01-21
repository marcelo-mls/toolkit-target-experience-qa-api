require('dotenv').config();

const {
  API_KEY,
  TENANT_ID,
  CLIENT_ID, // token
  CLIENT_SECRET, // token
  API_SCOPE // token
} = process.env;

async function generateTokenAPI() {
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'grant_type': 'client_credentials',
      'client_id': CLIENT_ID,
      'client_secret': CLIENT_SECRET,
      'scope': API_SCOPE,
    }),
  };

  const url = 'https://ims-na1.adobelogin.com/ims/token/v3';
  const response = await fetch(url, options);
  const tokenData = await response.json();
  const token = tokenData.access_token;
  
  return token;
}

/**
 * Faz uma requisição à API do Adobe com base nos parâmetros fornecidos.
 * @param {string} endpointName - O nome do endpoint da API do Adobe que será chamado.
 * @param {string} token - O token JWT de autenticação necessário para acessar a API.
 * @param {string|null} [id=null] - (Opcional) O ID do recurso que você quer buscar. Pode ser nulo.
 * @param {string|null} [type=null] - (Opcional) O tipo/status do recurso ou operação que está sendo solicitada. Pode ser nulo.
 */

async function fetchAdobeAPI(endpointName, token, id=null, type=null) {
  // https://developer.adobe.com/target/administer/admin-api/
  // https://experienceleague.adobe.com/pt-br/docs/target-dev/developer/api/target-api-overview
  // https://developers.adobetarget.com/api/#admin-postman-collection
  
  let version = 'v2';

  if (['activity'].includes(endpointName) && type === 'autoallocate') {
    version = 'v1';
  } else if (['audience', 'audiences'].includes(endpointName)) {
    version = 'v3';
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Api-Key': API_KEY,
    'Accept': `application/vnd.adobe.target.${version}+json`
  };

  const endpoints = {
    activity: `/target/activities/${type}/${id}`,
    activities: id ? `/target/activities/?id=${id}` : `/target/activities/?state=${type}`,
    offer: `/target/offers/${type}/${id}`,
    offers: id ? `/target/offers/?id=${id}` : '/target/offers/',
    audience: `/target/audiences/${id}`,
    audiences: '/target/audiences',
  };

  const url = `https://mc.adobe.io/${TENANT_ID}${endpoints[endpointName]}`;

  const response = await fetch(url, { headers });
  return response.json();
}

module.exports = {
  generateTokenAPI,
  fetchAdobeAPI,
};
