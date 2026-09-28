import * as ExpoCrypto from 'expo-crypto';
import * as aesjs from 'aes-js';

// Cache the derived key so we don't rehash on every operation
let cachedKey = null;
let cachedMasterKey = null;

const getKeyFromMaster = async (masterKey) => {
  if (cachedKey && cachedMasterKey === masterKey) {
    return cachedKey;
  }
  const hash = await ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    masterKey,
    { encoding: ExpoCrypto.CryptoEncoding.HEX }
  );
  cachedKey = aesjs.utils.hex.toBytes(hash).slice(0, 32);
  cachedMasterKey = masterKey;
  return cachedKey;
};

export const clearKeyCache = () => {
  cachedKey = null;
  cachedMasterKey = null;
};

export const encryptPassword = async (password, masterKey) => {
  try {
    const key = await getKeyFromMaster(masterKey);
    const ivBytes = await ExpoCrypto.getRandomBytesAsync(16);
    const ivArray = Array.from(ivBytes);
    const textBytes = aesjs.utils.utf8.toBytes(password);
    const paddedText = aesjs.padding.pkcs7.pad(textBytes);
    const aesCbc = new aesjs.ModeOfOperation.cbc(key, ivArray);
    const encryptedBytes = aesCbc.encrypt(paddedText);
    const ivHex = aesjs.utils.hex.fromBytes(ivArray);
    const encryptedHex = aesjs.utils.hex.fromBytes(encryptedBytes);
    return ivHex + ':' + encryptedHex;
  } catch (err) {
    console.log('Encrypt error:', err);
    throw err;
  }
};

export const decryptPassword = async (encryptedData, masterKey) => {
  try {
    if (!encryptedData || !encryptedData.includes(':')) {
      console.log('Decrypt error: invalid encrypted data format');
      return '';
    }
    const [ivHex, encryptedHex] = encryptedData.split(':');
    const key = await getKeyFromMaster(masterKey);
    const ivArray = aesjs.utils.hex.toBytes(ivHex);
    const encryptedBytes = aesjs.utils.hex.toBytes(encryptedHex);
    const aesCbc = new aesjs.ModeOfOperation.cbc(key, ivArray);
    const decryptedBytes = aesCbc.decrypt(encryptedBytes);
    const unpaddedBytes = aesjs.padding.pkcs7.strip(decryptedBytes);
    return aesjs.utils.utf8.fromBytes(unpaddedBytes);
  } catch (err) {
    console.log('Decrypt error:', err);
    return '';
  }
};

export const hashPassword = async (password) => {
  return await ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    password
  );
};

export const verifyPassword = async (password, hash) => {
  const hashed = await hashPassword(password);
  return hashed === hash;
};