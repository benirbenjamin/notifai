/**
 * Team Model
 * Handles team operations and management
 */

const db = require('../config/database');

class Team {
  /**
   * Create a new team
   */
  static async create(teamData) {
    const name = teamData.name;
    const description = teamData.description;
    const created_by = teamData.created_by;
    const is_private = teamData.is_private || false;
    const invite_code = this.generateInviteCode();
    
    try {
      // Create team without max_members column (doesn't exist in current schema)
      console.log('Creating team with data:', { name, description, created_by, is_private, invite_code });
      
      const result = await db.query(
        `INSERT INTO teams (name, description, created_by, is_private, invite_code) 
         VALUES (?, ?, ?, ?, ?)`,
        [name, description, created_by, is_private, invite_code]
      );
      
      console.log('Team creation result:', result);
      console.log('Type of result:', typeof result);
      console.log('Is result an array?', Array.isArray(result));
      
      // The result is a ResultSetHeader object, not an array
      console.log('Insert ID from result:', result.insertId);
      
      // Add creator as owner
      await this.addMember(result.insertId, created_by, 'owner', created_by);
      
      return this.findById(result.insertId);
    } catch (error) {
      console.error('Error creating team:', error);
      throw error;
    }
  }

  /**
   * Find team by ID
   */
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT t.*, 
              u.first_name as creator_first_name, 
              u.last_name as creator_last_name,
              COUNT(tm.id) as member_count
       FROM teams t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.status = 'active'
       WHERE t.id = ?
       GROUP BY t.id`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Find team by invite code
   */
  static async findByInviteCode(invite_code) {
    const [rows] = await db.query(
      `SELECT t.*, 
              u.first_name as creator_first_name, 
              u.last_name as creator_last_name
       FROM teams t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.invite_code = ?`,
      [invite_code]
    );
    return rows[0] || null;
  }

  /**
   * Get user's teams
   */
  static async getUserTeams(userId) {
    const [rows] = await db.query(
      `SELECT t.*, 
              tm.role as user_role,
              tm.joined_at,
              u.first_name as creator_first_name,
              u.last_name as creator_last_name,
              COUNT(tm2.id) as member_count
       FROM teams t
       INNER JOIN team_members tm ON t.id = tm.team_id
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN team_members tm2 ON t.id = tm2.team_id AND tm2.status = 'active'
       WHERE tm.user_id = ? AND tm.status = 'active'
       GROUP BY t.id, tm.id
       ORDER BY tm.joined_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Add member to team
   */
  static async addMember(teamId, userId, role = 'member', invitedBy = null) {
    console.log('Adding member:', { teamId, userId, role, invitedBy });
    
    const result = await db.query(
      `INSERT INTO team_members (team_id, user_id, role, invited_by, status) 
       VALUES (?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE 
       role = VALUES(role), 
       status = 'active',
       joined_at = CURRENT_TIMESTAMP`,
      [teamId, userId, role, invitedBy]
    );
    
    console.log('Add member result:', result);
    console.log('Type of result:', typeof result);
    console.log('Is result an array?', Array.isArray(result));
    
    // The result is a ResultSetHeader object, not an array
    console.log('Insert ID or affected rows:', result.insertId || result.affectedRows);
    
    return result.insertId || result.affectedRows;
  }

  /**
   * Invite member to team
   */
  static async inviteMember(teamId, userId, invitedBy, role = 'member') {
    try {
      const [result] = await db.query(
        `INSERT INTO team_members (team_id, user_id, role, invited_by, status) 
         VALUES (?, ?, ?, ?, 'pending')`,
        [teamId, userId, role, invitedBy]
      );

      // Create notification
      await this.createNotification(userId, 'team_invitation', {
        team_id: teamId,
        invited_by: invitedBy,
        role: role
      });

      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('User is already a member or has a pending invitation');
      }
      throw error;
    }
  }

  /**
   * Accept team invitation
   */
  static async acceptInvitation(teamId, userId) {
    const [result] = await db.query(
      `UPDATE team_members 
       SET status = 'active', joined_at = CURRENT_TIMESTAMP 
       WHERE team_id = ? AND user_id = ? AND status = 'pending'`,
      [teamId, userId]
    );

    if (result.affectedRows > 0) {
      // Create team conversation if it doesn't exist
      await this.ensureTeamConversation(teamId);
      return true;
    }
    return false;
  }

  /**
   * Reject team invitation
   */
  static async rejectInvitation(teamId, userId) {
    const [result] = await db.query(
      `DELETE FROM team_members 
       WHERE team_id = ? AND user_id = ? AND status = 'pending'`,
      [teamId, userId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Get team members
   */
  static async getMembers(teamId) {
    const [rows] = await db.query(
      `SELECT tm.*, 
              u.first_name, 
              u.last_name, 
              u.email,
              inviter.first_name as inviter_first_name,
              inviter.last_name as inviter_last_name
       FROM team_members tm
       INNER JOIN users u ON tm.user_id = u.id
       LEFT JOIN users inviter ON tm.invited_by = inviter.id
       WHERE tm.team_id = ?
       ORDER BY 
         CASE tm.role 
           WHEN 'owner' THEN 1 
           WHEN 'admin' THEN 2 
           WHEN 'moderator' THEN 3 
           ELSE 4 
         END,
         tm.joined_at ASC`,
      [teamId]
    );
    return rows;
  }

  /**
   * Remove member from team
   */
  static async removeMember(teamId, userId, removedBy) {
    // Check if user is owner (owners can't be removed)
    const [ownerCheck] = await db.query(
      `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND role = 'owner'`,
      [teamId, userId]
    );

    if (ownerCheck.length > 0) {
      throw new Error('Team owners cannot be removed');
    }

    const [result] = await db.query(
      `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Update team
   */
  static async update(teamId, updateData, userId) {
    // Check if user has permission to update
    const hasPermission = await this.checkPermission(teamId, userId, ['owner', 'admin']);
    if (!hasPermission) {
      throw new Error('Insufficient permissions to update team');
    }

    const { name, description, is_private } = updateData;
    const [result] = await db.query(
      `UPDATE teams 
       SET name = ?, description = ?, is_private = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [name, description, is_private, teamId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Delete team
   */
  static async delete(teamId, userId) {
    // Only owners can delete teams
    const hasPermission = await this.checkPermission(teamId, userId, ['owner']);
    if (!hasPermission) {
      throw new Error('Only team owners can delete teams');
    }

    const [result] = await db.query(
      `DELETE FROM teams WHERE id = ?`,
      [teamId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Check user permission in team
   */
  static async checkPermission(teamId, userId, allowedRoles = []) {
    const [rows] = await db.query(
      `SELECT role FROM team_members 
       WHERE team_id = ? AND user_id = ? AND status = 'active'`,
      [teamId, userId]
    );

    if (rows.length === 0) return false;
    return allowedRoles.length === 0 || allowedRoles.includes(rows[0].role);
  }

  /**
   * Search teams
   */
  static async search(query, userId, limit = 20) {
    const [rows] = await db.query(
      `SELECT t.*, 
              u.first_name as creator_first_name, 
              u.last_name as creator_last_name,
              COUNT(tm.id) as member_count,
              CASE WHEN tm2.user_id IS NOT NULL THEN true ELSE false END as is_member
       FROM teams t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.status = 'active'
       LEFT JOIN team_members tm2 ON t.id = tm2.team_id AND tm2.user_id = ? AND tm2.status = 'active'
       WHERE (t.is_private = false OR tm2.user_id IS NOT NULL)
         AND (t.name LIKE ? OR t.description LIKE ?)
       GROUP BY t.id
       ORDER BY is_member DESC, member_count DESC, t.created_at DESC
       LIMIT ?`,
      [userId, `%${query}%`, `%${query}%`, limit]
    );
    return rows;
  }

  /**
   * Ensure team has a conversation
   */
  static async ensureTeamConversation(teamId) {
    const [existing] = await db.query(
      `SELECT id FROM conversations WHERE type = 'team' AND team_id = ?`,
      [teamId]
    );

    if (existing.length === 0) {
      const team = await this.findById(teamId);
      const [result] = await db.query(
        `INSERT INTO conversations (type, team_id, name, created_by) 
         VALUES ('team', ?, ?, ?)`,
        [teamId, `${team.name} Chat`, team.created_by]
      );

      // Add all active team members to conversation
      const members = await this.getMembers(teamId);
      for (const member of members.filter(m => m.status === 'active')) {
        await db.query(
          `INSERT INTO conversation_participants (conversation_id, user_id, role) 
           VALUES (?, ?, ?)`,
          [result.insertId, member.user_id, member.role === 'owner' ? 'admin' : 'participant']
        );
      }

      return result.insertId;
    }

    return existing[0].id;
  }

  /**
   * Generate unique invite code
   */
  static generateInviteCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  /**
   * Create notification
   */
  static async createNotification(userId, type, data) {
    const titles = {
      'team_invitation': 'Team Invitation',
      'team_update': 'Team Update',
    };

    await db.query(
      `INSERT INTO notifications (user_id, type, title, data) VALUES (?, ?, ?, ?)`,
      [userId, type, titles[type] || 'Notification', JSON.stringify(data)]
    );
  }
}

module.exports = Team;
