import sha1 from 'js-sha1';
import axios from 'axios';

export const checkPasswordBreach = async (password) => {
  try {
    const hash = sha1(password).toUpperCase();
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    const response = await axios.get(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { 'Add-Padding': 'true' },
        timeout: 5000,
      }
    );

    const hashes = response.data.split('\n');
    const match = hashes.find(line => line.split(':')[0].trim() === suffix);

    if (match) {
      const count = parseInt(match.split(':')[1], 10);
      return { breached: true, count, checked: true };
    }

    return { breached: false, count: 0, checked: true };
  } catch (err) {
    console.log('HIBP error:', err);
    // Return checked: false so the caller knows the check didn't complete
    return { breached: false, count: 0, checked: false };
  }
};