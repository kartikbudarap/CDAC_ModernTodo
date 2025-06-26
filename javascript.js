const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Cloud Function to update user stats when todos change
exports.updateUserStats = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    // Only proceed if todos changed
    if (JSON.stringify(newData.todos) !== JSON.stringify(oldData.todos)) {
      const completed = newData.todos.filter(t => t.completed).length;
      const total = newData.todos.length;
      
      const stats = {
        total,
        completed,
        completionRate: total > 0 ? (completed / total) : 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      return change.after.ref.update({ stats });
    }
    return null;
  });

// Cloud Function to send reminder emails
exports.sendReminderEmails = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const usersSnapshot = await admin.firestore().collection('users').get();
    const currentDate = new Date();
    
    const promises = usersSnapshot.docs.map(async (userDoc) => {
      const user = userDoc.data();
      const overdueTodos = user.todos.filter(todo => {
        if (todo.dueDate) {
          const dueDate = new Date(todo.dueDate);
          return !todo.completed && dueDate < currentDate;
        }
        return false;
      });
      
      if (overdueTodos.length > 0 && user.email) {
        // In a real app, you would send an email here
        // For demo, we'll just log it
        console.log(`Would send reminder to ${user.email} about ${overdueTodos.length} overdue tasks`);
        
        // Update the user document with last reminder sent time
        return userDoc.ref.update({
          lastReminderSent: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      return null;
    });
    
    await Promise.all(promises);
    console.log('Reminder processing complete');
  });

// Cloud Function for analytics data aggregation
exports.aggregateAnalytics = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const usersSnapshot = await admin.firestore().collection('users').get();
    let totalUsers = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    
    usersSnapshot.forEach(userDoc => {
      const user = userDoc.data();
      totalUsers++;
      totalTasks += user.todos?.length || 0;
      completedTasks += user.todos?.filter(t => t.completed).length || 0;
    });
    
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) : 0;
    
    const analyticsData = {
      totalUsers,
      totalTasks,
      completedTasks,
      completionRate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await admin.firestore().collection('analytics').doc('daily').set(analyticsData, { merge: true });
    console.log('Analytics aggregation complete');
  });