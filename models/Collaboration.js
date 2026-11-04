/**
 * Collaboration Model
 * Handles activity collaboration and invitations
 */

const db = require('../config/database');
const crypto = require('crypto');

class Collaboration {
  /**
   * Invite collaborator to activity
   */
  static async inviteCollaborator(activityId, invitedBy, email, role = 'editor') {
    const invitation_token = crypto.randomBytes(32).toString('hex');
    
    // Check if user exists
    const [users] = await db.query(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );

    const userId = users.length > 0 ? users[0].id : null;

    try {
      const [result] = await db.query(
        `INSERT INTO activity_collaborators 
         (activity_id, user_id, invited_by, role, invitation_token, invited_email) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [activityId, userId, invitedBy, role, invitation_token, email]
      );

      // Create notification if user exists
      if (userId) {
        await this.createNotification(userId, 'activity_collaboration', {
          activity_id: activityId,
          invited_by: invitedBy,
          role: role,
          token: invitation_token
        });
      }

      return {
        id: result.insertId,
        invitation_token,
        needs_signup: !userId
      };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('User is already a collaborator on this activity');
      }
      throw error;
    }
  }

  /**
   * Accept collaboration invitation
   */
  static async acceptInvitation(token, userId = null) {
    const [invitations] = await db.query(
      `SELECT ac.*, a.title as activity_title, a.user_id as activity_owner,
              u.first_name as inviter_first_name, u.last_name as inviter_last_name
       FROM activity_collaborators ac
       INNER JOIN activities a ON ac.activity_id = a.id
       INNER JOIN users u ON ac.invited_by = u.id
       WHERE ac.invitation_token = ? AND ac.status = 'pending'`,
      [token]
    );

    if (invitations.length === 0) {
      throw new Error('Invalid or expired invitation');
    }

    const invitation = invitations[0];
    
    // If userId is provided, update the invitation
    if (userId) {
      await db.query(
        `UPDATE activity_collaborators 
         SET user_id = ?, status = 'accepted', responded_at = CURRENT_TIMESTAMP 
         WHERE invitation_token = ?`,
        [userId, token]
      );
    } else {
      // Just mark as accepted if user was already known
      await db.query(
        `UPDATE activity_collaborators 
         SET status = 'accepted', responded_at = CURRENT_TIMESTAMP 
         WHERE invitation_token = ?`,
        [token]
      );
    }

    return invitation;
  }

  /**
   * Reject collaboration invitation
   */
  static async rejectInvitation(token) {
    const [result] = await db.query(
      `UPDATE activity_collaborators 
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP 
       WHERE invitation_token = ? AND status = 'pending'`,
      [token]
    );

    return result.affectedRows > 0;
  }

  /**
   * Get activity collaborators
   */
  static async getCollaborators(activityId) {
    const [rows] = await db.query(
      `SELECT ac.*, 
              u.first_name, 
              u.last_name, 
              u.email,
              inviter.first_name as inviter_first_name,
              inviter.last_name as inviter_last_name
       FROM activity_collaborators ac
       LEFT JOIN users u ON ac.user_id = u.id
       INNER JOIN users inviter ON ac.invited_by = inviter.id
       WHERE ac.activity_id = ?
       ORDER BY ac.status ASC, ac.invited_at DESC`,
      [activityId]
    );
    return rows;
  }

  /**
   * Get user's collaborated activities
   */
  static async getUserCollaborations(userId) {
    const [rows] = await db.query(
      `SELECT a.*, ac.role as collaboration_role, ac.status as collaboration_status,
              u.first_name as owner_first_name, u.last_name as owner_last_name
       FROM activities a
       INNER JOIN activity_collaborators ac ON a.id = ac.activity_id
       INNER JOIN users u ON a.user_id = u.id
       WHERE ac.user_id = ? AND ac.status = 'accepted'
       ORDER BY a.updated_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Check collaboration permission
   */
  static async checkPermission(activityId, userId, requiredPermission = 'view') {
    // Check if user is owner
    const [owners] = await db.query(
      `SELECT id FROM activities WHERE id = ? AND user_id = ?`,
      [activityId, userId]
    );

    if (owners.length > 0) {
      return true; // Owner has all permissions
    }

    // Check collaboration permissions
    const [collaborators] = await db.query(
      `SELECT role FROM activity_collaborators 
       WHERE activity_id = ? AND user_id = ? AND status = 'accepted'`,
      [activityId, userId]
    );

    if (collaborators.length === 0) {
      return false;
    }

    const role = collaborators[0].role;
    
    switch (requiredPermission) {
      case 'view':
        return ['viewer', 'editor', 'manager'].includes(role);
      case 'edit':
        return ['editor', 'manager'].includes(role);
      case 'manage':
        return ['manager'].includes(role);
      default:
        return false;
    }
  }

  /**
   * Remove collaborator
   */
  static async removeCollaborator(activityId, collaboratorId, removedBy) {
    // Check if remover has permission
    const hasPermission = await this.checkPermission(activityId, removedBy, 'manage');
    
    // Or if owner is removing
    const [owners] = await db.query(
      `SELECT id FROM activities WHERE id = ? AND user_id = ?`,
      [activityId, removedBy]
    );

    if (!hasPermission && owners.length === 0) {
      throw new Error('Insufficient permissions to remove collaborator');
    }

    const [result] = await db.query(
      `DELETE FROM activity_collaborators 
       WHERE activity_id = ? AND user_id = ?`,
      [activityId, collaboratorId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Update collaborator role
   */
  static async updateCollaboratorRole(activityId, collaboratorId, newRole, updatedBy) {
    // Check if updater has permission
    const hasPermission = await this.checkPermission(activityId, updatedBy, 'manage');
    
    // Or if owner is updating
    const [owners] = await db.query(
      `SELECT id FROM activities WHERE id = ? AND user_id = ?`,
      [activityId, updatedBy]
    );

    if (!hasPermission && owners.length === 0) {
      throw new Error('Insufficient permissions to update collaborator role');
    }

    const [result] = await db.query(
      `UPDATE activity_collaborators 
       SET role = ? 
       WHERE activity_id = ? AND user_id = ?`,
      [newRole, activityId, collaboratorId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Get invitation by token
   */
  static async getInvitationByToken(token) {
    const [rows] = await db.query(
      `SELECT ac.*, a.title as activity_title, a.description as activity_description,
              u.first_name as inviter_first_name, u.last_name as inviter_last_name,
              owner.first_name as owner_first_name, owner.last_name as owner_last_name
       FROM activity_collaborators ac
       INNER JOIN activities a ON ac.activity_id = a.id
       INNER JOIN users u ON ac.invited_by = u.id
       INNER JOIN users owner ON a.user_id = owner.id
       WHERE ac.invitation_token = ?`,
      [token]
    );
    return rows[0] || null;
  }

  /**
   * Log collaboration activity
   */
  static async logActivity(activityId, userId, action, details = null) {
    await db.query(
      `INSERT INTO activity_logs (activity_id, user_id, action, details) 
       VALUES (?, ?, ?, ?)`,
      [activityId, userId, action, details ? JSON.stringify(details) : null]
    );
  }

  /**
   * Get collaboration activity logs
   */
  static async getActivityLogs(activityId, limit = 50) {
    const [rows] = await db.query(
      `SELECT al.*, u.first_name, u.last_name
       FROM activity_logs al
       INNER JOIN users u ON al.user_id = u.id
       WHERE al.activity_id = ?
       ORDER BY al.created_at DESC
       LIMIT ?`,
      [activityId, limit]
    );
    return rows;
  }

  /**
   * Create notification
   */
  static async createNotification(userId, type, data) {
    const titles = {
      'activity_collaboration': 'Activity Collaboration Invite',
      'activity_update': 'Activity Updated',
    };

    await db.query(
      `INSERT INTO notifications (user_id, type, title, data) VALUES (?, ?, ?, ?)`,
      [userId, type, titles[type] || 'Notification', JSON.stringify(data)]
    );
  }
}

module.exports = Collaboration;
