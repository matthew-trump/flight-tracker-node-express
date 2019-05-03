const fs = require('fs');

const RSA_PRIVATE_KEY_PATH = process.env.RSA_PRIVATE_KEY_PATH || './keys/jwtRS256.key';
const RSA_PUBLIC_KEY_PATH = process.env.RSA_PUBLC_KEY_PATH || './keys/jwtRS256.key.pub';

const RSA_PRIVATE_KEY = fs.readFileSync(RSA_PRIVATE_KEY_PATH);
const RSA_PUBLIC_KEY = fs.readFileSync(RSA_PUBLIC_KEY_PATH);

const JWT_ALGORITHM = "RS256";

module.exports = { RSA_PRIVATE_KEY, RSA_PUBLIC_KEY, JWT_ALGORITHM }