const fs = require('fs');

// Read the file
let content = fs.readFileSync('routes/activities.js', 'utf8');

// Replace the old logic with new logic for both occurrences
content = content.replace(
  /if \(activity\.type === 'payment'\) \{\s*updateData\.totalAmount = parseFloat\(total_amount\) \|\| 0;\s*updateData\.remainingAmount = updateData\.totalAmount - activity\.paid_amount;\s*\} else if \(activity\.type === 'purchase'\) \{/g,
  `// Set amount for all activity types (not just payment)
    updateData.totalAmount = parseFloat(total_amount || 0) || 0;
    
    if (activity.type === 'payment') {
      updateData.remainingAmount = updateData.totalAmount - activity.paid_amount;
    }
    
    if (activity.type === 'purchase') {`
);

// Write the file back
fs.writeFileSync('routes/activities.js', content);
console.log('File updated successfully!');
