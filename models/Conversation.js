/**
 * Conversation Model
 * Handles chat conversations and participants
 */

const db = require('../config/database');

class Conversation {
  /**
   * Create a new conversation
   */
  static async create(type, createdBy, participants = [], name = null, teamId = null) {
    try {
      const [result] = await db.query(
        `INSERT INTO conversations (type, name, created_by, team_id) 
         VALUES (?, ?, ?, ?)`,
        [type, name, createdBy, teamId]
      );

      const conversationId = result.insertId;

      // Add creator as admin
      await this.addParticipant(conversationId, createdBy, 'admin');

      // Add other participants
      for (const participantId of participants) {
        if (participantId !== createdBy) {
          await this.addParticipant(conversationId, participantId, 'participant');
        }
      }

      return this.findById(conversationId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Find conversation by ID
   */
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT c.*, 
              u.first_name as creator_first_name, 
              u.last_name as creator_last_name,
              t.name as team_name
       FROM conversations c
       INNER JOIN users u ON c.created_by = u.id
       LEFT JOIN teams t ON c.team_id = t.id
       WHERE c.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Get user's conversations
   */
  static async getUserConversations(userId) {
    const [rows] = await db.query(
      `SELECT c.*, 
              cp.role as user_role,
              cp.last_read_at,
              u.first_name as creator_first_name,
              u.last_name as creator_last_name,
              t.name as team_name,
              last_msg.content as last_message,
              last_msg.created_at as last_message_at,
              last_sender.first_name as last_sender_first_name,
              last_sender.last_name as last_sender_last_name,
              (
                SELECT COUNT(*) 
                FROM messages m2 
                WHERE m2.conversation_id = c.id 
                  AND m2.sender_id != ?
                  AND (cp.last_read_at IS NULL OR m2.created_at > cp.last_read_at)
              ) as unread_count,
              (
                SELECT COUNT(*) 
                FROM conversation_participants cp2 
                WHERE cp2.conversation_id = c.id AND cp2.is_active = true
              ) as participant_count
       FROM conversations c
       INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
       INNER JOIN users u ON c.created_by = u.id
       LEFT JOIN teams t ON c.team_id = t.id
       LEFT JOIN messages last_msg ON c.id = last_msg.conversation_id
       LEFT JOIN users last_sender ON last_msg.sender_id = last_sender.id
       LEFT JOIN messages later_msg ON c.id = later_msg.conversation_id AND later_msg.created_at > last_msg.created_at
       WHERE cp.user_id = ? AND cp.is_active = true AND later_msg.id IS NULL
       ORDER BY COALESCE(last_msg.created_at, c.created_at) DESC`,
      [userId, userId]
    );
    return rows;
  }

  /**
   * Get conversation participants
   */
  static async getParticipants(conversationId) {
    const [rows] = await db.query(
      `SELECT cp.*, 
              u.first_name, 
              u.last_name, 
              u.email
       FROM conversation_participants cp
       INNER JOIN users u ON cp.user_id = u.id
       WHERE cp.conversation_id = ? AND cp.is_active = true
       ORDER BY 
         CASE cp.role 
           WHEN 'admin' THEN 1 
           WHEN 'moderator' THEN 2 
           ELSE 3 
         END,
         cp.joined_at ASC`,
      [conversationId]
    );
    return rows;
  }

  /**
   * Add participant to conversation
   */
  static async addParticipant(conversationId, userId, role = 'participant') {
    try {
      const [result] = await db.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         is_active = true, 
         role = VALUES(role),
         joined_at = CURRENT_TIMESTAMP`,
        [conversationId, userId, role]
      );

      // Send system message
      const Message = require('./Message');
      const [user] = await db.query(`SELECT first_name, last_name FROM users WHERE id = ?`, [userId]);
      if (user.length > 0) {
        await Message.sendSystemMessage(
          conversationId, 
          `${user[0].first_name} ${user[0].last_name} joined the conversation`
        );
      }

      return result.insertId || result.affectedRows;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('User is already a participant in this conversation');
      }
      throw error;
    }
  }

  /**
   * Remove participant from conversation
   */
  static async removeParticipant(conversationId, userId, removedBy) {
    // Check if remover has permission
    const [permissions] = await db.query(
      `SELECT role FROM conversation_participants 
       WHERE conversation_id = ? AND user_id = ? AND is_active = true`,
      [conversationId, removedBy]
    );

    if (permissions.length === 0 || !['admin', 'moderator'].includes(permissions[0].role)) {
      throw new Error('Insufficient permissions to remove participant');
    }

    const [result] = await db.query(
      `UPDATE conversation_participants 
       SET is_active = false 
       WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, userId]
    );

    if (result.affectedRows > 0) {
      // Send system message
      const Message = require('./Message');
      const [user] = await db.query(`SELECT first_name, last_name FROM users WHERE id = ?`, [userId]);
      if (user.length > 0) {
        await Message.sendSystemMessage(
          conversationId, 
          `${user[0].first_name} ${user[0].last_name} left the conversation`
        );
      }
    }

    return result.affectedRows > 0;
  }

  /**
   * Leave conversation
   */
  static async leaveConversation(conversationId, userId) {
    const [result] = await db.query(
      `UPDATE conversation_participants 
       SET is_active = false 
       WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, userId]
    );

    if (result.affectedRows > 0) {
      // Send system message
      const Message = require('./Message');
      const [user] = await db.query(`SELECT first_name, last_name FROM users WHERE id = ?`, [userId]);
      if (user.length > 0) {
        await Message.sendSystemMessage(
          conversationId, 
          `${user[0].first_name} ${user[0].last_name} left the conversation`
        );
      }
    }

    return result.affectedRows > 0;
  }

  /**
   * Update participant role
   */
  static async updateParticipantRole(conversationId, participantId, newRole, updatedBy) {
    // Check if updater has permission
    const [permissions] = await db.query(
      `SELECT role FROM conversation_participants 
       WHERE conversation_id = ? AND user_id = ? AND is_active = true`,
      [conversationId, updatedBy]
    );

    if (permissions.length === 0 || permissions[0].role !== 'admin') {
      throw new Error('Only admins can update participant roles');
    }

    const [result] = await db.query(
      `UPDATE conversation_participants 
       SET role = ? 
       WHERE conversation_id = ? AND user_id = ?`,
      [newRole, conversationId, participantId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Find direct conversation between two users
   */
  static async findDirectConversation(userId1, userId2) {
    const [rows] = await db.query(
      `SELECT c.* FROM conversations c
       INNER JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
       INNER JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
       WHERE c.type = 'direct'
         AND cp1.user_id = ? AND cp1.is_active = true
         AND cp2.user_id = ? AND cp2.is_active = true
         AND (
           SELECT COUNT(*) 
           FROM conversation_participants cp3 
           WHERE cp3.conversation_id = c.id AND cp3.is_active = true
         ) = 2`,
      [userId1, userId2]
    );
    return rows[0] || null;
  }

  /**
   * Get team conversation
   */
  static async getTeamConversation(teamId) {
    const [rows] = await db.query(
      `SELECT * FROM conversations WHERE type = 'team' AND team_id = ?`,
      [teamId]
    );
    return rows[0] || null;
  }

  /**
   * Search conversations
   */
  static async searchConversations(userId, query, limit = 10) {
    const [rows] = await db.query(
      `SELECT DISTINCT c.*, 
              cp.role as user_role,
              u.first_name as creator_first_name,
              u.last_name as creator_last_name,
              t.name as team_name
       FROM conversations c
       INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
       INNER JOIN users u ON c.created_by = u.id
       LEFT JOIN teams t ON c.team_id = t.id
       LEFT JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
       LEFT JOIN users u2 ON cp2.user_id = u2.id
       WHERE cp.user_id = ? AND cp.is_active = true
         AND (
           c.name LIKE ? OR 
           t.name LIKE ? OR 
           u2.first_name LIKE ? OR 
           u2.last_name LIKE ?
         )
       ORDER BY c.updated_at DESC
       LIMIT ?`,
      [userId, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit]
    );
    return rows;
  }

  /**
   * Update conversation
   */
  static async update(conversationId, updateData, userId) {
    // Check if user has permission
    const [permissions] = await db.query(
      `SELECT role FROM conversation_participants 
       WHERE conversation_id = ? AND user_id = ? AND is_active = true`,
      [conversationId, userId]
    );

    if (permissions.length === 0 || !['admin', 'moderator'].includes(permissions[0].role)) {
      throw new Error('Insufficient permissions to update conversation');
    }

    const { name } = updateData;
    const [result] = await db.query(
      `UPDATE conversations 
       SET name = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [name, conversationId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Delete conversation
   */
  static async delete(conversationId, userId) {
    // Only admins or creators can delete conversations
    const [permissions] = await db.query(
      `SELECT c.created_by, cp.role 
       FROM conversations c
       LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.user_id = ?
       WHERE c.id = ?`,
      [userId, conversationId]
    );

    if (permissions.length === 0 || 
        (permissions[0].created_by !== userId && permissions[0].role !== 'admin')) {
      throw new Error('Insufficient permissions to delete conversation');
    }

    const [result] = await db.query(
      `DELETE FROM conversations WHERE id = ?`,
      [conversationId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Check if user is participant
   */
  static async isParticipant(conversationId, userId) {
    const [rows] = await db.query(
      `SELECT id FROM conversation_participants 
       WHERE conversation_id = ? AND user_id = ? AND is_active = true`,
      [conversationId, userId]
    );
    return rows.length > 0;
  }

  /**
   * Get conversation with participants info for display
   */
  static async getConversationInfo(conversationId, userId) {
    const conversation = await this.findById(conversationId);
    if (!conversation) return null;

    // Check if user is participant
    if (!(await this.isParticipant(conversationId, userId))) {
      throw new Error('User is not a participant in this conversation');
    }

    const participants = await this.getParticipants(conversationId);
    
    // For direct conversations, set name as other participant's name
    if (conversation.type === 'direct' && participants.length === 2) {
      const otherParticipant = participants.find(p => p.user_id !== userId);
      if (otherParticipant) {
        conversation.display_name = `${otherParticipant.first_name} ${otherParticipant.last_name}`;
      }
    } else {
      conversation.display_name = conversation.name || conversation.team_name || 'Group Chat';
    }

    conversation.participants = participants;
    return conversation;
  }
}

module.exports = Conversation;
