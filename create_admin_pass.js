const argon2 = require('argon2');

async function hashPassword(plainPassword) {
  try {
    // Hash the password
    const hash = await argon2.hash(plainPassword);
    console.log('Hashed password:', hash);
    return hash;
  } catch (err) {
    console.error('Error hashing password:', err);
  }
}

async function verifyPassword(hash, plainPassword) {
  try {
    if (await argon2.verify(hash, plainPassword)) {
      console.log('✅ Password match');
    } else {
      console.log('❌ Invalid password');
    }
  } catch (err) {
    console.error('Error verifying password:', err);
  }
}

// Example usage
(async () => {
  const password = 'admin2123';
  const hashed = await hashPassword(password);
})();
