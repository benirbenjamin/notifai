const mysql = require('mysql2/promise');

async function checkSchema() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'activity_manager'
        });
        
        const [rows] = await connection.execute('DESCRIBE activities');
        console.log('Current activities table structure:');
        rows.forEach(row => {
            console.log(`${row.Field} - ${row.Type} - ${row.Null} - ${row.Key} - ${row.Default}`);
        });
        
        await connection.end();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkSchema();
