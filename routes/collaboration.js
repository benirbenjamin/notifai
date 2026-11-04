/**
 * Collaboration Routes
 * Handles activity collaboration features
 */

const express = require('express');
const router = express.Router();
const Collaboration = require('../models/Collaboration');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { requireAuth, checkActivityPermission } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * GET /collaboration/:activityId - Get activity collaborators
 */
router.get('/:activityId', requireAuth, async (req, res) => {
  try {
    const { activityId } = req.params;
    
    // Check if user has permission to view collaborators
    const hasPermission = await checkActivityPermission(activityId, req.session.user.id, 'view');
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'No permission to view collaborators' 
      });
    }

    const collaborators = await Collaboration.getCollaborators(activityId);
    res.json({ success: true, collaborators });

  } catch (error) {
    console.error('Error getting collaborators:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get collaborators' 
    });
  }
});

/**
 * POST /collaboration/:activityId/invite - Invite collaborator
 */
router.post('/:activityId/invite', requireAuth, async (req, res) => {
  try {
    const { activityId } = req.params;
    const { email, role = 'editor' } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    // Check if user has permission to invite
    const hasPermission = await checkActivityPermission(activityId, req.session.user.id, 'manage');
    const activity = await Activity.findById(activityId);
    
    if (!hasPermission && activity.user_id !== req.session.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'No permission to invite collaborators' 
      });
    }

    const invitation = await Collaboration.inviteCollaborator(
      activityId, 
      req.session.user.id, 
      email, 
      role
    );

    // Send invitation email
    const inviteUrl = `${process.env.APP_URL}/auth/collaborate/${invitation.invitation_token}`;
    const user = req.session.user;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `${user.firstName} invited you to collaborate on "${activity.title}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">You're Invited to Collaborate!</h2>
          
          <p>Hi there!</p>
          
          <p><strong>${user.firstName} ${user.lastName}</strong> has invited you to collaborate on the activity:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #333;">${activity.title}</h3>
            ${activity.description ? `<p style="margin: 0; color: #666;">${activity.description}</p>` : ''}
          </div>
          
          <p>Your role: <strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong></p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" 
               style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            If you don't have an account, you can sign up with Google when you click the link above.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          
          <p style="color: #999; font-size: 12px;">
            This invitation was sent by ${process.env.APP_NAME}. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      success: true, 
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        email,
        role,
        needs_signup: invitation.needs_signup
      }
    });

  } catch (error) {
    console.error('Error inviting collaborator:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to send invitation' 
    });
  }
});

/**
 * POST /collaboration/accept/:token - Accept collaboration invitation
 */
router.post('/accept/:token', requireAuth, async (req, res) => {
  try {
    const { token } = req.params;
    
    const invitation = await Collaboration.acceptInvitation(token, req.session.user.id);
    
    res.json({ 
      success: true, 
      message: 'Invitation accepted successfully',
      activityId: invitation.activity_id
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to accept invitation' 
    });
  }
});

/**
 * POST /collaboration/reject/:token - Reject collaboration invitation
 */
router.post('/reject/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const success = await Collaboration.rejectInvitation(token);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Invitation rejected' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired invitation' 
      });
    }

  } catch (error) {
    console.error('Error rejecting invitation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reject invitation' 
    });
  }
});

/**
 * DELETE /collaboration/:activityId/:collaboratorId - Remove collaborator
 */
router.delete('/:activityId/:collaboratorId', requireAuth, async (req, res) => {
  try {
    const { activityId, collaboratorId } = req.params;
    
    const success = await Collaboration.removeCollaborator(
      activityId, 
      collaboratorId, 
      req.session.user.id
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Collaborator removed successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Collaborator not found or already removed' 
      });
    }

  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to remove collaborator' 
    });
  }
});

/**
 * PUT /collaboration/:activityId/:collaboratorId/role - Update collaborator role
 */
router.put('/:activityId/:collaboratorId/role', requireAuth, async (req, res) => {
  try {
    const { activityId, collaboratorId } = req.params;
    const { role } = req.body;

    if (!['viewer', 'editor', 'manager'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role' 
      });
    }
    
    const success = await Collaboration.updateCollaboratorRole(
      activityId, 
      collaboratorId, 
      role,
      req.session.user.id
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Collaborator role updated successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Collaborator not found' 
      });
    }

  } catch (error) {
    console.error('Error updating collaborator role:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update role' 
    });
  }
});

/**
 * GET /collaboration/my-collaborations - Get user's collaborated activities
 */
router.get('/my-collaborations', requireAuth, async (req, res) => {
  try {
    const collaborations = await Collaboration.getUserCollaborations(req.session.user.id);
    
    res.json({ 
      success: true, 
      collaborations 
    });

  } catch (error) {
    console.error('Error getting collaborations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get collaborations' 
    });
  }
});

/**
 * GET /collaboration/:activityId/logs - Get collaboration activity logs
 */
router.get('/:activityId/logs', requireAuth, async (req, res) => {
  try {
    const { activityId } = req.params;
    
    // Check if user has permission to view logs
    const hasPermission = await checkActivityPermission(activityId, req.session.user.id, 'view');
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'No permission to view activity logs' 
      });
    }

    const logs = await Collaboration.getActivityLogs(activityId);
    res.json({ success: true, logs });

  } catch (error) {
    console.error('Error getting activity logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get activity logs' 
    });
  }
});

module.exports = router;
