/**
 * Connection Model
 * Handles user connections/friendships
 */

const db = require('../config/database');

class Connection {
  /**
   * Send friend request
   */
  static async sendRequest(requesterId, addresseeId, message = null) {
    if (requesterId === addresseeId) {
      throw new Error('Cannot send friend request to yourself');
    }

    // Check if connection already exists
    const [existing] = await db.query(
      `SELECT * FROM user_connections 
       WHERE (requester_id = ? AND addressee_id = ?) 
          OR (requester_id = ? AND addressee_id = ?)`,
      [requesterId, addresseeId, addresseeId, requesterId]
    );

    if (existing.length > 0) {
      const connection = existing[0];
      if (connection.status === 'accepted') {
        throw new Error('You are already friends with this user');
      } else if (connection.status === 'pending') {
        throw new Error('Friend request already sent');
      } else if (connection.status === 'blocked') {
        throw new Error('Cannot send friend request to this user');
      }
    }

    try {
      const [result] = await db.query(
        `INSERT INTO user_connections (requester_id, addressee_id, message) 
         VALUES (?, ?, ?)`,
        [requesterId, addresseeId, message]
      );

      // Create notification
      await this.createNotification(addresseeId, 'friend_request', {
        requester_id: requesterId,
        message: message,
        connection_id: result.insertId
      });

      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Accept friend request
   */
  static async acceptRequest(connectionId, userId) {
    const [result] = await db.query(
      `UPDATE user_connections 
       SET status = 'accepted', responded_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND addressee_id = ? AND status = 'pending'`,
      [connectionId, userId]
    );

    if (result.affectedRows > 0) {
      // Create conversation for friends
      const [connection] = await db.query(
        `SELECT * FROM user_connections WHERE id = ?`,
        [connectionId]
      );

      if (connection.length > 0) {
        await this.createDirectConversation(connection[0].requester_id, userId);
      }

      return true;
    }
    return false;
  }

  /**
   * Reject friend request
   */
  static async rejectRequest(connectionId, userId) {
    const [result] = await db.query(
      `DELETE FROM user_connections 
       WHERE id = ? AND addressee_id = ? AND status = 'pending'`,
      [connectionId, userId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Block user
   */
  static async blockUser(blockerId, blockedId) {
    if (blockerId === blockedId) {
      throw new Error('Cannot block yourself');
    }

    // Remove any existing connection and create block
    await db.query(
      `DELETE FROM user_connections 
       WHERE (requester_id = ? AND addressee_id = ?) 
          OR (requester_id = ? AND addressee_id = ?)`,
      [blockerId, blockedId, blockedId, blockerId]
    );

    const [result] = await db.query(
      `INSERT INTO user_connections (requester_id, addressee_id, status) 
       VALUES (?, ?, 'blocked')`,
      [blockerId, blockedId]
    );

    return result.insertId;
  }

  /**
   * Unblock user
   */
  static async unblockUser(blockerId, blockedId) {
    const [result] = await db.query(
      `DELETE FROM user_connections 
       WHERE requester_id = ? AND addressee_id = ? AND status = 'blocked'`,
      [blockerId, blockedId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Remove friend
   */
  static async removeFriend(userId1, userId2) {
    const [result] = await db.query(
      `DELETE FROM user_connections 
       WHERE ((requester_id = ? AND addressee_id = ?) 
           OR (requester_id = ? AND addressee_id = ?)) 
         AND status = 'accepted'`,
      [userId1, userId2, userId2, userId1]
    );
    return result.affectedRows > 0;
  }

  /**
   * Get user's friends
   */
  static async getFriends(userId) {
    const [rows] = await db.query(
      `SELECT 
         CASE 
           WHEN uc.requester_id = ? THEN u2.id 
           ELSE u1.id 
         END as friend_id,
         CASE 
           WHEN uc.requester_id = ? THEN u2.first_name 
           ELSE u1.first_name 
         END as first_name,
         CASE 
           WHEN uc.requester_id = ? THEN u2.last_name 
           ELSE u1.last_name 
         END as last_name,
         CASE 
           WHEN uc.requester_id = ? THEN u2.email 
           ELSE u1.email 
         END as email,
         uc.responded_at as friends_since
       FROM user_connections uc
       INNER JOIN users u1 ON uc.requester_id = u1.id
       INNER JOIN users u2 ON uc.addressee_id = u2.id
       WHERE (uc.requester_id = ? OR uc.addressee_id = ?) 
         AND uc.status = 'accepted'
       ORDER BY uc.responded_at DESC`,
      [userId, userId, userId, userId, userId, userId]
    );
    return rows;
  }

  /**
   * Get pending friend requests (received)
   */
  static async getPendingRequests(userId) {
    const [rows] = await db.query(
      `SELECT uc.*, u.first_name, u.last_name, u.email
       FROM user_connections uc
       INNER JOIN users u ON uc.requester_id = u.id
       WHERE uc.addressee_id = ? AND uc.status = 'pending'
       ORDER BY uc.requested_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Get sent friend requests
   */
  static async getSentRequests(userId) {
    const [rows] = await db.query(
      `SELECT uc.*, u.first_name, u.last_name, u.email
       FROM user_connections uc
       INNER JOIN users u ON uc.addressee_id = u.id
       WHERE uc.requester_id = ? AND uc.status = 'pending'
       ORDER BY uc.requested_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Get blocked users
   */
  static async getBlockedUsers(userId) {
    const [rows] = await db.query(
      `SELECT uc.*, u.first_name, u.last_name, u.email
       FROM user_connections uc
       INNER JOIN users u ON uc.addressee_id = u.id
       WHERE uc.requester_id = ? AND uc.status = 'blocked'
       ORDER BY uc.requested_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Check connection status between users
   */
  static async getConnectionStatus(userId1, userId2) {
    const [rows] = await db.query(
      `SELECT * FROM user_connections 
       WHERE (requester_id = ? AND addressee_id = ?) 
          OR (requester_id = ? AND addressee_id = ?)`,
      [userId1, userId2, userId2, userId1]
    );

    if (rows.length === 0) return 'none';
    
    const connection = rows[0];
    if (connection.status === 'accepted') return 'friends';
    if (connection.status === 'blocked') return 'blocked';
    if (connection.status === 'pending') {
      return connection.requester_id === userId1 ? 'sent' : 'received';
    }
    
    return 'none';
  }

  /**
   * Get all available users for connections
   */
  static async getAllUsers(currentUserId, limit = 50) {
    console.log('getAllUsers - Current user ID:', currentUserId, 'Limit:', limit);
    
    try {
      // Simplified query first to test
      const result = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email
         FROM users u
         WHERE u.id != ? 
         ORDER BY u.first_name ASC
         LIMIT ?`,
        [currentUserId, limit]
      );
      
      console.log('getAllUsers - Raw result:', result);
      console.log('getAllUsers - Type of result:', typeof result);
      console.log('getAllUsers - Is result an array?', Array.isArray(result));
      
      // Handle the result properly - should be [rows, fields]
      const rows = Array.isArray(result) ? result[0] : [];
      console.log('getAllUsers - Rows:', rows);
      console.log('getAllUsers - Query result rows:', rows.length);
      console.log('getAllUsers - First few rows:', rows.slice(0, 3));
      return rows;
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      throw error;
    }
  }

  /**
   * Search users for connections
   */
  static async searchUsers(query, currentUserId, limit = 20) {
    console.log('searchUsers - Query:', query, 'Current user ID:', currentUserId, 'Limit:', limit);
    
    // If no query provided, return all users
    if (!query || query.trim().length === 0) {
      console.log('searchUsers - No query, calling getAllUsers');
      return this.getAllUsers(currentUserId, limit);
    }

    try {
      console.log('searchUsers - Running search query with:', query);
      const result = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email
         FROM users u
         WHERE u.id != ? 
           AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)
         ORDER BY u.first_name ASC
         LIMIT ?`,
        [currentUserId, `%${query}%`, `%${query}%`, `%${query}%`, limit]
      );
      
      console.log('searchUsers - Raw search result:', result);
      const rows = Array.isArray(result) ? result[0] : [];
      console.log('searchUsers - Search query result rows:', rows.length);
      console.log('searchUsers - First few search results:', rows.slice(0, 3));
      return rows;
    } catch (error) {
      console.error('Error in searchUsers:', error);
      throw error;
    }
  }

  /**
   * Create direct conversation between friends
   */
  static async createDirectConversation(userId1, userId2) {
    // Check if conversation already exists
    const [existing] = await db.query(
      `SELECT c.id FROM conversations c
       INNER JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
       INNER JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
       WHERE c.type = 'direct'
         AND cp1.user_id = ? AND cp2.user_id = ?`,
      [userId1, userId2]
    );

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new conversation
    const [result] = await db.query(
      `INSERT INTO conversations (type, created_by) VALUES ('direct', ?)`,
      [userId1]
    );

    const conversationId = result.insertId;

    // Add both users as participants
    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)`,
      [conversationId, userId1, conversationId, userId2]
    );

    return conversationId;
  }

  /**
   * Create notification
   */
  static async createNotification(userId, type, data) {
    const titles = {
      'friend_request': 'Friend Request',
      'friend_accepted': 'Friend Request Accepted',
    };

    await db.query(
      `INSERT INTO notifications (user_id, type, title, data) VALUES (?, ?, ?, ?)`,
      [userId, type, titles[type] || 'Notification', JSON.stringify(data)]
    );
  }
}

module.exports = Connection;
