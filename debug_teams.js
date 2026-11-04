const mysql = require('mysql2/promise');

async function checkDB() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'task_management'
    });
    
    console.log('Connected to database');
    
    // Check if teams table exists
    const [tables] = await connection.execute("SHOW TABLES LIKE 'teams'");
    console.log('Teams table exists:', tables.length > 0);
    
    // Check if team_members table exists
    const [memberTables] = await connection.execute("SHOW TABLES LIKE 'team_members'");
    console.log('Team_members table exists:', memberTables.length > 0);
    
    if (tables.length > 0) {
      const [teams] = await connection.execute('SELECT * FROM teams WHERE created_by = 57');
      console.log('Teams created by user 57:', teams);
    }
    
    if (memberTables.length > 0) {
      const [members] = await connection.execute('SELECT * FROM team_members WHERE user_id = 57');
      console.log('Team memberships for user 57:', members);
    }
    
    await connection.end();
  } catch (error) {
    console.error('Database error:', error.message);
  }
}

checkDB();
