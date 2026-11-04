/**
 * Teams Routes
 * Handles team management and operations
 */

const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const Connection = require('../models/Connection');
const Conversation = require('../models/Conversation');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /teams - Get user's teams
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    console.log('Getting teams for user:', req.session.user.id);
    
    let teams = [];
    try {
      teams = await Team.getUserTeams(req.session.user.id);
      console.log('Teams retrieved:', teams ? teams.length : 'null');
    } catch (dbError) {
      console.error('Database error getting teams:', dbError);
      teams = [];
    }
    
    // Ensure teams is always an array
    if (!Array.isArray(teams)) {
      teams = [];
    }
    
    res.render('teams/index', {
      title: 'My Teams',
      teams,
      user: req.session.user
    });

  } catch (error) {
    console.error('Error getting teams:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to load teams',
      user: req.session.user
    });
  }
});

/**
 * GET /teams/create - Show create team form
 */
router.get('/create', requireAuth, (req, res) => {
  res.render('teams/create', {
    title: 'Create Team',
    user: req.session.user
  });
});

/**
 * POST /teams/create - Create new team
 */
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { name, description, privacy } = req.body;

    if (!name || name.trim().length === 0) {
      req.session.error = 'Team name is required';
      return res.redirect('/teams/create');
    }

    const team = await Team.create({
      name: name.trim(),
      description: description?.trim() || null,
      created_by: req.session.user.id,
      is_private: privacy === 'private'
    });

    req.session.success = 'Team created successfully!';
    res.redirect('/teams');

  } catch (error) {
    console.error('Error creating team:', error);
    req.session.error = 'Failed to create team. Please try again.';
    res.redirect('/teams/create');
  }
});

/**
 * GET /teams/:id - View team details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is a member
    const hasPermission = await Team.checkPermission(id, req.session.user.id);
    if (!hasPermission) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'You are not a member of this team',
        user: req.session.user
      });
    }

    const team = await Team.findById(id);
    const members = await Team.getMembers(id);
    const userRole = members.find(m => m.user_id === req.session.user.id)?.role;

    res.render('teams/view', {
      title: team.name,
      team,
      members,
      userRole,
      user: req.session.user
    });

  } catch (error) {
    console.error('Error viewing team:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to load team',
      user: req.session.user
    });
  }
});

/**
 * GET /teams/:id/edit - Show edit team form
 */
router.get('/:id/edit', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user has permission to edit
    const hasPermission = await Team.checkPermission(id, req.session.user.id, ['owner', 'admin']);
    if (!hasPermission) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'You do not have permission to edit this team',
        user: req.session.user
      });
    }

    const team = await Team.findById(id);
    
    res.render('teams/edit', {
      title: `Edit ${team.name}`,
      team,
      user: req.session.user
    });

  } catch (error) {
    console.error('Error loading team edit:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to load team',
      user: req.session.user
    });
  }
});

/**
 * PUT /teams/:id - Update team
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_private } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Team name is required' 
      });
    }

    await Team.update(id, {
      name: name.trim(),
      description: description?.trim() || null,
      is_private: is_private === 'on' || is_private === true
    }, req.session.user.id);

    res.json({ 
      success: true, 
      message: 'Team updated successfully' 
    });

  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update team' 
    });
  }
});

/**
 * DELETE /teams/:id - Delete team
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    await Team.delete(id, req.session.user.id);

    res.json({ 
      success: true, 
      message: 'Team deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to delete team' 
    });
  }
});

/**
 * POST /teams/:id/invite - Invite user to team
 */
router.post('/:id/invite', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role = 'member' } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    await Team.inviteMember(id, userId, req.session.user.id, role);

    res.json({ 
      success: true, 
      message: 'Team invitation sent successfully' 
    });

  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to send invitation' 
    });
  }
});

/**
 * POST /teams/:id/join - Join team (accept invitation)
 */
router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await Team.acceptInvitation(id, req.session.user.id);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Successfully joined the team' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'No pending invitation found' 
      });
    }

  } catch (error) {
    console.error('Error joining team:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to join team' 
    });
  }
});

/**
 * POST /teams/:id/reject - Reject team invitation
 */
router.post('/:id/reject', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await Team.rejectInvitation(id, req.session.user.id);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Team invitation rejected' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'No pending invitation found' 
      });
    }

  } catch (error) {
    console.error('Error rejecting team invitation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reject invitation' 
    });
  }
});

/**
 * DELETE /teams/:id/members/:userId - Remove team member
 */
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { id, userId } = req.params;
    
    await Team.removeMember(id, userId, req.session.user.id);

    res.json({ 
      success: true, 
      message: 'Member removed successfully' 
    });

  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to remove member' 
    });
  }
});

/**
 * PUT /teams/:id/members/:userId/role - Update member role
 */
router.put('/:id/members/:userId/role', requireAuth, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    if (!['member', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role' 
      });
    }

    // Get current members to check roles
    const members = await Team.getMembers(id);
    const currentUser = members.find(m => m.user_id === req.session.user.id);
    const targetUser = members.find(m => m.user_id == userId);

    if (!currentUser || !['owner', 'admin'].includes(currentUser.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions' 
      });
    }

    if (targetUser?.role === 'owner') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot change owner role' 
      });
    }

    await db.query(
      `UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?`,
      [role, id, userId]
    );

    res.json({ 
      success: true, 
      message: 'Member role updated successfully' 
    });

  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update member role' 
    });
  }
});

/**
 * POST /teams/:id/leave - Leave team
 */
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is owner
    const members = await Team.getMembers(id);
    const currentUser = members.find(m => m.user_id === req.session.user.id);

    if (currentUser?.role === 'owner') {
      return res.status(400).json({ 
        success: false, 
        message: 'Team owner cannot leave. Transfer ownership or delete the team.' 
      });
    }

    await Team.removeMember(id, req.session.user.id, req.session.user.id);

    res.json({ 
      success: true, 
      message: 'Successfully left the team' 
    });

  } catch (error) {
    console.error('Error leaving team:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to leave team' 
    });
  }
});

/**
 * GET /teams/search - Search teams
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json({ success: true, teams: [] });
    }

    const teams = await Team.search(q.trim(), req.session.user.id);
    
    res.json({ 
      success: true, 
      teams 
    });

  } catch (error) {
    console.error('Error searching teams:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search teams' 
    });
  }
});

/**
 * GET /teams/join/:inviteCode - Join team by invite code
 */
router.get('/join/:inviteCode', requireAuth, async (req, res) => {
  try {
    const { inviteCode } = req.params;
    
    const team = await Team.findByInviteCode(inviteCode);
    
    if (!team) {
      return res.render('error', {
        title: 'Invalid Invite',
        message: 'This team invitation is invalid or has expired',
        user: req.session.user
      });
    }

    // Check if user is already a member
    const hasPermission = await Team.checkPermission(team.id, req.session.user.id);
    if (hasPermission) {
      return res.redirect(`/teams/${team.id}`);
    }

    res.render('teams/join', {
      title: `Join ${team.name}`,
      team,
      user: req.session.user
    });

  } catch (error) {
    console.error('Error processing team invite:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to process team invitation',
      user: req.session.user
    });
  }
});

/**
 * POST /teams/join/:inviteCode - Accept team invite by code
 */
router.post('/join/:inviteCode', requireAuth, async (req, res) => {
  try {
    const { inviteCode } = req.params;
    
    const team = await Team.findByInviteCode(inviteCode);
    
    if (!team) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired invitation' 
      });
    }

    await Team.addMember(team.id, req.session.user.id, 'member', team.created_by);

    res.json({ 
      success: true, 
      message: `Successfully joined ${team.name}`,
      teamId: team.id
    });

  } catch (error) {
    console.error('Error joining team by invite code:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to join team' 
    });
  }
});

/**
 * GET /teams/:id/chat - Get team chat
 */
router.get('/:id/chat', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is a member
    const hasPermission = await Team.checkPermission(id, req.session.user.id);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    // Get or create team conversation
    const conversationId = await Team.ensureTeamConversation(id);
    
    res.redirect(`/chat/${conversationId}`);

  } catch (error) {
    console.error('Error accessing team chat:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to access team chat' 
    });
  }
});

module.exports = router;
