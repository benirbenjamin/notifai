const mysql = require('mysql2/promise');

async function addTimedFields() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'managinga_space'
        });
        
        // Check if columns already exist
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'managinga_space' 
            AND TABLE_NAME = 'activities' 
            AND COLUMN_NAME IN ('start_time', 'end_time')
        `);
        
        const existingColumns = columns.map(col => col.COLUMN_NAME);
        
        if (!existingColumns.includes('start_time')) {
            await connection.execute(`
                ALTER TABLE activities 
                ADD COLUMN start_time DATETIME NULL
            `);
            console.log('Added start_time column');
        } else {
            console.log('start_time column already exists');
        }
        
        if (!existingColumns.includes('end_time')) {
            await connection.execute(`
                ALTER TABLE activities 
                ADD COLUMN end_time DATETIME NULL
            `);
            console.log('Added end_time column');
        } else {
            console.log('end_time column already exists');
        }
        
        await connection.end();
        console.log('Database migration completed successfully!');
    } catch (error) {
        console.error('Error during migration:', error.message);
    }
}

addTimedFields();
