/**
 * Message Model
 * Handles chat messages and conversations
 */

const db = require('../config/database');

class Message {
  /**
   * Send a message
   */
  static async send(conversationId, senderId, content, messageType = 'text', fileData = null, replyToId = null, activityId = null) {
    try {
      // Verify sender is participant in conversation
      const [participants] = await db.query(
        `SELECT id FROM conversation_participants 
         WHERE conversation_id = ? AND user_id = ? AND is_active = true`,
        [conversationId, senderId]
      );

      if (participants.length === 0) {
        throw new Error('User is not a participant in this conversation');
      }

      const [result] = await db.query(
        `INSERT INTO messages 
         (conversation_id, sender_id, message_type, content, file_url, file_name, file_size, activity_id, reply_to_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          conversationId, 
          senderId, 
          messageType, 
          content,
          fileData?.url || null,
          fileData?.name || null,
          fileData?.size || null,
          activityId,
          replyToId
        ]
      );

      // Update conversation last activity
      await db.query(
        `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [conversationId]
      );

      // Update sender's last read
      await db.query(
        `UPDATE conversation_participants 
         SET last_read_at = CURRENT_TIMESTAMP 
         WHERE conversation_id = ? AND user_id = ?`,
        [conversationId, senderId]
      );

      return this.findById(result.insertId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Find message by ID
   */
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT m.*, 
              u.first_name as sender_first_name, 
              u.last_name as sender_last_name,
              reply_msg.content as reply_content,
              reply_user.first_name as reply_user_first_name,
              reply_user.last_name as reply_user_last_name,
              a.title as activity_title
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       LEFT JOIN messages reply_msg ON m.reply_to_id = reply_msg.id
       LEFT JOIN users reply_user ON reply_msg.sender_id = reply_user.id
       LEFT JOIN activities a ON m.activity_id = a.id
       WHERE m.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Get conversation messages
   */
  static async getConversationMessages(conversationId, userId, limit = 50, offset = 0) {
    // Verify user is participant
    const [participants] = await db.query(
      `SELECT id FROM conversation_participants 
       WHERE conversation_id = ? AND user_id = ? AND is_active = true`,
      [conversationId, userId]
    );

    if (participants.length === 0) {
      throw new Error('User is not a participant in this conversation');
    }

    const [rows] = await db.query(
      `SELECT m.*, 
              u.first_name as sender_first_name, 
              u.last_name as sender_last_name,
              reply_msg.content as reply_content,
              reply_user.first_name as reply_user_first_name,
              reply_user.last_name as reply_user_last_name,
              a.title as activity_title,
              GROUP_CONCAT(
                JSON_OBJECT(
                  'reaction', mr.reaction,
                  'user_id', mr.user_id,
                  'first_name', reaction_user.first_name,
                  'last_name', reaction_user.last_name
                )
              ) as reactions
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       LEFT JOIN messages reply_msg ON m.reply_to_id = reply_msg.id
       LEFT JOIN users reply_user ON reply_msg.sender_id = reply_user.id
       LEFT JOIN activities a ON m.activity_id = a.id
       LEFT JOIN message_reactions mr ON m.id = mr.message_id
       LEFT JOIN users reaction_user ON mr.user_id = reaction_user.id
       WHERE m.conversation_id = ?
       GROUP BY m.id
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [conversationId, limit, offset]
    );

    // Parse reactions
    return rows.map(row => ({
      ...row,
      reactions: row.reactions ? JSON.parse(`[${row.reactions}]`) : []
    }));
  }

  /**
   * Edit message
   */
  static async edit(messageId, userId, newContent) {
    const [result] = await db.query(
      `UPDATE messages 
       SET content = ?, is_edited = true, edited_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND sender_id = ? AND message_type = 'text'`,
      [newContent, messageId, userId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Message not found or cannot be edited');
    }

    return this.findById(messageId);
  }

  /**
   * Delete message
   */
  static async delete(messageId, userId) {
    // Check if user owns the message or is admin of conversation
    const [messages] = await db.query(
      `SELECT m.*, cp.role 
       FROM messages m
       INNER JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
       WHERE m.id = ? AND (m.sender_id = ? OR (cp.user_id = ? AND cp.role IN ('admin', 'moderator')))`,
      [messageId, userId, userId]
    );

    if (messages.length === 0) {
      throw new Error('Message not found or insufficient permissions');
    }

    const [result] = await db.query(
      `DELETE FROM messages WHERE id = ?`,
      [messageId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Add reaction to message
   */
  static async addReaction(messageId, userId, reaction) {
    const validReactions = ['like', 'love', 'laugh', 'wow', 'sad', 'angry'];
    if (!validReactions.includes(reaction)) {
      throw new Error('Invalid reaction type');
    }

    try {
      await db.query(
        `INSERT INTO message_reactions (message_id, user_id, reaction) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE reaction = VALUES(reaction)`,
        [messageId, userId, reaction]
      );
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove reaction from message
   */
  static async removeReaction(messageId, userId) {
    const [result] = await db.query(
      `DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?`,
      [messageId, userId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Mark messages as read
   */
  static async markAsRead(conversationId, userId, messageId = null) {
    if (messageId) {
      // Mark specific message and all before it as read
      await db.query(
        `UPDATE conversation_participants 
         SET last_read_at = (SELECT created_at FROM messages WHERE id = ?)
         WHERE conversation_id = ? AND user_id = ?`,
        [messageId, conversationId, userId]
      );
    } else {
      // Mark all messages as read
      await db.query(
        `UPDATE conversation_participants 
         SET last_read_at = CURRENT_TIMESTAMP 
         WHERE conversation_id = ? AND user_id = ?`,
        [conversationId, userId]
      );
    }
    return true;
  }

  /**
   * Get unread message count
   */
  static async getUnreadCount(conversationId, userId) {
    const [rows] = await db.query(
      `SELECT COUNT(*) as unread_count
       FROM messages m
       INNER JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
       WHERE m.conversation_id = ? 
         AND cp.user_id = ? 
         AND m.sender_id != ?
         AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)`,
      [conversationId, userId, userId]
    );
    return rows[0]?.unread_count || 0;
  }

  /**
   * Search messages
   */
  static async search(conversationId, userId, query, limit = 20) {
    // Verify user is participant
    const [participants] = await db.query(
      `SELECT id FROM conversation_participants 
       WHERE conversation_id = ? AND user_id = ? AND is_active = true`,
      [conversationId, userId]
    );

    if (participants.length === 0) {
      throw new Error('User is not a participant in this conversation');
    }

    const [rows] = await db.query(
      `SELECT m.*, 
              u.first_name as sender_first_name, 
              u.last_name as sender_last_name
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ? 
         AND (m.content LIKE ? OR m.file_name LIKE ?)
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [conversationId, `%${query}%`, `%${query}%`, limit]
    );
    return rows;
  }

  /**
   * Get message statistics for conversation
   */
  static async getConversationStats(conversationId) {
    const [stats] = await db.query(
      `SELECT 
         COUNT(*) as total_messages,
         COUNT(DISTINCT sender_id) as active_users,
         MAX(created_at) as last_message_at,
         SUM(CASE WHEN message_type = 'file' THEN 1 ELSE 0 END) as file_count
       FROM messages 
       WHERE conversation_id = ?`,
      [conversationId]
    );
    return stats[0] || {};
  }

  /**
   * Send system message
   */
  static async sendSystemMessage(conversationId, content, data = null) {
    const [result] = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message_type, content) 
       VALUES (?, 1, 'system', ?)`,
      [conversationId, content]
    );

    return result.insertId;
  }
}

module.exports = Message;
