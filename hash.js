const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('password123', 10);
console.log('HASH:', hash);
