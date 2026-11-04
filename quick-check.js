const db = require('./config/database');

async function checkDatabase() {
  try {
    console.log('Checking database plans...');
    const plans = await db.query('SELECT * FROM plans ORDER BY id');
    console.log('Current plans:', plans);
    
    console.log('\nActive plans only:');
    const activePlans = await db.query('SELECT * FROM plans WHERE is_active = TRUE ORDER BY id');
    console.log(activePlans);
    
    console.log('\nPlans query used by route:');
    const routePlans = await db.query('SELECT * FROM plans WHERE is_active = TRUE AND id IN (1, 2) ORDER BY price ASC');
    console.log(routePlans);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDatabase();
