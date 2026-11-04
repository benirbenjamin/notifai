const mysql = require('mysql2/promise');

async function testConnection() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: ''
        });
        
        console.log('Connected to MySQL successfully!');
        
        const [databases] = await connection.execute('SHOW DATABASES');
        console.log('Available databases:');
        databases.forEach(db => {
            console.log(`- ${db.Database}`);
        });
        
        await connection.end();
    } catch (error) {
        console.error('Connection error:', error.message);
    }
}

testConnection();
